import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./attendance-routes.ts", import.meta.url), "utf8");

function createNewConversationInsert() {
  const routeStart = source.indexOf('app.post("/api/attendance/conversations/create-new"');
  const insertStart = source.indexOf("storage.createConversation({", routeStart);
  const insertEnd = source.indexOf("});", insertStart);

  expect(routeStart).toBeGreaterThanOrEqual(0);
  expect(insertStart).toBeGreaterThan(routeStart);
  expect(insertEnd).toBeGreaterThan(insertStart);
  return source.slice(insertStart, insertEnd);
}

describe("POST /api/attendance/conversations/create-new", () => {
  it("creates the conversation in manual mode assigned to the authenticated initiator", () => {
    const insert = createNewConversationInsert();

    expect(insert).toContain('mode: "manual"');
    expect(insert).toContain('status: "in_progress"');
    expect(insert).toContain("assignedUserId: req.userId!");
    expect(insert).toContain("assignedByUserId: req.userId!");
    expect(insert).toContain("assignedAt: initiatedAt");
    expect(insert).not.toContain('mode: "automatic"');
    expect(insert).not.toContain('status: "automatic"');
  });
});
