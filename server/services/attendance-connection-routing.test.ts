import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_CONNECTION_THREAD_UNIQUE_CONSTRAINT,
  AttendanceConnectionError,
  InboundConnectionError,
  assertInboundConnection,
  isAttendanceConnectionThreadUniqueViolation,
  requireConversationSendConnection,
  requireNewConversationConnection,
} from "./attendance-connection-routing";

describe("attendance connection routing", () => {
  it("accepts only connected WHU connections for inbound traffic", () => {
    expect(() => assertInboundConnection({
      id: "connection-ready",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
    })).not.toThrow();

    for (const connection of [
      { id: "connection-disabled", channel: "whatsapp", provider: "wescctech", status: "disabled" },
      { id: "connection-pending", channel: "whatsapp", provider: "wescctech", status: "pending" },
      { id: "connection-error", channel: "whatsapp", provider: "wescctech", status: "error" },
      { id: "connection-sms", channel: "sms", provider: "wescctech", status: "connected" },
      { id: "connection-cloud", channel: "whatsapp", provider: "wescctech_cloud", status: "connected" },
    ]) {
      expect(() => assertInboundConnection(connection)).toThrow(InboundConnectionError);
    }
  });

  it("returns stable errors without connection secrets", () => {
    let disabledError: unknown;
    try {
      assertInboundConnection({
      id: "connection-disabled",
      channel: "whatsapp",
      provider: "wescctech",
      status: "disabled",
      token: "must-not-leak",
      });
    } catch (error) {
      disabledError = error;
    }
    expect(disabledError).toMatchObject({
      code: "INBOUND_CONNECTION_DISABLED",
      message: "Conexão desativada",
      status: 409,
    });

    let missingError: unknown;
    try {
      assertInboundConnection(null);
    } catch (error) {
      missingError = error;
    }
    expect(missingError).toMatchObject({
      code: "INBOUND_CONNECTION_MISSING",
      message: "Conexão não encontrada",
      status: 404,
    });
  });

  it("recognizes only the connection-thread unique violation for recovery", () => {
    expect(isAttendanceConnectionThreadUniqueViolation({
      code: "23505",
      constraint: ATTENDANCE_CONNECTION_THREAD_UNIQUE_CONSTRAINT,
    })).toBe(true);
    expect(isAttendanceConnectionThreadUniqueViolation({ code: "23505", constraint: "other_unique_constraint" })).toBe(false);
    expect(isAttendanceConnectionThreadUniqueViolation({ code: "other", constraint: ATTENDANCE_CONNECTION_THREAD_UNIQUE_CONSTRAINT })).toBe(false);
  });

  it("uses only the exact connected WHU connection bound to an existing conversation", () => {
    const conversation = { connectionId: "connection-a" };
    const exact = {
      id: "connection-a",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      token: "encrypted-token-a",
    };

    expect(requireConversationSendConnection(conversation, exact)).toBe(exact);

    for (const connection of [
      null,
      { ...exact, id: "connection-b" },
      { ...exact, status: "disabled" },
      { ...exact, status: "pending" },
      { ...exact, status: "error" },
      { ...exact, token: null },
    ]) {
      expect(() => requireConversationSendConnection(conversation, connection)).toThrow(AttendanceConnectionError);
    }
  });

  it("returns legacy mode only when an existing conversation has an explicit null connection id", () => {
    expect(requireConversationSendConnection({ connectionId: null }, null)).toBeNull();
    for (const conversation of [
      {},
      { connectionId: undefined },
      { connectionId: "" },
      { connectionId: "  " },
    ]) {
      try {
        requireConversationSendConnection(conversation, null);
        throw new Error("expected malformed connection identity to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(AttendanceConnectionError);
        expect((error as AttendanceConnectionError).code).toBe("WHU_CONNECTION_UNAVAILABLE");
      }
    }
  });

  it("requires an available tenant sender for a new conversation", () => {
    const connected = {
      id: "connection-new",
      channel: "whatsapp",
      provider: "wescctech",
      status: "connected",
      token: "encrypted-token-new",
    };
    expect(requireNewConversationConnection(connected)).toBe(connected);

    for (const connection of [
      null,
      { ...connected, status: "disabled" },
      { ...connected, status: "pending" },
      { ...connected, status: "error" },
      { ...connected, token: "" },
      { ...connected, id: "", },
    ]) {
      expect(() => requireNewConversationConnection(connection)).toThrow(AttendanceConnectionError);
    }
  });

  it("keeps an exact connected official connection on its own valid path", () => {
    const official = {
      id: "connection-official",
      channel: "whatsapp",
      provider: "wescctech_cloud",
      status: "connected",
      token: "encrypted-official-token",
      metadata: { businessAccountId: "waba-1", phoneNumberId: "phone-1" },
    };

    expect(requireConversationSendConnection({ connectionId: official.id }, official)).toBe(official);
    expect(requireNewConversationConnection(official)).toBe(official);
  });
});
