import crypto from "node:crypto";
import type { ChannelConnection } from "@shared/schema";
import { prepareChannelConnectionSecrets } from "./data-secret-fields";
import { normalizeWhuPhone } from "./whu-connection-identity";
import { buildWhatsappConnectionConfig } from "./whatsapp-connection-config";

type ConnectionWrite = Record<string, any> & { accountId: string };

export type LegacyWhuConnectionRepository = {
  findLegacyOrigin(accountId: string): Promise<ChannelConnection | null>;
  create(data: ConnectionWrite): Promise<ChannelConnection>;
  update(id: string, accountId: string, data: Record<string, any>): Promise<ChannelConnection>;
};

function metadataOf(connection: Pick<ChannelConnection, "metadata"> | null): Record<string, any> {
  const metadata = connection?.metadata;
  return metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, any>) }
    : {};
}

export type LegacyWhatsappConnectionSummary = {
  id: string;
  name: string;
  phoneNumber: string | null;
  provider: string;
  status: string;
  lastTestedAt: Date | string | null;
  lastError: string | null;
  type: "official" | "whu";
};

export function legacyWhuMigrationConnectionId(accountId: string, integrationId: string): string {
  const bytes = crypto.createHash("sha256")
    .update("politicall:legacy-whatsapp-connection:", "utf8")
    .update(accountId, "utf8")
    .update(":", "utf8")
    .update(integrationId, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isOfficialConnection(connection: ChannelConnection): boolean {
  const metadata = metadataOf(connection);
  return connection.provider === "meta_cloud"
    || connection.provider === "wescctech_cloud"
    || metadata.official === true
    || metadata.whatsappOfficial === true
    || metadata.apiType === "official";
}

export function summarizeLegacyWhatsappConnections(
  connections: ChannelConnection[],
): LegacyWhatsappConnectionSummary[] {
  return connections
    .filter(connection => connection.channel === "whatsapp")
    .map(connection => ({
      id: connection.id,
      name: connection.name,
      phoneNumber: normalizeWhuPhone(connection.phoneNumber ?? metadataOf(connection).phoneNumber),
      provider: connection.provider,
      status: connection.status,
      lastTestedAt: connection.lastTestedAt ?? null,
      lastError: connection.lastError ? "Falha no último teste" : null,
      type: isOfficialConnection(connection) ? "official" : "whu",
    }));
}

export function assertLegacyWhatsappCollectionWrite(service: string, connections: ChannelConnection[]): void {
  if (service !== "whatsapp") return;
  const migrated = connections.some(connection => {
    const metadata = metadataOf(connection);
    return metadata.source === "settings-omni" && metadata.legacyOrigin === true;
  });
  if (migrated) {
    throw new Error("Gerencie os números de WhatsApp no gerenciador de conexões.");
  }
}

export async function migrateLegacyWhuIntegration(
  accountId: string,
  integration: Record<string, any>,
  repository: LegacyWhuConnectionRepository,
): Promise<ChannelConnection> {
  const existing = await repository.findLegacyOrigin(accountId);
  const existingMetadata = metadataOf(existing);

  // Once marked, channel_connections is authoritative. The legacy integration
  // remains stored for compatibility but can no longer overwrite this record.
  if (existingMetadata.legacyOrigin === true) return existing as ChannelConnection;

  const legacyConfig = buildWhatsappConnectionConfig(integration);
  if (!existing) {
    const id = legacyWhuMigrationConnectionId(accountId, String(integration.id ?? "whatsapp"));
    const metadata = {
      ...legacyConfig.metadata,
      source: "settings-omni",
      legacyOrigin: true,
      legacyIntegrationId: String(integration.id ?? "whatsapp"),
    };
    const prepared = prepareChannelConnectionSecrets({
      id,
      accountId,
      ...legacyConfig,
      metadata,
    });
    try {
      return await repository.create(prepared as ConnectionWrite);
    } catch (error) {
      const concurrent = await repository.findLegacyOrigin(accountId);
      const concurrentMetadata = metadataOf(concurrent);
      if (concurrent && concurrentMetadata.source === "settings-omni") return concurrent;
      throw error;
    }
  }

  const phoneNumber = normalizeWhuPhone(
    existing.phoneNumber ?? existingMetadata.phoneNumber ?? legacyConfig.phoneNumber,
  );
  const metadata = {
    ...legacyConfig.metadata,
    ...existingMetadata,
    source: "settings-omni",
    legacyOrigin: true,
    phoneNumber,
  };
  const input: Record<string, any> = {
    accountId,
    id: existing.id,
    phoneNumber,
    metadata,
  };
  const prepared = prepareChannelConnectionSecrets(input, existing as Record<string, any>);
  return repository.update(existing.id, accountId, prepared);
}
