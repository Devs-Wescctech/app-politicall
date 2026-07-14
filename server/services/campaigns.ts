import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  type CampaignChannel,
  type CampaignStatus,
  type CampaignSendConfig,
  type CampaignSendWindow,
} from "@shared/schema";

/**
 * Pure helpers for the multichannel Campaign Center.
 * No DB / network imports here so these rules stay unit-testable.
 */

const CHANNEL_SET = new Set<string>(CAMPAIGN_CHANNELS);
const STATUS_SET = new Set<string>(CAMPAIGN_STATUSES);

// Legacy English statuses -> canonical Portuguese statuses.
const LEGACY_STATUS_MAP: Record<string, CampaignStatus> = {
  draft: "rascunho",
  scheduled: "agendada",
  sending: "em_envio",
  paused: "pausada",
  sent: "enviada",
  partially_sent: "parcialmente_enviada",
  failed: "falhou",
  cancelled: "cancelada",
  canceled: "cancelada",
};

/** Normalize any stored status value (legacy or new) to the canonical set. */
export function normalizeCampaignStatus(raw: string | null | undefined): CampaignStatus {
  if (!raw) return "rascunho";
  if (STATUS_SET.has(raw)) return raw as CampaignStatus;
  return LEGACY_STATUS_MAP[raw] ?? "rascunho";
}

/**
 * Resolve the channels a campaign should dispatch on.
 * Prefers the multichannel `channels` array; falls back to the legacy single `type`.
 * Invalid/unknown channel values are dropped. Duplicates are removed.
 */
export function resolveChannels(campaign: {
  type?: string | null;
  channels?: string[] | null;
}): CampaignChannel[] {
  const source =
    campaign.channels && campaign.channels.length > 0
      ? campaign.channels
      : campaign.type
        ? [campaign.type]
        : [];
  const seen = new Set<string>();
  const out: CampaignChannel[] = [];
  for (const c of source) {
    const normalized = c === "whatsapp_official" ? "whatsapp_oficial" : c;
    if (CHANNEL_SET.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized as CampaignChannel);
    }
  }
  return out;
}

/** Map a campaign channel to the integration `service` key used in storage. */
export function channelToService(channel: string): string {
  switch (channel) {
    case "sms":
      return "sms";
    case "whatsapp":
    case "whatsapp_oficial":
      return "whatsapp";
    case "email":
      return "email";
    case "instagram":
    case "facebook":
      return channel;
    default:
      return channel;
  }
}

/** Human-readable channel label (pt-BR). */
export function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    whatsapp_oficial: "WhatsApp API Oficial",
    sms: "SMS",
    email: "E-mail",
    instagram: "Instagram",
    facebook: "Facebook",
  };
  return labels[channel] ?? channel;
}

/**
 * Compute the final campaign status from per-recipient send outcomes.
 * - no attempts        -> falhou
 * - all ok             -> enviada
 * - all failed         -> falhou
 * - mixed              -> parcialmente_enviada
 */
export function computeFinalStatus(results: { ok: boolean }[]): CampaignStatus {
  if (results.length === 0) return "falhou";
  const okCount = results.filter((r) => r.ok).length;
  if (okCount === 0) return "falhou";
  if (okCount === results.length) return "enviada";
  return "parcialmente_enviada";
}

/** Terminal statuses a campaign can no longer transition out of via send. */
const TERMINAL_STATUSES = new Set<CampaignStatus>(["enviada", "cancelada"]);

/** Whether a campaign in the given status may still be dispatched. */
export function canSend(status: string | null | undefined): boolean {
  return !TERMINAL_STATUSES.has(normalizeCampaignStatus(status));
}

/** Whether a campaign in the given status may be cancelled. */
export function canCancel(status: string | null | undefined): boolean {
  const s = normalizeCampaignStatus(status);
  return s !== "enviada" && s !== "cancelada";
}

// ==================== Phase 4 — scheduling & send control ====================

/** Statuses in which a campaign is actively being processed by the scheduler. */
const IN_FLIGHT_STATUSES = new Set<CampaignStatus>(["em_envio"]);
/** Terminal / finalized statuses (send finished one way or another). */
const FINALIZED_STATUSES = new Set<CampaignStatus>(["enviada", "parcialmente_enviada", "cancelada"]);

/** A campaign in em_envio may be paused. */
export function canPause(status: string | null | undefined): boolean {
  return normalizeCampaignStatus(status) === "em_envio";
}

