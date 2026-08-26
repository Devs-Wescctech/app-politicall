import { describe, expect, it } from "vitest";
import { buildAttendanceChannelHealth } from "./attendance-channel-health";

describe("buildAttendanceChannelHealth", () => {
  it("reports every channel as inactive when no integration exists", () => {
    const result = buildAttendanceChannelHealth({ connections: [] });

    expect(result.channels.map(channel => [channel.id, channel.status])).toEqual([
      ["whatsapp", "inactive"],
      ["sms", "inactive"],
      ["email", "inactive"],
    ]);
  });

  it("reports WhatsApp as operational when one active connection is connected", () => {
    const result = buildAttendanceChannelHealth({
      connections: [{ id: "whu-1", name: "WHU", status: "connected", channel: "whatsapp", provider: "whu" }],
    });

    expect(result.channels[0]).toMatchObject({
      id: "whatsapp",
      status: "operational",
      canSend: true,
      canReceive: true,
      configuredConnections: 1,
    });
  });

  it("ignores other connected channels and does not expose raw provider errors", () => {
    const unrelated = buildAttendanceChannelHealth({
      connections: [{ id: "email-1", name: "SMTP", status: "connected", channel: "email", provider: "smtp" }],
    });
    const failed = buildAttendanceChannelHealth({
      connections: [{ id: "whu-1", name: "WHU", status: "error", channel: "whatsapp", provider: "whu", lastError: "Bearer secret-token" }],
    });

    expect(unrelated.channels[0]).toMatchObject({ status: "inactive", configuredConnections: 0 });
    expect(failed.channels[0]).toMatchObject({ status: "error", message: "A conexão configurada não está operacional" });
    expect(JSON.stringify(failed)).not.toContain("secret-token");
  });

  it("lists missing SMS settings without returning their values", () => {
    const result = buildAttendanceChannelHealth({
      connections: [],
      smsIntegration: { enabled: true, smsAccount: "account", smsCode: "code" },
      smsEndpoint: "",
    });

    expect(result.channels[1]).toMatchObject({
      id: "sms",
      status: "error",
      canSend: false,
      missing: ["client", "endpoint"],
    });
    expect(JSON.stringify(result)).not.toContain("account");
    expect(JSON.stringify(result)).not.toContain("code");
  });

  it("distinguishes email sending from receiving capability", () => {
    const sendOnly = buildAttendanceChannelHealth({
      connections: [],
      emailIntegration: {
        enabled: true,
        smtpHost: "smtp.example.test",
        smtpUser: "user",
        smtpPassword: "secret",
        fromEmail: "gabinete@example.test",
      },
    });
    const full = buildAttendanceChannelHealth({
      connections: [],
      emailIntegration: {
        enabled: true,
        smtpHost: "smtp.example.test",
        smtpUser: "user",
        smtpPassword: "secret",
        fromEmail: "gabinete@example.test",
        imapHost: "imap.example.test",
        imapUser: "user",
        imapPassword: "secret",
      },
    });

    expect(sendOnly.channels[2]).toMatchObject({ status: "warning", canSend: true, canReceive: false });
    expect(full.channels[2]).toMatchObject({ status: "operational", canSend: true, canReceive: true });
  });
});
