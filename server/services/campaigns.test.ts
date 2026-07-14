import { describe, it, expect } from "vitest";
import {
  normalizeCampaignStatus,
  resolveChannels,
  channelToService,
  channelLabel,
  computeFinalStatus,
  canSend,
  canCancel,
  canPause,
  canResume,
  canEditCritical,
  normalizeSendConfig,
  isWithinSendWindow,
  nextWindowStart,
  classifyFailure,
  canRetry,
  retryBackoffMs,
  shouldRetryDispatch,
  computeRateBudget,
  buildRecipientCounts,
  computeRecipientMetrics,
  estimateSmsCost,
  friendlyErrorMessage,
  groupErrorsByReason,
  summarizeChannels,
  computeSendTiming,
  parseWhatsAppStatusEvents,
} from "./campaigns";

describe("normalizeCampaignStatus", () => {
  it("passes through canonical statuses", () => {
    expect(normalizeCampaignStatus("rascunho")).toBe("rascunho");
    expect(normalizeCampaignStatus("em_envio")).toBe("em_envio");
    expect(normalizeCampaignStatus("parcialmente_enviada")).toBe("parcialmente_enviada");
    expect(normalizeCampaignStatus("cancelada")).toBe("cancelada");
  });

  it("maps legacy English statuses to canonical Portuguese", () => {
    expect(normalizeCampaignStatus("draft")).toBe("rascunho");
    expect(normalizeCampaignStatus("scheduled")).toBe("agendada");
    expect(normalizeCampaignStatus("sending")).toBe("em_envio");
    expect(normalizeCampaignStatus("paused")).toBe("pausada");
    expect(normalizeCampaignStatus("sent")).toBe("enviada");
    expect(normalizeCampaignStatus("partially_sent")).toBe("parcialmente_enviada");
    expect(normalizeCampaignStatus("failed")).toBe("falhou");
    expect(normalizeCampaignStatus("cancelled")).toBe("cancelada");
    expect(normalizeCampaignStatus("canceled")).toBe("cancelada");
  });

  it("defaults to rascunho for null/undefined/unknown", () => {
    expect(normalizeCampaignStatus(null)).toBe("rascunho");
    expect(normalizeCampaignStatus(undefined)).toBe("rascunho");
    expect(normalizeCampaignStatus("")).toBe("rascunho");
    expect(normalizeCampaignStatus("bogus")).toBe("rascunho");
  });
});

describe("resolveChannels", () => {
  it("prefers the multichannel channels array", () => {
    expect(resolveChannels({ type: "whatsapp", channels: ["sms", "email"] })).toEqual(["sms", "email"]);
  });

  it("falls back to legacy type when channels empty/missing", () => {
    expect(resolveChannels({ type: "whatsapp", channels: [] })).toEqual(["whatsapp"]);
    expect(resolveChannels({ type: "email", channels: null })).toEqual(["email"]);
    expect(resolveChannels({ type: "sms" })).toEqual(["sms"]);
  });

  it("returns empty when nothing usable", () => {
    expect(resolveChannels({ type: null, channels: null })).toEqual([]);
    expect(resolveChannels({})).toEqual([]);
  });

  it("drops invalid channels and de-duplicates", () => {
    expect(resolveChannels({ channels: ["sms", "bogus", "sms", "email"] })).toEqual(["sms", "email"]);
  });

  it("aliases whatsapp_official to whatsapp_oficial", () => {
    expect(resolveChannels({ channels: ["whatsapp_official"] })).toEqual(["whatsapp_oficial"]);
  });
});

describe("channelToService", () => {
  it("maps channels to storage service keys", () => {
    expect(channelToService("sms")).toBe("sms");
    expect(channelToService("whatsapp")).toBe("whatsapp");
    expect(channelToService("whatsapp_oficial")).toBe("whatsapp");
    expect(channelToService("email")).toBe("email");
    expect(channelToService("instagram")).toBe("instagram");
    expect(channelToService("facebook")).toBe("facebook");
  });
});