/** A paused campaign may be resumed. */
export function canResume(status: string | null | undefined): boolean {
  return normalizeCampaignStatus(status) === "pausada";
}

/**
 * Whether critical fields (message, recipients, channels, schedule) may be edited.
 * Blocked while a campaign is in flight, paused, finalized or cancelled — only
 * editable drafts, scheduled campaigns and fully-failed campaigns may change.
 */
export function canEditCritical(status: string | null | undefined): boolean {
  const s = normalizeCampaignStatus(status);
  return !IN_FLIGHT_STATUSES.has(s) && !FINALIZED_STATUSES.has(s) && s !== "pausada";
}

/**
 * Clamp/normalize a raw send config into safe bounds. Returns undefined when
 * nothing meaningful is set so we don't persist an empty object.
 */
export function normalizeSendConfig(raw: unknown): CampaignSendConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const clampInt = (v: unknown, min: number, max: number): number | undefined => {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
    if (!Number.isFinite(n)) return undefined;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  };
  const out: CampaignSendConfig = {};
  if (typeof r.waConnectionId === "string" && r.waConnectionId.trim()) {
    out.waConnectionId = r.waConnectionId.trim();
  }
  const ratePerMinute = clampInt(r.ratePerMinute, 0, 100000);
  const ratePerHour = clampInt(r.ratePerHour, 0, 1000000);
  const intervalMs = clampInt(r.intervalMs, 0, 600000);
  const batchSize = clampInt(r.batchSize, 1, 10000);
  const maxRetries = clampInt(r.maxRetries, 0, 20);
  if (ratePerMinute) out.ratePerMinute = ratePerMinute;
  if (ratePerHour) out.ratePerHour = ratePerHour;
  if (intervalMs) out.intervalMs = intervalMs;
  if (batchSize) out.batchSize = batchSize;
  if (maxRetries != null) out.maxRetries = maxRetries;

  const w = r.window as Record<string, unknown> | undefined;
  if (w && typeof w === "object") {
    const window: CampaignSendWindow = {};
    const isHHMM = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (isHHMM(w.start)) window.start = w.start;
    if (isHHMM(w.end)) window.end = w.end;
    if (w.businessHoursOnly === true) window.businessHoursOnly = true;
    const tz = clampInt(w.timezoneOffsetMinutes, -840, 840);
    if (tz != null) window.timezoneOffsetMinutes = tz;
    if (Object.keys(window).length > 0) out.window = window;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Convert "HH:MM" into minutes-of-day. Returns null when malformed. */
function hhmmToMinutes(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Apply a UTC offset (minutes) to a Date, returning the shifted "local" Date (UTC fields). */
function toLocal(now: Date, offsetMinutes: number): Date {
  return new Date(now.getTime() + offsetMinutes * 60000);
}

/**
 * Whether `now` falls inside the configured send window.
 * No window / no start+end => always open. Respects businessHoursOnly (Mon–Fri)
 * and the window timezone offset (default BRT, -180).
 */
export function isWithinSendWindow(now: Date, window?: CampaignSendWindow | null): boolean {
  if (!window) return true;
  const offset = window.timezoneOffsetMinutes ?? -180;
  const local = toLocal(now, offset);
  if (window.businessHoursOnly) {
    const dow = local.getUTCDay(); // 0 Sun … 6 Sat
    if (dow === 0 || dow === 6) return false;
  }
  const start = hhmmToMinutes(window.start);
  const end = hhmmToMinutes(window.end);
  if (start == null || end == null || start === end) return true; // hours not constrained
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (start < end) return minutes >= start && minutes < end;
  // Overnight window (e.g. 22:00–06:00)
  return minutes >= start || minutes < end;
}

/**
 * Compute the next moment (UTC Date) the window opens at/after `now`.
 * Returns `now` when the window is already open or unconstrained.
 */
export function nextWindowStart(now: Date, window?: CampaignSendWindow | null): Date {
  if (!window || isWithinSendWindow(now, window)) return now;
  const offset = window.timezoneOffsetMinutes ?? -180;
  const start = hhmmToMinutes(window.start);
  // Step forward in 15-min increments up to 8 days to find the next open slot.
  const step = 15 * 60000;
  const limit = now.getTime() + 8 * 24 * 60 * 60000;
  // Align to window start-of-day when hours are constrained for a tighter result.
  let t = now.getTime();
  if (start != null) {
    const local = toLocal(now, offset);
    const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    const candidate = localMidnight + start * 60000 - offset * 60000;
    if (candidate > now.getTime()) t = candidate;
  }
  for (; t <= limit; t += step) {
    if (isWithinSendWindow(new Date(t), window)) return new Date(t);
  }
  return new Date(now.getTime() + 60 * 60000); // fallback: retry in an hour
}

/**
 * Classify a dispatch error as "temporary" (worth retrying) or "permanent".
 * Network issues, timeouts, rate limits and 5xx are temporary; everything
 * else (bad number/config/auth/4xx) is treated as permanent.
 */
export function classifyFailure(error: string | null | undefined): "temporary" | "permanent" {
  if (!error) return "permanent";
  const e = error.toLowerCase();
  const temporary = [
    "timeout", "timed out", "etimedout", "econnreset", "econnrefused",
    "enotfound", "eai_again", "network", "socket hang up", "fetch failed",
    "rate limit", "too many requests", "429",
    "http 500", "http 502", "http 503", "http 504",
    " 500", " 502", " 503", " 504",
    "temporar", "unavailable", "service unavailable",
  ];
  return temporary.some((t) => e.includes(t)) ? "temporary" : "permanent";
}

/** Whether another attempt is allowed given attempts made and the max cap. */
export function canRetry(attempts: number, maxRetries: number | undefined): boolean {
  const cap = maxRetries == null ? 3 : maxRetries;
  return attempts < cap + 1; // attempts counts the initial try; allow `cap` extra retries
}

/** Exponential backoff (ms) for the Nth retry (1-based), capped at 30 min. */
/** SMS transport errors are ambiguous: the provider may have accepted the send before the proxy timed out. */
export function shouldRetryDispatch(channel: string, error: string | null | undefined, attempts: number, maxRetries: number | undefined): boolean {
  if (channel === "sms") return false;
  return classifyFailure(error) === "temporary" && canRetry(attempts, maxRetries);
}

export function retryBackoffMs(attempts: number): number {
  const base = 60000; // 1 minute
  const ms = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(ms, 30 * 60000);
}

/** A delivery/read status update parsed from a WhatsApp Cloud API webhook. */
export type WhatsAppStatusEvent = {
  /** wamid of the outbound message this status refers to. */
  providerMessageId: string;
  /** Meta status: sent | delivered | read | failed (lowercased). */
  status: string;
  /** Unix-seconds timestamp when the status occurred, if present. */
  timestamp?: number;
  /** Provider error title/detail when status === "failed". */
  error?: string;
};

/**
 * Pure parser for WhatsApp Cloud API "statuses" webhook payloads. Meta posts
 * delivery/read receipts under entry[].changes[].value.statuses[] with an `id`
 * (the wamid we stored as providerMessageId) and a `status`. Network/DB-free so
 * it stays unit-testable; callers apply the updates to recipient rows.
 */
export function parseWhatsAppStatusEvents(body: any): WhatsAppStatusEvent[] {
  const out: WhatsAppStatusEvent[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = change?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const s of statuses) {
        const id = s?.id ?? s?.message_id;
        const status = typeof s?.status === "string" ? s.status.toLowerCase() : "";
        if (!id || !status) continue;
        const tsRaw = s?.timestamp;
        const timestamp = tsRaw != null && !isNaN(Number(tsRaw)) ? Number(tsRaw) : undefined;
        let error: string | undefined;
        const errs = s?.errors;
        if (Array.isArray(errs) && errs.length) {
          const e = errs[0];
          error = e?.title || e?.message || e?.error_data?.details || (e?.code != null ? `WhatsApp error ${e.code}` : undefined);
        }
        out.push({ providerMessageId: String(id), status, timestamp, error });
      }
    }
  }
  return out;
}

