import { and, asc, eq, gte, inArray, lte, min, ne } from "drizzle-orm";
import {
  contacts,
  demandCategories,
  demandDestinations,
  demandForwardings,
  demandHistory,
  demands,
  users,
} from "@shared/schema";
import { db } from "../db";
import {
  buildDemandOperationsReport,
  type DemandDeadlineState,
  type DemandOperationFilters,
  type DemandOperationSnapshot,
} from "./demand-operations-domain";

const DEADLINE_STATES = new Set<DemandDeadlineState>(["all", "forwarding_overdue", "demand_overdue", "due_soon", "stale", "active"]);

export class DemandOperationsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemandOperationsInputError";
  }
}

type QueryValues = Record<string, unknown>;

function value(query: QueryValues, key: string) {
  const raw = query[key];
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim() || undefined;
  return raw == null ? undefined : String(raw).trim() || undefined;
}

function parseBoundary(raw: string | undefined, endOfDay: boolean, fallback: Date, label: string) {
  if (!raw) return fallback;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = new Date(dateOnly ? `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : raw);
  if (!Number.isFinite(parsed.getTime())) throw new DemandOperationsInputError(`${label} invalido`);
  return parsed;
}

export function normalizeDemandOperationFilters(query: QueryValues, now = new Date()): DemandOperationFilters {
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const defaultTo = new Date(now);
  defaultTo.setUTCHours(23, 59, 59, 999);
  const from = parseBoundary(value(query, "from"), false, defaultFrom, "Periodo inicial");
  const to = parseBoundary(value(query, "to"), true, defaultTo, "Periodo final");
  if (from > to) throw new DemandOperationsInputError("Periodo inicial deve ser anterior ao final");
  const page = Number(value(query, "page") ?? 1);
  const pageSize = Number(value(query, "pageSize") ?? 25);
  if (!Number.isInteger(page) || page < 1) throw new DemandOperationsInputError("Pagina invalida");
  if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 100) throw new DemandOperationsInputError("Tamanho de pagina invalido");
  const deadlineState = value(query, "deadlineState") as DemandDeadlineState | undefined;
  if (deadlineState && !DEADLINE_STATES.has(deadlineState)) throw new DemandOperationsInputError("Estado de prazo invalido");
  const optional = (key: string) => value(query, key);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...(optional("categoryId") ? { categoryId: optional("categoryId") } : {}),
    ...(optional("destinationId") ? { destinationId: optional("destinationId") } : {}),
    ...(optional("assigneeUserId") ? { assigneeUserId: optional("assigneeUserId") } : {}),
    ...(optional("demandStatus") ? { demandStatus: optional("demandStatus") } : {}),
    ...(optional("forwardingStatus") ? { forwardingStatus: optional("forwardingStatus") } : {}),
    ...(deadlineState ? { deadlineState } : {}),
    ...(optional("search") ? { search: optional("search") } : {}),
    page,
    pageSize,
  };
}

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

export async function getDemandOperations(accountId: string, filters: DemandOperationFilters) {
  const demandRows = await db.select({
    id: demands.id,
    protocol: demands.protocol,
    title: demands.title,
    status: demands.status,
    priority: demands.priority,
    categoryId: demands.categoryId,
    categoryName: demandCategories.name,
    contactName: contacts.name,
    assigneeUserId: demands.assigneeUserId,
    assigneeName: users.name,
    createdAt: demands.createdAt,
    updatedAt: demands.updatedAt,
    slaDueAt: demands.slaDueAt,
    completedAt: demands.completedAt,
  }).from(demands)
    .leftJoin(demandCategories, eq(demands.categoryId, demandCategories.id))
    .leftJoin(contacts, eq(demands.contactId, contacts.id))
    .leftJoin(users, eq(demands.assigneeUserId, users.id))
    .where(and(
      eq(demands.accountId, accountId),
      gte(demands.createdAt, new Date(filters.from)),
      lte(demands.createdAt, new Date(filters.to)),
    ))
    .orderBy(asc(demands.createdAt));

  if (!demandRows.length) return buildDemandOperationsReport([], filters);
  const demandIds = demandRows.map((row: typeof demandRows[number]) => row.id);
  const [forwardingRows, historyRows] = await Promise.all([
    db.select({
      id: demandForwardings.id,
      demandId: demandForwardings.demandId,
      status: demandForwardings.status,
      destinationId: demandForwardings.destinationId,
      destinationName: demandDestinations.name,
      assigneeUserId: demandForwardings.assigneeUserId,
      assigneeName: users.name,
      sentAt: demandForwardings.sentAt,
      dueAt: demandForwardings.dueAt,
      answeredAt: demandForwardings.answeredAt,
    }).from(demandForwardings)
      .innerJoin(demandDestinations, eq(demandForwardings.destinationId, demandDestinations.id))
      .leftJoin(users, eq(demandForwardings.assigneeUserId, users.id))
      .where(and(eq(demandForwardings.accountId, accountId), inArray(demandForwardings.demandId, demandIds)))
      .orderBy(asc(demandForwardings.createdAt)),
    db.select({ demandId: demandHistory.demandId, firstMovementAt: min(demandHistory.createdAt) })
      .from(demandHistory)
      .where(and(
        eq(demandHistory.accountId, accountId),
        inArray(demandHistory.demandId, demandIds),
        ne(demandHistory.eventType, "created"),
      ))
      .groupBy(demandHistory.demandId),
  ]);

  const firstMovementByDemand = new Map(historyRows.map((row: typeof historyRows[number]) => [row.demandId, iso(row.firstMovementAt)]));
  const forwardingsByDemand = new Map<string, DemandOperationSnapshot["forwardings"]>();
  for (const row of forwardingRows) {
    const collection = forwardingsByDemand.get(row.demandId) ?? [];
    collection.push({
      id: row.id,
      status: row.status,
      destinationId: row.destinationId,
      destinationName: row.destinationName,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assigneeName,
      sentAt: iso(row.sentAt),
      dueAt: iso(row.dueAt),
      answeredAt: iso(row.answeredAt),
    });
    forwardingsByDemand.set(row.demandId, collection);
  }
  const snapshots: DemandOperationSnapshot[] = demandRows.map((row: typeof demandRows[number]) => ({
    id: row.id,
    protocol: row.protocol,
    title: row.title,
    status: row.status,
    priority: row.priority,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    contactName: row.contactName,
    assigneeUserId: row.assigneeUserId,
    assigneeName: row.assigneeName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    slaDueAt: iso(row.slaDueAt),
    completedAt: iso(row.completedAt),
    firstMovementAt: firstMovementByDemand.get(row.id) ?? null,
    forwardings: forwardingsByDemand.get(row.id) ?? [],
  }));
  return buildDemandOperationsReport(snapshots, filters);
}