describe("channelLabel", () => {
  it("returns pt-BR labels and falls back to raw", () => {
    expect(channelLabel("whatsapp_oficial")).toBe("WhatsApp API Oficial");
    expect(channelLabel("email")).toBe("E-mail");
    expect(channelLabel("unknown")).toBe("unknown");
  });
});

describe("computeFinalStatus", () => {
  it("returns falhou for no attempts", () => {
    expect(computeFinalStatus([])).toBe("falhou");
  });

  it("returns enviada when all succeed", () => {
    expect(computeFinalStatus([{ ok: true }, { ok: true }])).toBe("enviada");
  });

  it("returns falhou when all fail", () => {
    expect(computeFinalStatus([{ ok: false }, { ok: false }])).toBe("falhou");
  });

  it("returns parcialmente_enviada when mixed", () => {
    expect(computeFinalStatus([{ ok: true }, { ok: false }])).toBe("parcialmente_enviada");
  });
});

describe("canSend", () => {
  it("blocks terminal statuses", () => {
    expect(canSend("enviada")).toBe(false);
    expect(canSend("sent")).toBe(false);
    expect(canSend("cancelada")).toBe(false);
    expect(canSend("cancelled")).toBe(false);
  });

  it("allows non-terminal statuses", () => {
    expect(canSend("rascunho")).toBe(true);
    expect(canSend("agendada")).toBe(true);
    expect(canSend("falhou")).toBe(true);
    expect(canSend("parcialmente_enviada")).toBe(true);
    expect(canSend(null)).toBe(true);
  });
});

describe("canCancel", () => {
  it("blocks enviada and cancelada", () => {
    expect(canCancel("enviada")).toBe(false);
    expect(canCancel("cancelada")).toBe(false);
  });

  it("allows other statuses", () => {
    expect(canCancel("rascunho")).toBe(true);
    expect(canCancel("em_envio")).toBe(true);
    expect(canCancel("agendada")).toBe(true);
  });
});

describe("canPause / canResume", () => {
  it("only em_envio can be paused", () => {
    expect(canPause("em_envio")).toBe(true);
    expect(canPause("sending")).toBe(true);
    expect(canPause("pausada")).toBe(false);
    expect(canPause("rascunho")).toBe(false);
  });
  it("only pausada can be resumed", () => {
    expect(canResume("pausada")).toBe(true);
    expect(canResume("paused")).toBe(true);
    expect(canResume("em_envio")).toBe(false);
  });
});

describe("canEditCritical", () => {
  it("allows editing drafts, scheduled and failed campaigns", () => {
    expect(canEditCritical("rascunho")).toBe(true);
    expect(canEditCritical("agendada")).toBe(true);
    expect(canEditCritical("falhou")).toBe(true);
  });
  it("blocks editing while in flight, paused, finalized or cancelled", () => {
    expect(canEditCritical("em_envio")).toBe(false);
    expect(canEditCritical("pausada")).toBe(false);
    expect(canEditCritical("enviada")).toBe(false);
    expect(canEditCritical("parcialmente_enviada")).toBe(false);
    expect(canEditCritical("cancelada")).toBe(false);
  });
});

describe("normalizeSendConfig", () => {
  it("returns undefined for empty/non-object", () => {
    expect(normalizeSendConfig(null)).toBeUndefined();
    expect(normalizeSendConfig({})).toBeUndefined();
    expect(normalizeSendConfig("x")).toBeUndefined();
  });
  it("clamps and coerces numeric fields", () => {
    const c = normalizeSendConfig({ ratePerMinute: "30", batchSize: 0, maxRetries: 99, intervalMs: -5 });
    expect(c?.ratePerMinute).toBe(30);
    expect(c?.batchSize).toBe(1); // clamped to min 1
    expect(c?.maxRetries).toBe(20); // clamped to max 20
    expect(c?.intervalMs).toBeUndefined(); // -5 clamped to 0 -> falsy -> dropped
  });
  it("keeps a valid window and drops malformed times", () => {
    const c = normalizeSendConfig({ window: { start: "08:00", end: "18:00", businessHoursOnly: true } });
    expect(c?.window?.start).toBe("08:00");
    expect(c?.window?.end).toBe("18:00");
    expect(c?.window?.businessHoursOnly).toBe(true);
    const bad = normalizeSendConfig({ window: { start: "99:99", end: "aa" } });
    expect(bad).toBeUndefined();
  });

  it("preserves the exact WhatsApp connection selected for the campaign", () => {
    expect(normalizeSendConfig({ waConnectionId: "connection-1" })).toEqual({
      waConnectionId: "connection-1",
    });
  });
});

