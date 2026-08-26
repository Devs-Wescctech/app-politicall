import { and, lte, notInArray } from "drizzle-orm";
import { demandAutomationEvents, demandHistory, demands, notifications } from "@shared/schema";
import { db } from "../db";
import { classifyDemandSlaAlert, DEMAND_SLA_WARNING_HOURS } from "./demand-automation-domain";

let schedulerTimer: ReturnType<typeof setInterval> | undefined;
let running = false;

export async function processDemandSlaAlerts(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + DEMAND_SLA_WARNING_HOURS * 60 * 60 * 1000);
  const candidates = await db.select().from(demands).where(and(
    notInArray(demands.status, ["completed", "cancelled"]),
    lte(demands.slaDueAt, horizon),
  ));
  let createdCount = 0;
  for (const demand of candidates) {
    const eventType = classifyDemandSlaAlert(demand, now);
    if (!eventType || !demand.assigneeUserId) continue;
    const created = await db.transaction(async (tx: any) => {
      const [reservation] = await tx.insert(demandAutomationEvents).values({
        accountId: demand.accountId, demandId: demand.id, userId: demand.assigneeUserId, eventType,
      }).onConflictDoNothing().returning({ id: demandAutomationEvents.id });
      if (!reservation) return false;
      const overdue = eventType === "sla_overdue";
      await tx.insert(notifications).values({
        accountId: demand.accountId, userId: demand.assigneeUserId, type: eventType,
        title: overdue ? "SLA de demanda vencido" : "SLA de demanda vence em breve",
        message: `${demand.protocol || demand.title}: ${demand.title}`,
        priority: overdue ? "high" : "medium", isRead: false,
        link: `/demands?demandId=${demand.id}`,
      });
      await tx.insert(demandHistory).values({
        accountId: demand.accountId, demandId: demand.id, userId: demand.assigneeUserId,
        eventType, metadata: { slaDueAt: demand.slaDueAt?.toISOString() },
      });
      return true;
    });
    if (created) createdCount += 1;
  }
  return createdCount;
}
export function startDemandSlaScheduler(intervalMs = Number(process.env.DEMAND_SLA_CHECK_INTERVAL_MS) || 5 * 60 * 1000) {
  if (schedulerTimer) return schedulerTimer;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processDemandSlaAlerts(); }
    catch (error) { console.error("Demand SLA automation failed:", error); }
    finally { running = false; }
  };
  void tick();
  schedulerTimer = setInterval(() => { void tick(); }, Math.max(intervalMs, 30_000));
  schedulerTimer.unref?.();
  return schedulerTimer;
}