/**
 * Given rate limits and how many messages were already sent in the trailing
 * minute/hour, compute how many may be dispatched in this tick (also capped by
 * batchSize). Returns a non-negative integer.
 */
export function computeRateBudget(params: {
  ratePerMinute?: number;
  ratePerHour?: number;
  batchSize?: number;
  sentLastMinute: number;
  sentLastHour: number;
}): number {
  const { ratePerMinute, ratePerHour, batchSize, sentLastMinute, sentLastHour } = params;
  let budget = batchSize && batchSize > 0 ? batchSize : Number.POSITIVE_INFINITY;
  if (ratePerMinute && ratePerMinute > 0) {
    budget = Math.min(budget, Math.max(0, ratePerMinute - sentLastMinute));
  }
  if (ratePerHour && ratePerHour > 0) {
    budget = Math.min(budget, Math.max(0, ratePerHour - sentLastHour));
  }
  if (!Number.isFinite(budget)) return batchSize && batchSize > 0 ? batchSize : 100; // default cap when unbounded
  return Math.max(0, Math.trunc(budget));
}

// ==================== Phase 5 — reports, metrics & exports ====================

/** Minimal recipient shape the reporting helpers operate on. */
export type RecipientLite = {
  status?: string | null;
  channel?: string | null;
  errorReason?: string | null;
  sentAt?: Date | string | null;
  deliveredAt?: Date | string | null;
};