describe("isWithinSendWindow", () => {
  // 2026-01-05 is a Monday. Use UTC offset 0 for deterministic assertions.
  const win = (o: object) => ({ timezoneOffsetMinutes: 0, ...o });
  it("is always open with no window / no hours", () => {
    expect(isWithinSendWindow(new Date(), null)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-01-05T03:00:00Z"), win({}))).toBe(true);
  });
  it("respects start/end hours", () => {
    const w = win({ start: "08:00", end: "18:00" });
    expect(isWithinSendWindow(new Date("2026-01-05T09:00:00Z"), w)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-01-05T07:59:00Z"), w)).toBe(false);
    expect(isWithinSendWindow(new Date("2026-01-05T18:00:00Z"), w)).toBe(false);
  });
  it("supports overnight windows", () => {
    const w = win({ start: "22:00", end: "06:00" });
    expect(isWithinSendWindow(new Date("2026-01-05T23:00:00Z"), w)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-01-05T05:00:00Z"), w)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-01-05T12:00:00Z"), w)).toBe(false);
  });
  it("blocks weekends when businessHoursOnly", () => {
    const w = win({ businessHoursOnly: true });
    expect(isWithinSendWindow(new Date("2026-01-05T12:00:00Z"), w)).toBe(true); // Monday
    expect(isWithinSendWindow(new Date("2026-01-04T12:00:00Z"), w)).toBe(false); // Sunday
  });
});

describe("nextWindowStart", () => {
  it("returns now when already open", () => {
    const now = new Date("2026-01-05T09:00:00Z");
    expect(nextWindowStart(now, { timezoneOffsetMinutes: 0, start: "08:00", end: "18:00" }).getTime()).toBe(now.getTime());
  });
  it("advances to the next open moment", () => {
    const now = new Date("2026-01-05T07:00:00Z");
    const next = nextWindowStart(now, { timezoneOffsetMinutes: 0, start: "08:00", end: "18:00" });
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(isWithinSendWindow(next, { timezoneOffsetMinutes: 0, start: "08:00", end: "18:00" })).toBe(true);
  });
});

describe("classifyFailure", () => {
  it("flags network/timeout/rate/5xx as temporary", () => {
    expect(classifyFailure("Request timeout")).toBe("temporary");
    expect(classifyFailure("ECONNRESET")).toBe("temporary");
    expect(classifyFailure("WHU HTTP 503")).toBe("temporary");
    expect(classifyFailure("Too many requests")).toBe("temporary");
  });
  it("treats config/auth/4xx/unknown as permanent", () => {
    expect(classifyFailure("Token WHU não configurado")).toBe("permanent");
    expect(classifyFailure("WHU HTTP 400")).toBe("permanent");
    expect(classifyFailure(null)).toBe("permanent");
  });
});

describe("SMS retry safety", () => {
  it("never automatically retries SMS after an ambiguous proxy failure", () => {
    expect(shouldRetryDispatch("sms", "Oktor SMS HTTP 502", 1, 3)).toBe(false);
    expect(shouldRetryDispatch("sms", "fetch failed", 1, 3)).toBe(false);
    expect(shouldRetryDispatch("whatsapp", "HTTP 503", 1, 3)).toBe(true);
  });
});

describe("canRetry / retryBackoffMs", () => {
  it("allows up to maxRetries extra attempts", () => {
    expect(canRetry(1, 2)).toBe(true);
    expect(canRetry(2, 2)).toBe(true);
    expect(canRetry(3, 2)).toBe(false);
  });
  it("defaults to 3 retries when unset", () => {
    expect(canRetry(3, undefined)).toBe(true);
    expect(canRetry(4, undefined)).toBe(false);
  });
  it("backoff grows and caps at 30 min", () => {
    expect(retryBackoffMs(1)).toBe(60000);
    expect(retryBackoffMs(2)).toBe(120000);
    expect(retryBackoffMs(20)).toBe(30 * 60000);
  });
});

