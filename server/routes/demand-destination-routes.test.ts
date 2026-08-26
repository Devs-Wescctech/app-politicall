import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demand destination routes", () => {
  const source = readFileSync("server/routes/demand-routes.ts", "utf8");

  it("exposes authenticated list, create and update contracts", () => {
    expect(source).toContain('app.get("/api/demand-destinations", ...guard');
    expect(source).toContain('app.post("/api/demand-destinations", ...guard');
    expect(source).toContain('app.patch("/api/demand-destinations/:id", ...guard');
    expect(source).toContain("insertDemandDestinationSchema");
  });
});