/** Canonical per-status recipient counts (plus total). */
export type RecipientCounts = {
  total: number;
  pending: number;
  sent: number;       // dispatched (status === sent)
  delivered: number;
  read: number;
  responded: number;
  failed: number;
  invalid: number;
  cancelled: number;
};

/** Tally recipients by their canonical per-status buckets. */
export function buildRecipientCounts(recipients: RecipientLite[]): RecipientCounts {
  const c: RecipientCounts = {
    total: 0, pending: 0, sent: 0, delivered: 0, read: 0,
    responded: 0, failed: 0, invalid: 0, cancelled: 0,
  };
  for (const r of recipients) {
    c.total++;
    const s = String(r.status ?? "pending");
    switch (s) {
      case "sent": c.sent++; break;
      case "delivered": c.delivered++; break;
      case "read": c.read++; break;
      case "responded": c.responded++; break;
      case "failed": c.failed++; break;
      case "invalid": c.invalid++; break;
      case "cancelled": c.cancelled++; break;
      default: c.pending++; break;
    }
  }
  return c;
}

/** Derived rollups + rates from canonical counts (rates are fractions 0..1). */
export type RecipientMetrics = {
  counts: RecipientCounts;
  sentLike: number;       // reached the provider at least (sent+delivered+read+responded)
  deliveredLike: number;  // confirmed delivered (delivered+read+responded)
  readLike: number;       // read or later (read+responded)
  failedLike: number;     // failed+invalid
  deliveryRate: number;   // deliveredLike / sentLike
  responseRate: number;   // responded / sentLike
  failureRate: number;    // failedLike / total
};

/** Compute rollups and delivery/response/failure rates from recipient counts. */
export function computeRecipientMetrics(counts: RecipientCounts): RecipientMetrics {
  const sentLike = counts.sent + counts.delivered + counts.read + counts.responded;
  const deliveredLike = counts.delivered + counts.read + counts.responded;
  const readLike = counts.read + counts.responded;
  const failedLike = counts.failed + counts.invalid;
  const safe = (num: number, den: number) => (den > 0 ? num / den : 0);
  return {
    counts,
    sentLike,
    deliveredLike,
    readLike,
    failedLike,
    deliveryRate: safe(deliveredLike, sentLike),
    responseRate: safe(counts.responded, sentLike),
    failureRate: safe(failedLike, counts.total),
  };
}

/**
 * Estimate SMS cost. `costPerSegment` defaults to R$0.08 and each 160-char
 * message counts as one segment. Only counts messages that reached the provider.
 */
export function estimateSmsCost(
  smsReached: number,
  opts?: { costPerSegment?: number; segments?: number },
): number {
  const cost = opts?.costPerSegment ?? 0.08;
  const segments = Math.max(1, opts?.segments ?? 1);
  const value = smsReached * segments * cost;
  return Math.round(value * 100) / 100;
}