describe("computeRateBudget", () => {
  it("caps by batchSize when no limits", () => {
    expect(computeRateBudget({ batchSize: 10, sentLastMinute: 0, sentLastHour: 0 })).toBe(10);
  });
  it("respects per-minute remaining", () => {
    expect(computeRateBudget({ ratePerMinute: 5, batchSize: 100, sentLastMinute: 3, sentLastHour: 3 })).toBe(2);
  });
  it("respects per-hour remaining", () => {
    expect(computeRateBudget({ ratePerHour: 100, batchSize: 100, sentLastMinute: 0, sentLastHour: 98 })).toBe(2);
  });
  it("never returns negative", () => {
    expect(computeRateBudget({ ratePerMinute: 5, batchSize: 100, sentLastMinute: 10, sentLastHour: 0 })).toBe(0);
  });
  it("uses a default cap when fully unbounded", () => {
    expect(computeRateBudget({ sentLastMinute: 0, sentLastHour: 0 })).toBe(100);
  });
});

describe("buildRecipientCounts", () => {
  it("tallies each status bucket and total", () => {
    const c = buildRecipientCounts([
      { status: "sent" }, { status: "delivered" }, { status: "read" },
      { status: "responded" }, { status: "failed" }, { status: "invalid" },
      { status: "cancelled" }, { status: "pending" }, { status: null }, {},
    ]);
    expect(c.total).toBe(10);
    expect(c.sent).toBe(1);
    expect(c.delivered).toBe(1);
    expect(c.read).toBe(1);
    expect(c.responded).toBe(1);
    expect(c.failed).toBe(1);
    expect(c.invalid).toBe(1);
    expect(c.cancelled).toBe(1);
    expect(c.pending).toBe(3);
  });
});

describe("computeRecipientMetrics", () => {
  it("computes rollups and rates", () => {
    const counts = buildRecipientCounts([
      { status: "sent" }, { status: "delivered" }, { status: "read" },
      { status: "responded" }, { status: "failed" }, { status: "pending" },
    ]);
    const m = computeRecipientMetrics(counts);
    expect(m.sentLike).toBe(4); // sent+delivered+read+responded
    expect(m.deliveredLike).toBe(3); // delivered+read+responded
    expect(m.readLike).toBe(2); // read+responded
    expect(m.failedLike).toBe(1);
    expect(m.deliveryRate).toBeCloseTo(3 / 4);
    expect(m.responseRate).toBeCloseTo(1 / 4);
    expect(m.failureRate).toBeCloseTo(1 / 6);
  });
  it("returns zero rates when nothing reached", () => {
    const m = computeRecipientMetrics(buildRecipientCounts([{ status: "pending" }]));
    expect(m.deliveryRate).toBe(0);
    expect(m.responseRate).toBe(0);
    expect(m.failureRate).toBe(0);
  });
});

describe("estimateSmsCost", () => {
  it("uses default cost per segment", () => {
    expect(estimateSmsCost(10)).toBeCloseTo(0.8);
  });
  it("respects custom cost and segments", () => {
    expect(estimateSmsCost(5, { costPerSegment: 0.1, segments: 2 })).toBeCloseTo(1.0);
  });
  it("is zero for no messages", () => {
    expect(estimateSmsCost(0)).toBe(0);
  });
});

describe("friendlyErrorMessage", () => {
  it("maps known provider errors", () => {
    expect(friendlyErrorMessage("Sem saldo")).toBe("Sem saldo no provedor");
    expect(friendlyErrorMessage("IP not allowed")).toBe("IP não autorizado no provedor");
    expect(friendlyErrorMessage("invalid number")).toBe("Número inválido");
    expect(friendlyErrorMessage("n8n proxy error")).toBe("Erro no proxy de envio (n8n)");
    expect(friendlyErrorMessage("bounce")).toBe("E-mail retornado (bounce)");
  });
  it("handles empty", () => {
    expect(friendlyErrorMessage("")).toBe("Erro desconhecido");
    expect(friendlyErrorMessage(null)).toBe("Erro desconhecido");
  });
});

