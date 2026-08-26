import { isBlankOrMaskedDataSecret } from "./data-secret-fields";
import { fingerprintWhuToken, isWhuConnection, normalizeWhuPhone } from "./whu-connection-identity";

type ConnectionRecord = Record<string, any>;

export type PreparedWhuConnection = ConnectionRecord & {
  accountId: string;
  channel: "whatsapp";
  provider: "wescctech";
  name: string;
  phoneNumber: string;
  token: string;
  tokenFingerprint: string;
  status: "pending";
  metadata: Record<string, any>;
};

export type PreparedWhuConnectionUpdate = ConnectionRecord & {
  channel: "whatsapp";
  provider: "wescctech";
  metadata: Record<string, any>;
};

export class ConnectionValidationError extends Error {
  constructor(
    public readonly code: "WHU_TOKEN_REQUIRED" | "WHU_PHONE_REQUIRED" | "WHU_NAME_REQUIRED" | "WHU_DUPLICATE_PHONE" | "WHU_DUPLICATE_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "ConnectionValidationError";
  }
}

export type WhuConnectionLookupStorage = {
  findActiveChannelConnectionByPhone(accountId: string, phoneNumber: string, excludeId?: string): Promise<unknown | null>;
  findActiveChannelConnectionByTokenFingerprint(accountId: string, fingerprint: string, excludeId?: string): Promise<unknown | null>;
};

function metadataOf(value: unknown): Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
}

function hasOwn(value: ConnectionRecord, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function requiredName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new ConnectionValidationError("WHU_NAME_REQUIRED", "Nome WHU é obrigatório");
  return name;
}

function requiredPhone(value: unknown): string {
  const phoneNumber = normalizeWhuPhone(value);
  if (!phoneNumber) throw new ConnectionValidationError("WHU_PHONE_REQUIRED", "Número WHU é obrigatório");
  return phoneNumber;
}

function requiredToken(value: unknown): string {
  if (isBlankOrMaskedDataSecret(value) || typeof value !== "string") {
    throw new ConnectionValidationError("WHU_TOKEN_REQUIRED", "Token WHU é obrigatório");
  }
  return value.trim();
}

function currentPhone(input: ConnectionRecord, existing?: ConnectionRecord): unknown {
  const inputMetadata = metadataOf(input.metadata);
  const existingMetadata = metadataOf(existing?.metadata);
  if (hasOwn(input, "phoneNumber")) return input.phoneNumber;
  if (hasOwn(inputMetadata, "phoneNumber")) return inputMetadata.phoneNumber;
  if (hasOwn(existing ?? {}, "phoneNumber")) return existing?.phoneNumber;
  return existingMetadata.phoneNumber;
}

function currentStatus(input: ConnectionRecord, existing?: ConnectionRecord): string {
  return String(input.status ?? existing?.status ?? "pending").trim().toLowerCase() || "pending";
}

export function buildWhuConnectionCreate(input: ConnectionRecord, accountId: string): PreparedWhuConnection {
  const name = requiredName(input.name);
  const token = requiredToken(input.token);
  const phoneNumber = requiredPhone(currentPhone(input));
  const metadata = { ...metadataOf(input.metadata), phoneNumber };

  return {
    ...input,
    accountId,
    name,
    channel: "whatsapp",
    provider: "wescctech",
    token,
    tokenFingerprint: fingerprintWhuToken(token),
    phoneNumber,
    status: "pending",
    metadata,
  };
}

export function buildWhuConnectionUpdate(input: ConnectionRecord, existing: ConnectionRecord): PreparedWhuConnectionUpdate {
  const existingIsWhu = isWhuConnection(existing);
  const metadata = { ...metadataOf(input.metadata) };
  const result: ConnectionRecord = {
    ...input,
    channel: "whatsapp",
    provider: "wescctech",
    status: currentStatus(input, existing),
    metadata,
  };

  if (hasOwn(input, "name")) result.name = requiredName(input.name);
  const rawPhone = currentPhone(input, existing);
  if (rawPhone == null || (typeof rawPhone === "string" && !rawPhone.trim())) {
    if (!existingIsWhu || hasOwn(input, "phoneNumber") || hasOwn(metadataOf(input.metadata), "phoneNumber")) {
      throw new ConnectionValidationError("WHU_PHONE_REQUIRED", "Número WHU é obrigatório");
    }
  } else {
    const phoneNumber = requiredPhone(rawPhone);
    result.phoneNumber = phoneNumber;
    metadata.phoneNumber = phoneNumber;
  }

  if (isBlankOrMaskedDataSecret(input.token)) {
    delete result.token;
    if (existing.tokenFingerprint != null) result.tokenFingerprint = existing.tokenFingerprint;
    else if (!existingIsWhu) throw new ConnectionValidationError("WHU_TOKEN_REQUIRED", "Token WHU é obrigatório");
  } else {
    const token = requiredToken(input.token);
    result.token = token;
    result.tokenFingerprint = fingerprintWhuToken(token);
  }

  return result as PreparedWhuConnectionUpdate;
}

export async function assertWhuConnectionUnique(
  storage: WhuConnectionLookupStorage,
  connection: ConnectionRecord,
  excludeId?: string,
): Promise<void> {
  if (currentStatus(connection) === "disabled") return;

  const [samePhone, sameToken] = await Promise.all([
    connection.phoneNumber
      ? storage.findActiveChannelConnectionByPhone(connection.accountId, connection.phoneNumber, excludeId)
      : null,
    connection.tokenFingerprint
      ? storage.findActiveChannelConnectionByTokenFingerprint(connection.accountId, connection.tokenFingerprint, excludeId)
      : null,
  ]);
  if (samePhone) {
    throw new ConnectionValidationError("WHU_DUPLICATE_PHONE", "Já existe uma conexão WHU ativa com este número.");
  }
  if (sameToken) {
    throw new ConnectionValidationError("WHU_DUPLICATE_TOKEN", "Este token WHU já está em uso.");
  }
}

export function isWhuConnectionRequest(input: ConnectionRecord, existing?: ConnectionRecord): boolean {
  return isWhuConnection({
    channel: input.channel ?? existing?.channel ?? "whatsapp",
    provider: input.provider ?? existing?.provider ?? "wescctech",
  });
}
