import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeActionCardTemplate, wescctech } from "../server/services/wescctech";

describe("Wescctech action-card templates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the WHU model into a selectable attendance template", () => {
    expect(normalizeActionCardTemplate({
      id: "welcome-card",
      description: "Boas-vindas",
      canEdit: false,
      messages: [
        { text: "Segunda mensagem", order: 2 },
        { text: "Primeira mensagem", order: 1 },
      ],
      staticComponents: [{ type: "BODY", text: "Corpo estático" }],
      dynamicComponents: [],
    })).toEqual(expect.objectContaining({
      id: "welcome-card",
      name: "Boas-vindas",
      title: "Boas-vindas",
      preview: "Primeira mensagem\nSegunda mensagem",
      source: "whu_action_card",
      canEdit: false,
    }));
  });

  it("lists WHU templates with the channel access-token header", async () => {
    const templates = [{
      id: "welcome-card",
      description: "Boas-vindas",
      canEdit: false,
      messages: [{ text: "Olá! Como podemos ajudar?", order: 1 }],
      staticComponents: [{ type: "BODY", text: "Olá! Como podemos ajudar?" }],
      dynamicComponents: [],
    }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(templates), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(wescctech.listActionCardTemplates("secret-token")).resolves.toEqual(templates);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.wescctech.com.br/core/v2/api/action-cards/templates",
      expect.objectContaining({
        headers: expect.objectContaining({ "access-token": "secret-token" }),
      }),
    );
  });

  it("sends a selected WHU template as an action card", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await wescctech.sendActionCard("secret-token", {
      number: "5511999999999",
      actionCardId: "welcome-card",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.wescctech.com.br/core/v2/api/chats/send-action-card",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          number: "5511999999999",
          action_card_id: "welcome-card",
          forceSend: true,
          verifyContact: false,
        }),
        headers: expect.objectContaining({ "access-token": "secret-token" }),
      }),
    );
  });

  it("sends a WACLOUD template through the WHU template endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-cloud" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await wescctech.sendCloudTemplate("secret-token", {
      number: "5511999999999",
      templateId: "approved-template",
      templateComponents: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.wescctech.com.br/core/v2/api/chats/send-template",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          number: "5511999999999",
          templateId: "approved-template",
          templateComponents: [],
          forceSend: true,
          verifyContact: false,
        }),
        headers: expect.objectContaining({ "access-token": "secret-token" }),
      }),
    );
  });
});
