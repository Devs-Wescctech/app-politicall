import { and, asc, eq, getTableColumns } from "drizzle-orm";
import {
  demandDestinations,
  demandForwardings,
  demandHistory,
  demands,
  notifications,
  users,
  type InsertDemandForwarding,
} from "@shared/schema";
import { db } from "../db";
import { DemandDomainError } from "./demands";
import {
  buildCitizenUpdateDraft,
  calculateForwardingDueAt,
  classifyForwardingDeadline,
  type ForwardingStatus,
  validateForwardingTransition,
} from "./demand-forwarding-domain";

type ForwardingDateInput = {
  status: ForwardingStatus;
  defaultDeadlineHours: number;
  now?: Date;
  sentAt?: Date | null;
  dueAt?: Date | null;
  explicitDueAt?: string | Date | null;
  answeredAt?: Date | null;
  completedAt?: Date | null;
};

export function deriveForwardingDates(input: ForwardingDateInput) {
  const now = input.now ?? new Date();
  if (input.status === "draft") return { sentAt: null, dueAt: null, answeredAt: null, completedAt: null };
  const sentAt = input.sentAt ?? now;
  const dueAt = input.explicitDueAt
    ? calculateForwardingDueAt(sentAt, input.defaultDeadlineHours, input.explicitDueAt)
    : input.dueAt ?? calculateForwardingDueAt(sentAt, input.defaultDeadlineHours);
  return {
    sentAt,
    dueAt,
    answeredAt: input.answeredAt ?? (input.status === "answered" ? now : null),
    completedAt: input.completedAt ?? (input.status === "completed" ? now : null),
  };
}

async function ownedDemand(accountId: string, demandId: string) {
  const [demand] = await db.select().from(demands).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId)));
  if (!demand) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
  return demand;
}

async function ownedDestination(accountId: string, destinationId: string, requireActive = false) {
  const [destination] = await db.select().from(demandDestinations).where(and(
    eq(demandDestinations.id, destinationId), eq(demandDestinations.accountId, accountId),
  ));
  if (!destination) throw new DemandDomainError("Destino nao encontrado", "DESTINATION_NOT_FOUND", 404);
  if (requireActive && !destination.active) throw new DemandDomainError("Destino inativo", "DESTINATION_INACTIVE", 400);
  return destination;
}

async function assertOwnedAssignee(accountId: string, assigneeUserId?: string | null) {
  if (!assigneeUserId) return;
  const [assignee] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, assigneeUserId), eq(users.accountId, accountId)));
  if (!assignee) throw new DemandDomainError("Responsavel nao encontrado nesta conta", "ASSIGNEE_NOT_FOUND", 404);
}

async function ownedForwarding(accountId: string, demandId: string, forwardingId: string) {
  const [forwarding] = await db.select().from(demandForwardings).where(and(
    eq(demandForwardings.id, forwardingId), eq(demandForwardings.demandId, demandId), eq(demandForwardings.accountId, accountId),
  ));
  if (!forwarding) throw new DemandDomainError("Encaminhamento nao encontrado", "FORWARDING_NOT_FOUND", 404);
  return forwarding;
}

export async function listDemandForwardings(accountId: string, demandId: string) {
  await ownedDemand(accountId, demandId);
  const rows = await db.select({
    ...getTableColumns(demandForwardings),
    destination: {
      id: demandDestinations.id, kind: demandDestinations.kind, name: demandDestinations.name,
      contactName: demandDestinations.contactName, phone: demandDestinations.phone, email: demandDestinations.email,
      responseDeadlineHours: demandDestinations.responseDeadlineHours, active: demandDestinations.active,
    },
    assigneeUser: { id: users.id, name: users.name, role: users.role },
  }).from(demandForwardings)
    .innerJoin(demandDestinations, eq(demandForwardings.destinationId, demandDestinations.id))
    .leftJoin(users, eq(demandForwardings.assigneeUserId, users.id))
    .where(and(eq(demandForwardings.accountId, accountId), eq(demandForwardings.demandId, demandId)))
    .orderBy(asc(demandForwardings.createdAt));
  return rows.map((item: typeof rows[number]) => ({ ...item, deadlineState: classifyForwardingDeadline(item) }));
}

