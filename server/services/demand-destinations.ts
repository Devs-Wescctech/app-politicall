import { and, asc, eq } from "drizzle-orm";
import { demandDestinations, type InsertDemandDestination } from "@shared/schema";
import { db } from "../db";
import { DemandDomainError } from "./demands";

type DestinationInput = InsertDemandDestination;

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizeDemandDestinationInput(input: DestinationInput): DestinationInput {
  return {
    ...input,
    name: input.name.trim(),
    description: optionalText(input.description),
    contactName: optionalText(input.contactName),
    phone: optionalText(input.phone),
    email: optionalText(input.email)?.toLowerCase() ?? null,
  };
}

export function isDemandDestinationDuplicateError(error: unknown): boolean {
  const candidate = error as { code?: string; constraint?: string };
  return candidate?.code === "23505" && candidate.constraint === "demand_destinations_name_uidx";
}

export async function listDemandDestinations(
  accountId: string,
  filters: { kind?: "internal" | "external"; active?: boolean } = {},
) {
  const conditions = [eq(demandDestinations.accountId, accountId)];
  if (filters.kind) conditions.push(eq(demandDestinations.kind, filters.kind));
  if (filters.active !== undefined) conditions.push(eq(demandDestinations.active, filters.active));
  return db.select().from(demandDestinations).where(and(...conditions)).orderBy(asc(demandDestinations.name));
}

export async function createDemandDestination(accountId: string, userId: string, input: DestinationInput) {
  try {
    const [created] = await db.insert(demandDestinations).values({
      ...normalizeDemandDestinationInput(input), accountId, createdByUserId: userId,
    }).returning();
    return created;
  } catch (error) {
    if (isDemandDestinationDuplicateError(error)) {
      throw new DemandDomainError("Ja existe um destino com este nome e tipo", "DESTINATION_DUPLICATE", 409);
    }
    throw error;
  }
}

export async function updateDemandDestination(accountId: string, destinationId: string, input: Partial<DestinationInput>) {
  try {
    const normalized = normalizeDemandDestinationInput({
      kind: input.kind ?? "internal",
      name: input.name ?? "placeholder",
      responseDeadlineHours: input.responseDeadlineHours ?? 72,
      active: input.active ?? true,
      description: input.description,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
    });
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["kind", "name", "description", "contactName", "phone", "email", "responseDeadlineHours", "active"] as const) {
      if (input[key] !== undefined) values[key] = normalized[key];
    }
    const [updated] = await db.update(demandDestinations).set(values)
      .where(and(eq(demandDestinations.id, destinationId), eq(demandDestinations.accountId, accountId))).returning();
    if (!updated) throw new DemandDomainError("Destino nao encontrado", "DESTINATION_NOT_FOUND", 404);
    return updated;
  } catch (error) {
    if (isDemandDestinationDuplicateError(error)) {
      throw new DemandDomainError("Ja existe um destino com este nome e tipo", "DESTINATION_DUPLICATE", 409);
    }
    throw error;
  }
}
