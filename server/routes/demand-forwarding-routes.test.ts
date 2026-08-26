import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand forwarding routes", () => {
  const source = readFileSync("server/routes/demand-routes.ts", "utf8");

  it("exposes nested authenticated forwarding and message draft contracts", () => {
    expect(source).toContain('app.get("/api/demands/:id/forwardings", ...guard');
    expect(source).toContain('app.post("/api/demands/:id/forwardings", ...guard');
    expect(source).toContain('app.patch("/api/demands/:id/forwardings/:forwardingId", ...guard');
    expect(source).toContain('app.post("/api/demands/:id/forwardings/:forwardingId/message-draft", ...guard');
    expect(source).toContain("insertDemandForwardingSchema");
  });

  it("accepts a forwarding identifier in demand follow-ups", () => {
    expect(source).toContain('forwardingId: z.string().uuid().optional()');
    expect(source).toContain('app.post("/api/demands/:id/follow-up", ...guard');
  });
});
