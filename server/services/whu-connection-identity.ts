import crypto from "node:crypto";

type ConnectionLike = { channel?: unknown; provider?: unknown; status?: unknown };

export function requireTokenFingerprintKey(): Buffer {
  const source = process.env.TOKEN_FINGERPRINT_KEY;
  if (!source) throw new Error("TOKEN_FINGERPRINT_KEY is required");
  const key = Buffer.from(source, "base64");
  if (source.trim() !== source || key.length !== 32 || key.toString("base64") !== source) {
    throw new Error("TOKEN_FINGERPRINT_KEY must be a canonical base64 encoding of exactly 32 bytes");
  }
  return key;
}

export function normalizeWhuPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

export function fingerprintWhuToken(token: string): string {
  const key = crypto.createHash("sha256").update("whu-token-fingerprint:").update(requireTokenFingerprintKey()).digest();
  return crypto.createHmac("sha256", key).update(token.trim(), "utf8").digest("hex");
}

export function isWhuConnection(connection: ConnectionLike): boolean {
  return String(connection.channel ?? "").trim().toLowerCase() === "whatsapp"
    && String(connection.provider ?? "").trim().toLowerCase() === "wescctech";
}

export function isConnectionAvailableForSend(connection: ConnectionLike): boolean {
  return isWhuConnection(connection) && String(connection.status ?? "").trim().toLowerCase() === "connected";
}