/** Map a technical provider error to a friendly pt-BR message. */
export function friendlyErrorMessage(reason: string | null | undefined): string {
  if (!reason || !String(reason).trim()) return "Erro desconhecido";
  const e = String(reason).toLowerCase();
  if (e.includes("sem saldo") || e.includes("no balance") || e.includes("insufficient")) return "Sem saldo no provedor";
  if (e.includes("ip") && (e.includes("autoriz") || e.includes("allow") || e.includes("whitelist"))) return "IP não autorizado no provedor";
  if (e.includes("client") && (e.includes("inval") || e.includes("not found"))) return "Client inválido no provedor";
  if (e.includes("n8n") || e.includes("proxy")) return "Erro no proxy de envio (n8n)";
  if (e.includes("invalid") && (e.includes("number") || e.includes("phone") || e.includes("numero"))) return "Número inválido";
  if (e.includes("invalid") && e.includes("email")) return "E-mail inválido";
  if (e.includes("bounce")) return "E-mail retornado (bounce)";
  if (e.includes("spam")) return "Marcado como spam";
  if (e.includes("unsubscrib") || e.includes("descadastr")) return "Contato descadastrado";
  if (e.includes("rate limit") || e.includes("too many requests") || e.includes("429")) return "Limite de envio do provedor atingido";
  if (e.includes("timeout") || e.includes("timed out") || e.includes("etimedout")) return "Tempo de resposta esgotado";
  if (e.includes("network") || e.includes("econn") || e.includes("fetch failed") || e.includes("enotfound")) return "Falha de conexão com o provedor";
  if (
    e.includes("502") || e.includes("503") || e.includes("504") ||
    e.includes("bad gateway") || e.includes("gateway time") ||
    e.includes("service unavailable") || e.includes("temporar")
  ) return "Serviço temporariamente indisponível. Tente novamente em alguns minutos.";
  if (e.includes("unauthorized") || e.includes("auth") || e.includes("401") || e.includes("403")) return "Falha de autenticação no provedor";
  if (e.includes("template")) return "Problema com o template da mensagem";
  // Fallback: strip any leftover HTML markup so raw gateway pages never leak.
  const stripped = String(reason).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return (stripped || "Erro desconhecido").slice(0, 140);
}

/** Grouped failure reason with a count and a friendly label. */
export type ErrorGroup = { reason: string; friendly: string; count: number };

/**
 * Group failed/invalid recipients by their friendly error message, sorted by
 * count desc. Non-failed recipients are ignored.
 */
export function groupErrorsByReason(recipients: RecipientLite[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();
  for (const r of recipients) {
    const s = String(r.status ?? "");
    if (s !== "failed" && s !== "invalid") continue;
    const friendly = friendlyErrorMessage(r.errorReason);
    const key = friendly;
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { reason: (r.errorReason ?? "").toString().slice(0, 200), friendly, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** Per-channel metrics keyed by channel. */
export type ChannelSummary = { channel: string; label: string; metrics: RecipientMetrics };

/** Summarize recipients grouped by channel with full metrics per channel. */
export function summarizeChannels(recipients: RecipientLite[]): ChannelSummary[] {
  const byChannel = new Map<string, RecipientLite[]>();
  for (const r of recipients) {
    const ch = String(r.channel ?? "desconhecido");
    const arr = byChannel.get(ch) ?? [];
    arr.push(r);
    byChannel.set(ch, arr);
  }
  const out: ChannelSummary[] = [];
  for (const [channel, list] of byChannel) {
    out.push({
      channel,
      label: channelLabel(channel),
      metrics: computeRecipientMetrics(buildRecipientCounts(list)),
    });
  }
  return out.sort((a, b) => b.metrics.counts.total - a.metrics.counts.total);
}

/** Send timing summary derived from recipient timestamps. */
export type SendTiming = {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  avgPerMinute: number | null; // reached messages / minutes elapsed
};

/** Compute start/end/duration/throughput from recipient sent/delivered timestamps. */
export function computeSendTiming(recipients: RecipientLite[]): SendTiming {
  const toMs = (v: Date | string | null | undefined): number | null => {
    if (!v) return null;
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  let min: number | null = null;
  let max: number | null = null;
  let reached = 0;
  for (const r of recipients) {
    const s = String(r.status ?? "");
    if (s === "sent" || s === "delivered" || s === "read" || s === "responded") reached++;
    for (const t of [toMs(r.sentAt), toMs(r.deliveredAt)]) {
      if (t == null) continue;
      if (min == null || t < min) min = t;
      if (max == null || t > max) max = t;
    }
  }
  if (min == null || max == null) {
    return { startedAt: null, finishedAt: null, durationMs: null, avgPerMinute: null };
  }
  const durationMs = Math.max(0, max - min);
  const minutes = durationMs / 60000;
  const avgPerMinute = minutes > 0 ? Math.round((reached / minutes) * 100) / 100 : reached > 0 ? reached : null;
  return {
    startedAt: new Date(min).toISOString(),
    finishedAt: new Date(max).toISOString(),
    durationMs,
    avgPerMinute,
  };
}
