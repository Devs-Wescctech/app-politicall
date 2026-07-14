import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./attendance.tsx", import.meta.url), "utf8");

function sourceAround(marker: string, radius = 420) {
  const index = source.indexOf(marker);
  expect(index).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, index - radius), index + radius);
}

describe("New conversation dialog viewport layout", () => {
  it("bounds the dialog to the viewport and scrolls only the form body", () => {
    const dialog = sourceAround('data-testid="dialog-new-conversation"');
    const scrollBody = sourceAround('data-testid="new-conversation-scroll-body"');

    expect(dialog).toContain("max-h-[calc(100vh-1rem)]");
    expect(dialog).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(scrollBody).toContain("min-h-0");
    expect(scrollBody).toContain("overflow-y-auto");
    expect(source).toContain('data-testid="new-conversation-dialog-footer"');
  });
});