describe("groupErrorsByReason", () => {
  it("groups failed/invalid by friendly message, sorted desc", () => {
    const groups = groupErrorsByReason([
      { status: "failed", errorReason: "sem saldo" },
      { status: "failed", errorReason: "sem saldo agora" },
      { status: "invalid", errorReason: "invalid number" },
      { status: "sent" },
      { status: "delivered" },
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].friendly).toBe("Sem saldo no provedor");
    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });
  it("ignores non-failed recipients", () => {
    expect(groupErrorsByReason([{ status: "sent" }, { status: "pending" }])).toEqual([]);
  });
});

describe("summarizeChannels", () => {
  it("groups by channel with metrics, sorted by total desc", () => {
    const res = summarizeChannels([
      { channel: "sms", status: "sent" },
      { channel: "sms", status: "failed" },
      { channel: "email", status: "delivered" },
    ]);
    expect(res[0].channel).toBe("sms");
    expect(res[0].label).toBe("SMS");
    expect(res[0].metrics.counts.total).toBe(2);
    expect(res[1].channel).toBe("email");
  });
});

describe("computeSendTiming", () => {
  it("computes start/end/duration and throughput", () => {
    const t = computeSendTiming([
      { status: "sent", sentAt: "2026-01-01T10:00:00Z" },
      { status: "sent", sentAt: "2026-01-01T10:10:00Z" },
    ]);
    expect(t.startedAt).toBe("2026-01-01T10:00:00.000Z");
    expect(t.finishedAt).toBe("2026-01-01T10:10:00.000Z");
    expect(t.durationMs).toBe(10 * 60000);
    expect(t.avgPerMinute).toBeCloseTo(0.2);
  });
  it("returns nulls when no timestamps", () => {
    const t = computeSendTiming([{ status: "pending" }]);
    expect(t.startedAt).toBeNull();
    expect(t.durationMs).toBeNull();
  });
});

// ─── Wizard step validation helpers ───────────────────────────────────────────
// These test the pure-logic helpers that underpin each wizard step's validation.

describe("Wizard Step 1 — campaign name validation", () => {
  const validName = (name: string) => typeof name === "string" && name.trim().length >= 3;
  it("accepts names with 3+ chars", () => {
    expect(validName("ABC")).toBe(true);
    expect(validName("Campanha de Junho")).toBe(true);
  });
  it("rejects names shorter than 3 chars", () => {
    expect(validName("AB")).toBe(false);
    expect(validName("")).toBe(false);
    expect(validName("  ")).toBe(false);
  });
});

describe("Wizard Step 2 — channel validation", () => {
  const VALID_CHANNELS = ["whatsapp", "email", "sms"];
  const validChannel = (type: string) => VALID_CHANNELS.includes(type);
  it("accepts valid channels", () => {
    expect(validChannel("whatsapp")).toBe(true);
    expect(validChannel("email")).toBe(true);
    expect(validChannel("sms")).toBe(true);
  });
  it("rejects unknown channels", () => {
    expect(validChannel("telegram")).toBe(false);
    expect(validChannel("")).toBe(false);
  });
});

describe("Wizard Step 3 — recipients validation", () => {
  const parseRecipients = (raw: string) =>
    raw.split(/[\n,;]+/).map((r) => r.trim()).filter(Boolean);
  it("parses comma-separated list", () => {
    expect(parseRecipients("11999990000,11888880001").length).toBe(2);
  });
  it("parses newline-separated list", () => {
    expect(parseRecipients("a@a.com\nb@b.com\nc@c.com").length).toBe(3);
  });
  it("rejects empty string", () => {
    expect(parseRecipients("").length).toBe(0);
    expect(parseRecipients("   ").length).toBe(0);
  });
  it("deduplicates separators", () => {
    expect(parseRecipients("a@a.com,,;b@b.com").length).toBe(2);
  });
});

