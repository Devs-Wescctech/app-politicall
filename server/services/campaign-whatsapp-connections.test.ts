import { describe, expect, it } from "vitest";
import {
  campaignWhatsappConnectionId,
  listCampaignWhatsappConnectionOptions,
  mergeCampaignWhatsappScheduleConfig,
  normalizeCampaignWhatsappSender,
  requireCampaignWhatsappConnection,
  toCampaignWhatsappConnectionOption,
} from "./campaign-whatsapp-connections";

const normal = {
  id: "normal-1",
  accountId: "account-1",
  name: "Atendimento principal",
  channel: "whatsapp",
  provider: "wescctech",
  status: "connected",
  token: "token-normal",
  metadata: { phoneNumber: "5551999990000", apiType: "whu" },
};

const official = {
  id: "official-1",
  accountId: "account-1",
  name: "Campanhas oficiais",
  channel: "whatsapp",
  provider: "meta_cloud",
  status: "connected",
  token: "token-official",
  metadata: {
    phoneNumber: "5551988880000",
    phoneNumberId: "phone-id",
    businessAccountId: "waba-id",
  },
};

describe("campaign WhatsApp connections", () => {
  it("maps a normal WHU number to a safe campaign option", () => {
    expect(toCampaignWhatsappConnectionOption(normal)).toEqual({
      id: "normal-1",
      name: "Atendimento principal",
      phoneNumber: "5551999990000",
      provider: "wescctech",
      status: "connected",
      official: false,
      campaignType: "whatsapp",
      label: "5551999990000 — Normal (WHU)",
    });
  });

  it("maps a Cloud API number to an official campaign option", () => {
    expect(toCampaignWhatsappConnectionOption(official)).toMatchObject({
      id: "official-1",
      phoneNumber: "5551988880000",
      official: true,
      campaignType: "whatsapp_oficial",
      label: "5551988880000 — Oficial (Cloud API)",
    });
  });

  it("falls back to the connection name when no number is available", () => {
    expect(toCampaignWhatsappConnectionOption({ ...normal, metadata: {} }).label)
      .toBe("Atendimento principal — Normal (WHU)");
  });

  it("requires the exact active connection and matching campaign type", () => {
    expect(requireCampaignWhatsappConnection([normal, official], "official-1", "whatsapp_oficial"))
      .toEqual(official);
    expect(() => requireCampaignWhatsappConnection([normal], "missing", "whatsapp"))
      .toThrow("A conexão selecionada não está mais disponível");
    expect(() => requireCampaignWhatsappConnection([{ ...normal, status: "disabled" }], "normal-1", "whatsapp"))
      .toThrow("A conexão selecionada não está mais disponível");
    expect(() => requireCampaignWhatsappConnection([normal], "normal-1", "whatsapp_oficial"))
      .toThrow("A conexão selecionada não corresponde ao tipo da campanha");
  });

  it("accepts an official Cloud API connection identified as wacloud", () => {
    const connection = { ...official, channel: "wacloud" };

    expect(requireCampaignWhatsappConnection([connection], "official-1", "whatsapp_oficial"))
      .toBe(connection);
  });

  it("lists only active WhatsApp connections without exposing credentials", () => {
    const options = listCampaignWhatsappConnectionOptions([
      { ...normal, token: "secret" },
      { ...official, channel: "wacloud", token: "secret-2" },
      { ...normal, id: "disabled", status: "disabled" },
      { ...normal, id: "sms", channel: "sms" },
    ]);

    expect(options.map(option => option.id)).toEqual(["normal-1", "official-1"]);
    expect(options.every(option => !("token" in option))).toBe(true);
  });

  it("lists and resolves only connected tenant senders with a usable token", () => {
    const candidates = [
      normal,
      { ...official, id: "pending", status: "pending" },
      { ...official, id: "error", status: "error" },
      { ...official, id: "disabled", status: "disabled" },
      { ...official, id: "tokenless", token: "   " },
      { ...official, id: "malformed", token: "v2:not-a-valid-envelope" },
      { ...official, id: "foreign", accountId: "account-2", token: "token-foreign" },
    ];

    expect(listCampaignWhatsappConnectionOptions(candidates as any, "account-1").map(option => option.id))
      .toEqual(["normal-1"]);
    expect(requireCampaignWhatsappConnection(candidates as any, "normal-1", "whatsapp", "account-1"))
      .toEqual(normal);
    for (const id of ["pending", "error", "disabled", "tokenless", "malformed", "foreign"]) {
      expect(() => requireCampaignWhatsappConnection(candidates as any, id, "whatsapp_oficial", "account-1"))
        .toThrow("A conexão selecionada não está mais disponível");
    }
  });

  it("uses one exact saved sender and rejects disagreement between legacy locations", () => {
    expect(campaignWhatsappConnectionId({ waConnectionId: " sender-1 " }, { waConnectionId: "sender-1" }))
      .toBe("sender-1");
    expect(normalizeCampaignWhatsappSender({ waConnectionId: " sender-1 " }, { waConnectionId: "sender-1" }))
      .toEqual({ sendConfig: { waConnectionId: "sender-1" }, templateConfig: { waConnectionId: "sender-1" } });
    expect(campaignWhatsappConnectionId({}, { waConnectionId: "legacy-sender" })).toBe("legacy-sender");
    expect(() => campaignWhatsappConnectionId({ waConnectionId: "sender-1" }, { waConnectionId: "sender-2" }))
      .toThrow("A campanha possui conexões WhatsApp conflitantes");
  });

  it("does not allow scheduling to replace the persisted WhatsApp sender", () => {
    expect(mergeCampaignWhatsappScheduleConfig(
      { waConnectionId: "sender-1", batchSize: 10 },
      { batchSize: 20 },
      { waConnectionId: "sender-1" },
    )).toEqual({ waConnectionId: "sender-1", batchSize: 20 });
    expect(() => mergeCampaignWhatsappScheduleConfig(
      { waConnectionId: "sender-1" },
      { waConnectionId: "fallback-2" },
      { waConnectionId: "sender-1" },
    )).toThrow("A conexão WhatsApp não pode ser alterada no agendamento");
  });
});
