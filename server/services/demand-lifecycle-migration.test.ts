import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand lifecycle migration", () => {
  const sql = readFileSync("migrations/0016_demand_lifecycle_automation.sql", "utf8");

  it("creates account-scoped attachment metadata and an idempotent automation ledger", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS demand_attachments");
    expect(sql).toContain("account_id varchar NOT NULL");
    expect(sql).toContain("size_bytes > 0 AND size_bytes <= 10485760");
    expect(sql).toContain("demand_automation_events_once_uidx");
    expect(sql).toContain("(account_id, demand_id, event_type)");
  });
});