export async function createDemandForwarding(
  accountId: string,
  userId: string,
  demandId: string,
  input: InsertDemandForwarding,
) {
  const demand = await ownedDemand(accountId, demandId);
  const destination = await ownedDestination(accountId, input.destinationId, true);
  await assertOwnedAssignee(accountId, input.assigneeUserId);
  const status = (input.status ?? "draft") as ForwardingStatus;
  validateForwardingTransition("draft", status);
  const dates = deriveForwardingDates({
    status, defaultDeadlineHours: destination.responseDeadlineHours, explicitDueAt: input.dueAt,
  });
  return db.transaction(async (tx: any) => {
    const [created] = await tx.insert(demandForwardings).values({
      ...input,
      accountId,
      demandId,
      createdByUserId: userId,
      status,
      dueAt: dates.dueAt,
      sentAt: dates.sentAt,
      answeredAt: dates.answeredAt,
      completedAt: dates.completedAt,
    }).returning();
    await tx.insert(demandHistory).values({
      accountId, demandId, userId,
      eventType: status === "draft" ? "forwarding_created" : "forwarding_forwarded",
      toValue: created.id,
      metadata: { forwardingId: created.id, destinationId: destination.id, destinationName: destination.name, status },
    });
    if (created.assigneeUserId && created.assigneeUserId !== userId) {
      await tx.insert(notifications).values({
        accountId, userId: created.assigneeUserId, type: "demand_forwarding_assigned",
        title: "Novo encaminhamento atribuido",
        message: `${demand.protocol || demand.title}: ${destination.name}`,
        priority: created.priority === "urgent" ? "high" : "medium", isRead: false,
        link: `/demands?demandId=${demandId}`,
      });
    }
    return created;
  });
}

export async function updateDemandForwarding(
  accountId: string,
  userId: string,
  demandId: string,
  forwardingId: string,
  input: Partial<InsertDemandForwarding>,
) {
  const demand = await ownedDemand(accountId, demandId);
  const existing = await ownedForwarding(accountId, demandId, forwardingId);
  const destination = await ownedDestination(accountId, input.destinationId ?? existing.destinationId, input.destinationId !== undefined);
  await assertOwnedAssignee(accountId, input.assigneeUserId);
  const nextStatus = (input.status ?? existing.status) as ForwardingStatus;
  try { validateForwardingTransition(existing.status as ForwardingStatus, nextStatus); }
  catch { throw new DemandDomainError("Transicao de encaminhamento invalida", "FORWARDING_INVALID_TRANSITION", 400); }
  const response = input.response === undefined ? existing.response : input.response;
  if (nextStatus === "answered" && !response?.trim()) {
    throw new DemandDomainError("Registre a resposta recebida", "FORWARDING_RESPONSE_REQUIRED", 400);
  }
  let dates;
  try {
    dates = deriveForwardingDates({
      status: nextStatus,
      defaultDeadlineHours: destination.responseDeadlineHours,
      explicitDueAt: input.dueAt,
      sentAt: existing.sentAt,
      dueAt: input.dueAt === null ? null : existing.dueAt,
      answeredAt: existing.answeredAt,
      completedAt: existing.completedAt,
    });
  } catch (error) {
    throw new DemandDomainError(error instanceof Error ? error.message : "Prazo invalido", "FORWARDING_INVALID_DUE_AT", 400);
  }
  const updateValues = {
    ...input,
    destinationId: input.destinationId ?? existing.destinationId,
    status: nextStatus,
    dueAt: dates.dueAt,
    sentAt: dates.sentAt,
    answeredAt: dates.answeredAt,
    completedAt: dates.completedAt,
    updatedAt: new Date(),
  };
  return db.transaction(async (tx: any) => {
    const [updated] = await tx.update(demandForwardings).set(updateValues).where(and(
      eq(demandForwardings.id, forwardingId), eq(demandForwardings.accountId, accountId),
    )).returning();
    const statusChanged = existing.status !== updated.status;
    await tx.insert(demandHistory).values({
      accountId, demandId, userId,
      eventType: statusChanged ? "forwarding_status_changed" : "forwarding_updated",
      fromValue: statusChanged ? existing.status : null,
      toValue: statusChanged ? updated.status : updated.id,
      metadata: { forwardingId: updated.id, destinationId: destination.id, destinationName: destination.name },
    });
    const newlyAssigned = updated.assigneeUserId && updated.assigneeUserId !== userId && updated.assigneeUserId !== existing.assigneeUserId;
    if (newlyAssigned) {
      await tx.insert(notifications).values({
        accountId, userId: updated.assigneeUserId, type: "demand_forwarding_assigned",
        title: "Encaminhamento transferido para voce",
        message: `${demand.protocol || demand.title}: ${destination.name}`,
        priority: updated.priority === "urgent" ? "high" : "medium", isRead: false,
        link: `/demands?demandId=${demandId}`,
      });
    }
    return updated;
  });
}

export async function createForwardingCitizenDraft(accountId: string, demandId: string, forwardingId: string) {
  const demand = await ownedDemand(accountId, demandId);
  const forwarding = await ownedForwarding(accountId, demandId, forwardingId);
  const destination = await ownedDestination(accountId, forwarding.destinationId);
  return {
    forwardingId,
    demandId,
    contactId: demand.contactId,
    text: buildCitizenUpdateDraft({
      demandProtocol: demand.protocol,
      demandTitle: demand.title,
      destinationName: destination.name,
      status: forwarding.status as ForwardingStatus,
      response: forwarding.response,
    }),
  };
}
