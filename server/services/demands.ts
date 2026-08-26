import { and, asc, eq, sql } from "drizzle-orm";
import {
  contacts,
  demandCategories,
  demandHistory,
  demandForwardings,
  demandProtocolCounters,
  demands,
  events,
  notifications,
  users,
  type InsertDemand,
} from "@shared/schema";
import { db } from "../db";
import { buildDemandProtocol, buildDemandSummary, calculateSlaDueAt, isDemandActive, validateDemandInput } from "./demand-domain";
import { buildDemandChangeNotification } from "./demand-automation-domain";

export class DemandDomainError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400) {
    super(message);
  }
}

async function assertAccountLinks(accountId: string, input: Partial<InsertDemand>, executor: any = db) {
  const checks: Promise<unknown>[] = [];
  if (input.contactId) checks.push(executor.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.accountId, accountId))).then((rows: unknown[]) => {
    if (!rows.length) throw new DemandDomainError("Eleitor nao encontrado nesta conta", "CONTACT_NOT_FOUND", 404);
  }));
  if (input.categoryId) checks.push(executor.select({ id: demandCategories.id }).from(demandCategories).where(and(eq(demandCategories.id, input.categoryId), eq(demandCategories.accountId, accountId))).then((rows: unknown[]) => {
    if (!rows.length) throw new DemandDomainError("Categoria nao encontrada nesta conta", "CATEGORY_NOT_FOUND", 404);
  }));
  if (input.assigneeUserId) checks.push(executor.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeUserId), eq(users.accountId, accountId))).then((rows: unknown[]) => {
    if (!rows.length) throw new DemandDomainError("Responsavel nao encontrado nesta conta", "ASSIGNEE_NOT_FOUND", 404);
  }));
  await Promise.all(checks);
}

async function categorySlaHours(accountId: string, categoryId: string | null | undefined, executor: any = db) {
  if (!categoryId) return null;
  const [category] = await executor.select({ slaHours: demandCategories.slaHours }).from(demandCategories)
    .where(and(eq(demandCategories.id, categoryId), eq(demandCategories.accountId, accountId)));
  return category?.slaHours ?? null;
}

export async function listDemands(accountId: string) {
  const [rows, categories, accountContacts, accountUsers] = await Promise.all([
    db.select().from(demands).where(eq(demands.accountId, accountId)).orderBy(sql`${demands.createdAt} DESC`),
    db.select().from(demandCategories).where(eq(demandCategories.accountId, accountId)),
    db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(eq(contacts.accountId, accountId)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, accountId)),
  ]);
  const categoryMap = new Map(categories.map((item: any) => [item.id, item]));
  const contactMap = new Map(accountContacts.map((item: any) => [item.id, item]));
  const userMap = new Map(accountUsers.map((item: any) => [item.id, item]));
  return rows.map((demand: any) => ({
    ...demand,
    category: demand.categoryId ? categoryMap.get(demand.categoryId) ?? null : null,
    contact: demand.contactId ? contactMap.get(demand.contactId) ?? null : null,
    assigneeUser: demand.assigneeUserId ? userMap.get(demand.assigneeUserId) ?? null : null,
  }));
}

export async function createDemand(accountId: string, userId: string, input: InsertDemand) {
  const normalized = {
    ...input,
    kind: input.kind ?? "internal",
    origin: input.origin ?? "manual",
    status: input.status === "pending" ? "open" : input.status,
    assigneeUserId: input.assigneeUserId ?? userId,
  };
  validateDemandInput(normalized);
  await assertAccountLinks(accountId, normalized);

  return db.transaction(async (tx: any) => {
    const createdAt = new Date();
    const year = createdAt.getUTCFullYear();
    const counterResult: any = await tx.execute(sql`
      INSERT INTO ${demandProtocolCounters} (account_id, year, last_value)
      VALUES (${accountId}, ${year}, 1)
      ON CONFLICT (account_id, year)
      DO UPDATE SET last_value = demand_protocol_counters.last_value + 1
      RETURNING last_value
    `);
    const sequence = Number(counterResult.rows?.[0]?.last_value ?? counterResult[0]?.last_value);
    const slaHours = await categorySlaHours(accountId, normalized.categoryId, tx);
    const [created] = await tx.insert(demands).values({
      ...normalized,
      accountId,
      userId,
      protocol: buildDemandProtocol(year, sequence),
      dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null,
      slaDueAt: slaHours ? calculateSlaDueAt(createdAt, slaHours) : null,
      completedAt: normalized.status === "completed" ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    }).returning();
    await tx.insert(demandHistory).values({ accountId, demandId: created.id, userId, eventType: "created", toValue: created.status });
    return created;
  });
}

const AUDITED_FIELDS = ["status", "priority", "categoryId", "assigneeUserId", "contactId", "dueDate"] as const;

