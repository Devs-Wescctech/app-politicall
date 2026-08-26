import { isConnectionAvailableForSend, isWhuConnection } from "./whu-connection-identity";
import { isOfficialAttendanceChannel } from "@shared/attendance-meta-window";

export const ATTENDANCE_CONNECTION_THREAD_UNIQUE_CONSTRAINT = "att_conversations_account_connection_thread_uidx";

type InboundConnectionLike = {
  id?: unknown;
  channel?: unknown;
  provider?: unknown;
  status?: unknown;
  token?: unknown;
  metadata?: unknown;
};

type ConversationConnectionLike = { connectionId?: unknown };

export class InboundConnectionError extends Error {
  constructor(
    public readonly code: "INBOUND_CONNECTION_MISSING" | "INBOUND_CONNECTION_UNSUPPORTED" | "INBOUND_CONNECTION_DISABLED" | "INBOUND_CONNECTION_NOT_READY",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export class AttendanceConnectionError extends Error {
  constructor(
    public readonly code: "WHU_CONNECTION_REQUIRED" | "WHU_CONNECTION_UNAVAILABLE",
    message: string,
    public readonly status: 400 | 409,
  ) {
    super(message);
  }
}

function isAvailableSendConnection(connection: InboundConnectionLike): boolean {
  return String(connection.status ?? "").trim().toLowerCase() === "connected"
    && (isConnectionAvailableForSend(connection) || isOfficialAttendanceChannel({ connection }));
}

function requireAvailableSendConnection(connection: InboundConnectionLike | null | undefined, required: boolean): InboundConnectionLike {
  const code = required ? "WHU_CONNECTION_REQUIRED" : "WHU_CONNECTION_UNAVAILABLE";
  const message = required
    ? "Selecione uma conexão WhatsApp conectada para iniciar o atendimento"
    : "A conexão vinculada a este atendimento não está disponível";
  if (!connection || !String(connection.id ?? "").trim() || !isAvailableSendConnection(connection) || !String(connection.token ?? "").trim()) {
    throw new AttendanceConnectionError(code, message, required ? 400 : 409);
  }
  return connection;
}

export function requireConversationSendConnection<T extends InboundConnectionLike>(
  conversation: ConversationConnectionLike,
  connection: T | null | undefined,
): T | null {
  if (conversation?.connectionId === null) return null;
  const connectionId = typeof conversation?.connectionId === "string"
    ? conversation.connectionId.trim()
    : "";
  if (!connectionId) {
    throw new AttendanceConnectionError("WHU_CONNECTION_UNAVAILABLE", "A conexão vinculada a este atendimento não está disponível", 409);
  }
  const resolved = requireAvailableSendConnection(connection, false) as T;
  if (String(resolved.id ?? "").trim() !== connectionId) {
    throw new AttendanceConnectionError("WHU_CONNECTION_UNAVAILABLE", "A conexão vinculada a este atendimento não está disponível", 409);
  }
  return resolved;
}

export function requireNewConversationConnection<T extends InboundConnectionLike>(connection: T | null | undefined): T {
  return requireAvailableSendConnection(connection, true) as T;
}

export function assertInboundConnection(connection: InboundConnectionLike | null | undefined): asserts connection is InboundConnectionLike {
  if (!connection || !String(connection.id ?? "").trim()) {
    throw new InboundConnectionError("INBOUND_CONNECTION_MISSING", "Conexão não encontrada", 404);
  }
  if (!isWhuConnection(connection)) {
    throw new InboundConnectionError("INBOUND_CONNECTION_UNSUPPORTED", "Conexão WHU obrigatória para recebimento", 400);
  }
  if (String(connection.status ?? "").trim().toLowerCase() === "disabled") {
    throw new InboundConnectionError("INBOUND_CONNECTION_DISABLED", "Conexão desativada", 409);
  }
  if (!isConnectionAvailableForSend(connection)) {
    throw new InboundConnectionError("INBOUND_CONNECTION_NOT_READY", "Conexão WHU não está pronta para recebimento", 409);
  }
}

export function isAttendanceConnectionThreadUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && (error as { code?: unknown }).code === "23505"
    && (error as { constraint?: unknown }).constraint === ATTENDANCE_CONNECTION_THREAD_UNIQUE_CONSTRAINT,
  );
}