describe("Wizard Step 4 — message validation", () => {
  const validMessage = (msg: string) => typeof msg === "string" && msg.trim().length >= 5;
  it("accepts messages with 5+ chars", () => {
    expect(validMessage("Hello")).toBe(true);
    expect(validMessage("Olá, tudo bem?")).toBe(true);
  });
  it("rejects short messages", () => {
    expect(validMessage("Hi")).toBe(false);
    expect(validMessage("")).toBe(false);
    expect(validMessage("    ")).toBe(false);
  });
});

describe("Wizard Step 5 — schedule validation", () => {
  const validSchedule = (mode: string, scheduledFor?: string) => {
    if (mode !== "agendar") return true;
    return !!scheduledFor && !isNaN(new Date(scheduledFor).getTime());
  };
  it("manual mode is always valid", () => {
    expect(validSchedule("manual")).toBe(true);
    expect(validSchedule("manual", undefined)).toBe(true);
  });
  it("agendar mode requires a valid date", () => {
    expect(validSchedule("agendar", "2026-12-01T10:00")).toBe(true);
    expect(validSchedule("agendar", "")).toBe(false);
    expect(validSchedule("agendar", undefined)).toBe(false);
    expect(validSchedule("agendar", "not-a-date")).toBe(false);
  });
});

describe("Wizard Review — SMS cost estimate", () => {
  it("computes cost proportional to recipients and segments", () => {
    // 1 SMS segment × 100 recipients × R$0.08 = R$8.00
    const cost = estimateSmsCost(100);
    expect(cost).toBeCloseTo(100 * 0.08, 2);
  });
  it("returns 0 for 0 recipients", () => {
    expect(estimateSmsCost(0)).toBe(0);
  });
  it("scales linearly", () => {
    expect(estimateSmsCost(200)).toBeCloseTo(estimateSmsCost(100) * 2, 5);
  });
});

describe("parseWhatsAppStatusEvents", () => {
  const buildBody = (statuses: any[]) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { statuses } }] }],
  });

  it("parses delivered/read/sent statuses with wamid and timestamp", () => {
    const body = buildBody([
      { id: "wamid.A", status: "delivered", timestamp: "1700000000" },
      { id: "wamid.B", status: "read", timestamp: "1700000100" },
    ]);
    expect(parseWhatsAppStatusEvents(body)).toEqual([
      { providerMessageId: "wamid.A", status: "delivered", timestamp: 1700000000, error: undefined },
      { providerMessageId: "wamid.B", status: "read", timestamp: 1700000100, error: undefined },
    ]);
  });

  it("lowercases the status", () => {
    const [ev] = parseWhatsAppStatusEvents(buildBody([{ id: "wamid.C", status: "DELIVERED" }]));
    expect(ev.status).toBe("delivered");
  });

  it("extracts the error title on failed statuses", () => {
    const [ev] = parseWhatsAppStatusEvents(
      buildBody([{ id: "wamid.D", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }]),
    );
    expect(ev.status).toBe("failed");
    expect(ev.error).toBe("Message undeliverable");
  });

  it("skips entries without an id or status", () => {
    const evs = parseWhatsAppStatusEvents(
      buildBody([{ status: "delivered" }, { id: "wamid.E" }, { id: "wamid.F", status: "sent" }]),
    );
    expect(evs.map((e) => e.providerMessageId)).toEqual(["wamid.F"]);
  });

  it("ignores payloads with no statuses (incoming messages only)", () => {
    const body = { entry: [{ changes: [{ value: { messages: [{ from: "551199" }] } }] }] };
    expect(parseWhatsAppStatusEvents(body)).toEqual([]);
  });

  it("is safe for malformed / empty input", () => {
    expect(parseWhatsAppStatusEvents(null)).toEqual([]);
    expect(parseWhatsAppStatusEvents({})).toEqual([]);
    expect(parseWhatsAppStatusEvents({ entry: "nope" })).toEqual([]);
  });
});
