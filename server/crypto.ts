import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 128 * 1024;
const MAX_BASE64URL_DATA_LENGTH = Math.ceil(MAX_CIPHERTEXT_BYTES * 4 / 3) + 4;
const MAX_V1_ENVELOPE_LENGTH = 65 + (MAX_CIPHERTEXT_BYTES * 2);
const MAX_V2_ENVELOPE_LENGTH = 4 + 80 + 1 + 16 + 1 + 22 + 1 + MAX_BASE64URL_DATA_LENGTH;
const V1_PATTERN = /^(?<iv>[0-9a-f]{32}):(?<tag>[0-9a-f]{32}):(?<data>[0-9a-f]+)$/i;
const V2_PATTERN = new RegExp(`^v2:(?<keyId>[a-z0-9-]{8,80}):(?<iv>[A-Za-z0-9_-]{16}):(?<tag>[A-Za-z0-9_-]{22}):(?<data>[A-Za-z0-9_-]{0,${MAX_BASE64URL_DATA_LENGTH}})$`);

export type DataEncryptionContext = { table?: string; field?: string; recordId?: string };

export class DataEncryptionError extends Error {
  constructor(public readonly code: "configuration" | "malformed" | "unknown_key" | "decrypt_failed" | "legacy_unavailable") {
    super("Data encryption operation failed");
    this.name = "DataEncryptionError";
  }
}

type DataKeyring = {
  active: Buffer;
  activeId: string;
  v2Keys: Map<string, Buffer>;
  legacyV1?: Buffer;
};

function decodeCanonicalBase64Key(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== KEY_BYTES || decoded.toString("base64") !== value) return null;
  return decoded;
}

function keyId(key: Buffer): string {
  return `sha256-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function getKeyring(): DataKeyring {
  const active = decodeCanonicalBase64Key(process.env.DATA_ENCRYPTION_KEY);
  if (!active) throw new DataEncryptionError("configuration");

  const activeId = keyId(active);
  const v2Keys = new Map([[activeId, active]]);
  const legacyValue = process.env.LEGACY_DATA_ENCRYPTION_KEY;
  let legacyV1: Buffer | undefined;
  if (legacyValue) {
    legacyV1 = crypto.scryptSync(legacyValue, "salt", KEY_BYTES);
    const previousV2 = decodeCanonicalBase64Key(legacyValue);
    if (previousV2) v2Keys.set(keyId(previousV2), previousV2);
  }
  return { active, activeId, v2Keys, legacyV1 };
}

function aadFor(keyIdValue: string, context?: DataEncryptionContext): Buffer {
  const scope = context?.table && context?.field && context?.recordId
    ? `${context.table}\u001f${context.field}\u001f${context.recordId}`
    : "global";
  return Buffer.from(`v2\u001f${keyIdValue}\u001f${scope}`, "utf8");
}

function decodeCanonicalBase64Url(value: string, expectedBytes?: number): Buffer | null {
  if (value.length > MAX_BASE64URL_DATA_LENGTH || (value && !/^[A-Za-z0-9_-]+$/.test(value))) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length > MAX_CIPHERTEXT_BYTES || decoded.toString("base64url") !== value) return null;
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) return null;
  return decoded;
}

type ParsedV2 = { keyId: string; iv: Buffer; tag: Buffer; data: Buffer };

function parseV2(value: string): ParsedV2 | null {
  if (value.length > MAX_V2_ENVELOPE_LENGTH) return null;
  const match = V2_PATTERN.exec(value);
  if (!match?.groups) return null;
  const iv = decodeCanonicalBase64Url(match.groups.iv, IV_BYTES);
  const tag = decodeCanonicalBase64Url(match.groups.tag, TAG_BYTES);
  const data = decodeCanonicalBase64Url(match.groups.data);
  if (!iv || !tag || !data) return null;
  return { keyId: match.groups.keyId, iv, tag, data };
}

function parseV1(value: string): { iv: Buffer; tag: Buffer; data: Buffer } | null {
  if (value.length > MAX_V1_ENVELOPE_LENGTH) return null;
  const match = V1_PATTERN.exec(value);
  if (!match?.groups || match.groups.data.length % 2 !== 0) return null;
  const iv = Buffer.from(match.groups.iv, "hex");
  const tag = Buffer.from(match.groups.tag, "hex");
  const data = Buffer.from(match.groups.data, "hex");
  return iv.length === 16 && tag.length === TAG_BYTES && data.length > 0 ? { iv, tag, data } : null;
}

export function getActiveDataEncryptionKeyId(): string {
  return getKeyring().activeId;
}

export function requireDataEncryptionKey(): void {
  getKeyring();
}

export function isEncryptedDataValue(value: unknown): boolean {
  return typeof value === "string" && (parseV2(value) !== null || parseV1(value) !== null);
}

export function isMalformedEncryptedDataValue(value: unknown): boolean {
  return typeof value === "string" && (
    (value.startsWith("v2:") && parseV2(value) === null)
    || (/^[0-9a-f]{32}:/i.test(value) && parseV1(value) === null)
  );
}

export function getV2KeyId(value: string): string | null {
  return parseV2(value)?.keyId ?? null;
}

export function encryptApiKey(apiKey: string, context?: DataEncryptionContext): string {
  if (isMalformedEncryptedDataValue(apiKey)) throw new DataEncryptionError("malformed");
  if (Buffer.byteLength(apiKey, "utf8") > MAX_CIPHERTEXT_BYTES) throw new DataEncryptionError("malformed");
  const keyring = getKeyring();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyring.active, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(keyring.activeId, context));
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = `v2:${keyring.activeId}:${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
  if (!parseV2(envelope)) throw new DataEncryptionError("malformed");
  return envelope;
}

export function decryptApiKey(value: string, context?: DataEncryptionContext): string {
  const v2 = parseV2(value);
  if (v2) {
    const keyring = getKeyring();
    const key = keyring.v2Keys.get(v2.keyId);
    if (!key) throw new DataEncryptionError("unknown_key");
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, v2.iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(aadFor(v2.keyId, context));
      decipher.setAuthTag(v2.tag);
      return Buffer.concat([decipher.update(v2.data), decipher.final()]).toString("utf8");
    } catch {
      throw new DataEncryptionError("decrypt_failed");
    }
  }
  if (isMalformedEncryptedDataValue(value)) throw new DataEncryptionError("malformed");

  const v1 = parseV1(value);
  if (!v1) return value;
  const keyring = getKeyring();
  if (!keyring.legacyV1) throw new DataEncryptionError("legacy_unavailable");
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyring.legacyV1, v1.iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(v1.tag);
    return Buffer.concat([decipher.update(v1.data), decipher.final()]).toString("utf8");
  } catch {
    throw new DataEncryptionError("decrypt_failed");
  }
}
