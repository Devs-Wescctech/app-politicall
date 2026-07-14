import crypto from "crypto";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-hub-signature",
  "x-hub-signature-256",
  "x-twitter-webhooks-signature",
]);

export function redactWebhookHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[redacted]" : value,
    ]),
  );
}

export function summarizeWebhookPayload(payload: any): Record<string, unknown> {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const messagingEventCount = entries.reduce((total: number, entry: any) => {
    return total + (Array.isArray(entry?.messaging) ? entry.messaging.length : 0);
  }, 0);
  const changeEventCount = entries.reduce((total: number, entry: any) => {
    return total + (Array.isArray(entry?.changes) ? entry.changes.length : 0);
  }, 0);

  return {
    object: typeof payload?.object === "string" ? payload.object : undefined,
    entryCount: entries.length,
    messagingEventCount,
    changeEventCount,
    fields: payload && typeof payload === "object" ? Object.keys(payload) : [],
  };
}

function normalizeRawBody(rawBody: unknown): Buffer | null {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  return null;
}

function normalizeSignatureHeader(signatureHeader: unknown): string | null {
  if (typeof signatureHeader !== "string") return null;
  const trimmed = signatureHeader.trim();
  return trimmed || null;
}

export function verifyMetaWebhookSignature({
  rawBody,
  signatureHeader,
  appSecret,
}: {
  rawBody: unknown;
  signatureHeader: unknown;
  appSecret: unknown;
}): boolean {
  if (typeof appSecret !== "string" || !appSecret.trim()) return false;

  const bodyBuffer = normalizeRawBody(rawBody);
  const normalizedHeader = normalizeSignatureHeader(signatureHeader);
  if (!bodyBuffer || !normalizedHeader?.startsWith("sha256=")) return false;

  const receivedSignature = normalizedHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) return false;

  const expectedSignature = crypto
    .createHmac("sha256", appSecret.trim())
    .update(bodyBuffer)
    .digest("hex");

  const receivedBuffer = Buffer.from(receivedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function verifyTwitterWebhookSignature({
  rawBody,
  signatureHeader,
  consumerSecret,
}: {
  rawBody: unknown;
  signatureHeader: unknown;
  consumerSecret: unknown;
}): boolean {
  if (typeof consumerSecret !== "string" || !consumerSecret.trim()) return false;

  const bodyBuffer = normalizeRawBody(rawBody);
  const normalizedHeader = normalizeSignatureHeader(signatureHeader);
  if (!bodyBuffer || !normalizedHeader?.startsWith("sha256=")) return false;

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", consumerSecret.trim())
    .update(bodyBuffer)
    .digest("base64")}`;

  const receivedBuffer = Buffer.from(normalizedHeader, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function extractMetaWebhookTargetIds(payload: any): Set<string> {
  const targetIds = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) targetIds.add(trimmed);
  };

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    add(entry?.id);

    const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const event of messagingEvents) {
      add(event?.recipient?.id);
    }

    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      add(value?.recipient_id);
      add(value?.metadata?.phone_number_id);
    }
  }

  return targetIds;
}