export async function updateDemand(accountId: string, userId: string, demandId: string, input: Partial<InsertDemand>) {
  const [existing] = await db.select().from(demands).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId)));
  if (!existing) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
  const normalized = { ...input, status: input.status === "pending" ? "open" : input.status };
  const merged = { ...existing, ...normalized };
  validateDemandInput({ kind: merged.kind as "external" | "internal", contactId: merged.contactId, categoryId: merged.categoryId, assigneeUserId: merged.assigneeUserId });
  await assertAccountLinks(accountId, normalized);
  const slaHours = normalized.categoryId ? await categorySlaHours(accountId, normalized.categoryId) : null;
  const nextStatus = normalized.status ?? existing.status;
  const completedAt = nextStatus === "completed" ? existing.completedAt ?? new Date() : isDemandActive(nextStatus) ? null : existing.completedAt;
  const updateData = {
    ...normalized,
    dueDate: normalized.dueDate ? new Date(normalized.dueDate) : normalized.dueDate === null ? null : undefined,
    slaDueAt: slaHours ? calculateSlaDueAt(existing.createdAt, slaHours) : undefined,
    completedAt,
    updatedAt: new Date(),
  };

  return db.transaction(async (tx: any) => {
    const [updated] = await tx.update(demands).set(updateData).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId))).returning();
    for (const field of AUDITED_FIELDS) {
      const before = existing[field];
      const after = updated[field];
      if (String(before ?? "") !== String(after ?? "")) {
        await tx.insert(demandHistory).values({ accountId, demandId, userId, eventType: `${field}_changed`, fromValue: before == null ? null : String(before), toValue: after == null ? null : String(after) });
      }
    }
    const notification = buildDemandChangeNotification({
      demandId: updated.id,
      actorUserId: userId,
      previousAssigneeUserId: existing.assigneeUserId,
      assigneeUserId: updated.assigneeUserId,
      previousStatus: existing.status,
      status: updated.status,
      protocol: updated.protocol,
      title: updated.title,
    });
    if (notification) {
      await tx.insert(notifications).values({ ...notification, accountId, type: "demand_changed", isRead: false });
    }
    return updated;
  });
}

export async function getDemandHistory(accountId: string, demandId: string) {
  const [owned] = await db.select({ id: demands.id }).from(demands).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId)));
  if (!owned) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
  const rows = await db.select({
    id: demandHistory.id,
    eventType: demandHistory.eventType,
    fromValue: demandHistory.fromValue,
    toValue: demandHistory.toValue,
    metadata: demandHistory.metadata,
    createdAt: demandHistory.createdAt,
    userName: users.name,
  }).from(demandHistory).leftJoin(users, eq(demandHistory.userId, users.id))
    .where(and(eq(demandHistory.accountId, accountId), eq(demandHistory.demandId, demandId))).orderBy(asc(demandHistory.createdAt));
  return rows;
}

export async function getDemandSummary(accountId: string) {
  const rows = await db.select({ status: demands.status, priority: demands.priority, slaDueAt: demands.slaDueAt, createdAt: demands.createdAt, completedAt: demands.completedAt })
    .from(demands).where(eq(demands.accountId, accountId));
  return buildDemandSummary(rows);
}

export async function createDemandFollowUp(accountId: string, userId: string, demandId: string, input: { forwardingId?: string; startDate: string; endDate: string; title?: string; reminderMinutes?: number }) {
  const [demand] = await db.select().from(demands).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId)));
  if (!demand) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
  if (input.forwardingId) {
    const [forwarding] = await db.select({ id: demandForwardings.id }).from(demandForwardings).where(and(
      eq(demandForwardings.id, input.forwardingId),
      eq(demandForwardings.demandId, demandId),
      eq(demandForwardings.accountId, accountId),
    ));
    if (!forwarding) throw new DemandDomainError("Encaminhamento nao encontrado", "FORWARDING_NOT_FOUND", 404);
  }
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new DemandDomainError("Periodo do compromisso e invalido", "INVALID_EVENT_PERIOD");
  }
  const [event] = await db.insert(events).values({
    accountId, userId, demandId, contactId: demand.contactId,
    title: input.title?.trim() || `Retorno ${demand.protocol ?? demand.title}`,
    description: demand.title,
    startDate, endDate, category: "deadline",
    reminder: input.reminderMinutes != null,
    reminderMinutes: input.reminderMinutes ?? null,
  }).returning();
  await db.insert(demandHistory).values({
    accountId,
    demandId,
    userId,
    eventType: "follow_up_created",
    toValue: event.id,
    metadata: input.forwardingId ? { forwardingId: input.forwardingId } : null,
  });
  return event;
}

export async function deleteDemand(accountId: string, demandId: string) {
  const deleted = await db.delete(demands).where(and(eq(demands.id, demandId), eq(demands.accountId, accountId))).returning({ id: demands.id });
  if (!deleted.length) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
}
