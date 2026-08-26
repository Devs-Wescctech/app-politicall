import { maskChannelConnectionSecrets } from "./data-secret-fields";

const SAFE_PROVIDER_ERROR = "Não foi possível validar a conexão com o provedor.";

export function sanitizeConnectionLastError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("status remoto:")) {
    return "O provedor informou que o número está desconectado.";
  }
  if (normalized.includes("business account id") && normalized.includes("phone number id")) {
    return "Complete os identificadores obrigatórios da conexão Meta.";
  }
  return SAFE_PROVIDER_ERROR;
}

export function buildConnectionWebhookSetupUrl(
  connectionId: string,
  publicAppUrl: string | undefined,
): string | null {
  if (!publicAppUrl) return null;
  try {
    const url = new URL(publicAppUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.pathname = `/api/webhooks/attendance/whatsapp/${encodeURIComponent(connectionId)}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildAttendanceConnectionView<T extends Record<string, any>>(
  connection: T,
  publicAppUrl: string | undefined = process.env.PUBLIC_APP_URL,
) {
  const masked = maskChannelConnectionSecrets(connection) as Record<string, any>;
  delete masked.token;
  delete masked.tokenFingerprint;
  const metadata = { ...(masked.metadata ?? {}) };
  delete metadata.webhookSecret;
  masked.metadata = metadata;
  masked.lastError = sanitizeConnectionLastError(connection.lastError);
  masked.webhookSetupUrl = String(connection.channel ?? "").trim().toLowerCase() === "whatsapp"
    ? buildConnectionWebhookSetupUrl(String(connection.id), publicAppUrl)
    : null;
  return masked;
}
