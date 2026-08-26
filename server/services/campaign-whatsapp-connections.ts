import { isOfficialAttendanceChannel } from "../../shared/attendance-meta-window";
import { isMalformedEncryptedDataValue } from "../crypto";

export type CampaignWhatsappConnectionOption = {
  id: string;
  name: string;
  phoneNumber: string | null;
  provider: string;
  status: string;
  official: boolean;
  campaignType: "whatsapp" | "whatsapp_oficial";
  label: string;
};

type ConnectionLike = {
  id: string;
  accountId?: unknown;
  name?: unknown;
  channel?: unknown;
  provider?: unknown;
  status?: unknown;
  token?: unknown;
  metadata?: unknown;
};

type WhatsappSenderConfig = { waConnectionId?: unknown } | null | undefined;

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function phoneNumberFromConnection(connection: ConnectionLike): string | null {
  const metadata = record(connection.metadata);
  const raw = metadata.phoneNumber ?? metadata.whatsappPhoneNumber ?? metadata.number ?? metadata.identifier;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

function usableToken(connection: ConnectionLike): boolean {
  const token = typeof connection.token === "string" ? connection.token.trim() : "";
  return Boolean(token) && !isMalformedEncryptedDataValue(token);
}

function connectionIdFrom(config: WhatsappSenderConfig): string | undefined {
  const value = config?.waConnectionId;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Returns the one saved sender identity. Legacy template-only records remain
 * readable, but conflicting fields are never silently reconciled.
 */
export function campaignWhatsappConnectionId(
  sendConfig: WhatsappSenderConfig,
  templateConfig: WhatsappSenderConfig,
): string | undefined {
  const sendConnectionId = connectionIdFrom(sendConfig);
  const templateConnectionId = connectionIdFrom(templateConfig);
  if (sendConnectionId && templateConnectionId && sendConnectionId !== templateConnectionId) {
    throw new Error("A campanha possui conexões WhatsApp conflitantes");
  }
  return sendConnectionId ?? templateConnectionId;
}

/** Normalizes a campaign write so future reads have one matching sender ID. */
export function normalizeCampaignWhatsappSender(
  sendConfig: Record<string, any> | null | undefined,
  templateConfig: Record<string, any> | null | undefined,
): { sendConfig: Record<string, any> | null; templateConfig: Record<string, any> | null } {
  const connectionId = campaignWhatsappConnectionId(sendConfig, templateConfig);
  const normalizedSendConfig = sendConfig ? { ...sendConfig } : {};
  const normalizedTemplateConfig = templateConfig ? { ...templateConfig } : {};
  if (connectionId) {
    normalizedSendConfig.waConnectionId = connectionId;
    normalizedTemplateConfig.waConnectionId = connectionId;
  }
  return {
    sendConfig: Object.keys(normalizedSendConfig).length ? normalizedSendConfig : null,
    templateConfig: Object.keys(normalizedTemplateConfig).length ? normalizedTemplateConfig : null,
  };
}

/**
 * Scheduling may adjust delivery controls, but it is not an authorization to
 * choose another sender for a campaign that already has one.
 */
export function mergeCampaignWhatsappScheduleConfig(
  persistedSendConfig: Record<string, any> | null | undefined,
  requestedSendConfig: Record<string, any> | null | undefined,
  templateConfig: Record<string, any> | null | undefined,
): Record<string, any> {
  const savedConnectionId = campaignWhatsappConnectionId(persistedSendConfig, templateConfig);
  const requestedConnectionId = connectionIdFrom(requestedSendConfig);
  if (savedConnectionId && requestedConnectionId && savedConnectionId !== requestedConnectionId) {
    throw new Error("A conexão WhatsApp não pode ser alterada no agendamento");
  }
  const merged = { ...(persistedSendConfig ?? {}), ...(requestedSendConfig ?? {}) };
  const connectionId = savedConnectionId ?? requestedConnectionId;
  if (connectionId) merged.waConnectionId = connectionId;
  return merged;
}

export function toCampaignWhatsappConnectionOption(connection: ConnectionLike): CampaignWhatsappConnectionOption {
  const official = isOfficialAttendanceChannel({ connection });
  const name = String(connection.name ?? "Conexão WhatsApp").trim() || "Conexão WhatsApp";
  const phoneNumber = phoneNumberFromConnection(connection);
  const kind = official ? "Oficial (Cloud API)" : "Normal (WHU)";

  return {
    id: connection.id,
    name,
    phoneNumber,
    provider: String(connection.provider ?? ""),
    status: String(connection.status ?? ""),
    official,
    campaignType: official ? "whatsapp_oficial" : "whatsapp",
    label: `${phoneNumber ?? name} — ${kind}`,
  };
}

export function listCampaignWhatsappConnectionOptions(
  connections: ConnectionLike[],
  expectedAccountId?: string,
): CampaignWhatsappConnectionOption[] {
  return connections
    .filter(connection => {
      const channel = String(connection.channel ?? "").toLowerCase();
      const status = String(connection.status ?? "").toLowerCase();
      return status === "connected"
        && usableToken(connection)
        && (expectedAccountId == null || connection.accountId === expectedAccountId)
        && (channel.includes("whatsapp") || channel === "wacloud");
    })
    .map(toCampaignWhatsappConnectionOption);
}

export function requireCampaignWhatsappConnection<T extends ConnectionLike>(
  connections: T[],
  connectionId: string | null | undefined,
  expectedType: "whatsapp" | "whatsapp_oficial",
  expectedAccountId?: string,
): T {
  const connection = connections.find(item => item.id === connectionId);
  const channel = String(connection?.channel ?? "").toLowerCase();
  const status = String(connection?.status ?? "").toLowerCase();
  const isWhatsappConnection = channel.includes("whatsapp") || channel === "wacloud";
  if (
    !connection
    || !isWhatsappConnection
    || status !== "connected"
    || !usableToken(connection)
    || (expectedAccountId != null && connection.accountId !== expectedAccountId)
  ) {
    throw new Error("A conexão selecionada não está mais disponível");
  }

  const option = toCampaignWhatsappConnectionOption(connection);
  if (option.campaignType !== expectedType) {
    throw new Error("A conexão selecionada não corresponde ao tipo da campanha");
  }
  return connection;
}
