import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand forwarding workflow migration", () => {
  const sql = readFileSync("migrations/0017_demand_forwarding_workflow.sql", "utf8");

  it("creates account-scoped destinations, forwardings and an idempotent alert ledger", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS demand_destinations");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS demand_destinations_name_uidx");
    expect(sql).toContain("(account_id, kind, lower(name))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS demand_forwardings");
    expect(sql).toContain("demand_forwardings_account_demand_idx");
    expect(sql).toContain("demand_forwardings_account_due_idx");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS demand_forwarding_events");
    expect(sql).toContain("demand_forwarding_events_once_uidx");
    expect(sql).toContain("(account_id, forwarding_id, event_type)");
  });
});
