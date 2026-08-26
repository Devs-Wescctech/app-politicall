import { and, eq, lte, inArray } from "drizzle-orm";
import { demandDestinations, demandForwardingEvents, demandForwardings, demandHistory, demands, notifications } from "@shared/schema";
import { db } from "../db";
import { classifyForwardingDeadline, FORWARDING_WARNING_HOURS } from "./demand-forwarding-domain";

let schedulerTimer: ReturnType<typeof setInterval> | undefined;
let running = false;

export async function processDemandForwardingAlerts(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + FORWARDING_WARNING_HOURS * 3_600_000);
  const candidates = await db.select({ forwarding: demandForwardings, destinationName: demandDestinations.name, demandProtocol: demands.protocol, demandTitle: demands.title })
    .from(demandForwardings)
    .innerJoin(demandDestinations, eq(demandForwardings.destinationId, demandDestinations.id))
    .innerJoin(demands, eq(demandForwardings.demandId, demands.id))
    .where(and(inArray(demandForwardings.status, ["forwarded", "waiting"]), lte(demandForwardings.dueAt, horizon)));
  let count = 0;
  for (const candidate of candidates) {
    const eventType = classifyForwardingDeadline(candidate.forwarding, now);
    const userId = candidate.forwarding.assigneeUserId;
    if (!eventType || !userId) continue;
    const created = await db.transaction(async (tx: any) => {
      const [reservation] = await tx.insert(demandForwardingEvents).values({ accountId: candidate.forwarding.accountId, forwardingId: candidate.forwarding.id, userId, eventType }).onConflictDoNothing().returning({ id: demandForwardingEvents.id });
      if (!reservation) return false;
      const overdue = eventType === "overdue";
      await tx.insert(notifications).values({ accountId: candidate.forwarding.accountId, userId, type: `forwarding_${eventType}`, title: overdue ? "Encaminhamento vencido" : "Encaminhamento vence em breve", message: `${candidate.demandProtocol || candidate.demandTitle}: ${candidate.destinationName}`, priority: overdue ? "high" : "medium", isRead: false, link: `/demands?demandId=${candidate.forwarding.demandId}` });
      await tx.insert(demandHistory).values({ accountId: candidate.forwarding.accountId, demandId: candidate.forwarding.demandId, userId, eventType: `forwarding_${eventType}`, metadata: { forwardingId: candidate.forwarding.id, destinationName: candidate.destinationName, dueAt: candidate.forwarding.dueAt?.toISOString() } });
      return true;
    });
    if (created) count += 1;
  }
  return count;
}

export function startDemandForwardingScheduler(intervalMs = Number(process.env.DEMAND_FORWARDING_CHECK_INTERVAL_MS) || 300_000) {
  if (schedulerTimer) return schedulerTimer;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processDemandForwardingAlerts(); } catch (error) { console.error("Demand forwarding automation failed:", error); } finally { running = false; }
  };
  void tick();
  schedulerTimer = setInterval(() => { void tick(); }, Math.max(intervalMs, 30_000));
  schedulerTimer.unref?.();
  return schedulerTimer;
}
