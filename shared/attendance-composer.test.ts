import { describe, expect, it } from "vitest";
import { buildComposerCommands, templatesForNewConversation } from "./attendance-composer";

const templates = [{ id: "tpl-1", name: "Boas-vindas", preview: "Olá" }];
const quickReplies = [{ id: "qr-1", title: "Saudação", message: "Bom dia" }];

describe("buildComposerCommands", () => {
  it("combines templates and quick replies with explicit kinds", () => {
    const result = buildComposerCommands({ templates, quickReplies, windowExpired: false, search: "" });
    expect(result.map(item => item.kind)).toEqual(["template", "quick_reply"]);
  });

  it("disables only quick replies outside the Meta window", () => {
    const result = buildComposerCommands({ templates, quickReplies, windowExpired: true, search: "" });
    expect(result[0]).toMatchObject({ kind: "template", disabled: false });
    expect(result[1]).toMatchObject({ kind: "quick_reply", disabled: true });
  });

  it("searches titles and previews without case sensitivity", () => {
    const result = buildComposerCommands({ templates, quickReplies, windowExpired: false, search: "SAUDA" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("qr-1");
  });
});

describe("templatesForNewConversation", () => {
  it("shows WHU action-card templates when a WACLOUD connection is both official and WHU", () => {
    const result = templatesForNewConversation([
      { id: "meta", source: "official" },
      { id: "cloud", source: "whu_action_card" },
      { id: "quick", source: "quick_reply" },
    ], { official: true, whu: true });

    expect(result.map(template => template.id)).toEqual(["meta", "cloud"]);
  });
});
