import { isOfficialAttendanceChannel } from "../../shared/attendance-meta-window";

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
  name?: unknown;
  channel?: unknown;
  provider?: unknown;
  status?: unknown;
  metadata?: unknown;
};

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
): CampaignWhatsappConnectionOption[] {
  return connections
    .filter(connection => {
      const channel = String(connection.channel ?? "").toLowerCase();
      const status = String(connection.status ?? "").toLowerCase();
      return status !== "disabled" && (channel.includes("whatsapp") || channel === "wacloud");
    })
    .map(toCampaignWhatsappConnectionOption);
}

export function requireCampaignWhatsappConnection<T extends ConnectionLike>(
  connections: T[],
  connectionId: string | null | undefined,
  expectedType: "whatsapp" | "whatsapp_oficial",
): T {
  const connection = connections.find(item => item.id === connectionId);
  const channel = String(connection?.channel ?? "").toLowerCase();
  const status = String(connection?.status ?? "").toLowerCase();
  const isWhatsappConnection = channel.includes("whatsapp") || channel === "wacloud";
  if (!connection || !isWhatsappConnection || status === "disabled") {
    throw new Error("A conexão selecionada não está mais disponível");
  }

  const option = toCampaignWhatsappConnectionOption(connection);
  if (option.campaignType !== expectedType) {
    throw new Error("A conexão selecionada não corresponde ao tipo da campanha");
  }
  return connection;
}
