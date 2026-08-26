import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("private demand attachment hosting", () => {
  it("blocks the demand directory before the generic uploads static route", () => {
    const source = readFileSync("server/index.ts", "utf8");
    const privateBlock = source.indexOf("app.use('/uploads/demands'");
    const publicUploads = source.indexOf("app.use('/uploads', express.static('uploads'))");

    expect(privateBlock).toBeGreaterThan(-1);
    expect(publicUploads).toBeGreaterThan(privateBlock);
  });
});
