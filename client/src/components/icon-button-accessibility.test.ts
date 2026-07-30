import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = {
  sidebar: readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8"),
  notifications: readFileSync(new URL("./notification-bell.tsx", import.meta.url), "utf8"),
  chat: readFileSync(new URL("./attendance/ChatPanel.tsx", import.meta.url), "utf8"),
};

describe("icon button accessibility labels", () => {
  it("names global and attendance icon-only buttons", () => {
    expect(sources.sidebar).toContain('aria-label="Abrir manual"');
    expect(sources.sidebar).toContain('title="Abrir manual"');
    expect(sources.notifications).toContain('aria-label="Abrir notificações"');
    expect(sources.notifications).toContain('title="Abrir notificações"');
    expect(sources.chat).toContain('aria-label="Abrir ações da conversa"');
    expect(sources.chat).toContain('title="Abrir ações da conversa"');
  });
});
