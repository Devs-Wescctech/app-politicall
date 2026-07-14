/**
 * Pure, dependency-free helpers for campaign templates & messages (Phase 3).
 * Shared by client (live preview) and server (dispatch). Keep it network/DB-free
 * so it stays fully unit-testable and safe to import from the browser bundle.
 */

import { extractWhatsAppTemplateVariables } from "./whatsapp-template-variables";

// Supported dynamic variables offered to the user in message models.
export const TEMPLATE_VARIABLES = ["nome", "telefone", "cidade", "protocolo", "link"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateContext = Record<string, string | number | null | undefined>;

const VAR_TOKEN = /\{\s*([a-zA-Z0-9_]+)\s*\}/g;

/** Extract the distinct variable names referenced by a template (in order of first use). */
export function extractVariables(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_TOKEN.lastIndex = 0;
  while ((m = VAR_TOKEN.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Variables referenced by a template that are NOT in the supported list. */
export function unknownVariables(text: string | null | undefined): string[] {
  const supported = new Set<string>(TEMPLATE_VARIABLES);
  return extractVariables(text).filter((v) => !supported.has(v));
}

/**
 * Replace {var} tokens with values from ctx (case-insensitive keys).
 * Missing/blank values become an empty string. Unknown tokens are left as-is
 * only when keepMissing=true (used for the editor); default removes them.
 */
export function renderTemplate(
  text: string | null | undefined,
  ctx: TemplateContext,
  opts: { keepMissing?: boolean } = {},
): string {
  if (!text) return "";
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v === null || v === undefined) continue;
    lookup[k.toLowerCase()] = String(v);
  }
  return text.replace(VAR_TOKEN, (whole, name: string) => {
    const key = name.toLowerCase();
    if (key in lookup) return lookup[key];
    return opts.keepMissing ? whole : "";
  });
}

/** True when the message has no meaningful (non-whitespace) content. */
export function isBlankMessage(text: string | null | undefined): boolean {
  return !text || text.trim().length === 0;
}

// GSM 03.38 basic charset + extension chars (each extension char costs 2 septets).
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

const GSM_BASIC_SET = new Set(GSM_BASIC.split(""));
const GSM_EXT_SET = new Set(GSM_EXT.split(""));

export type SmsEncoding = "GSM" | "UCS2";

export type SmsSegments = {
  encoding: SmsEncoding;
  /** Character count as perceived by the user. */
  length: number;
  /** Billable unit count (septets for GSM, code units for UCS2). */
  units: number;
  /** Approximate number of SMS parts. */
  parts: number;
  /** Max units for a single part at the detected encoding. */
  perSingle: number;
  /** Max units per part when concatenated (multipart). */
  perConcat: number;
};

/**
 * Compute SMS length + approximate part count.
 * GSM-7: 160 single / 153 concatenated. UCS-2 (unicode): 70 single / 67 concatenated.
 * Falls back to UCS-2 as soon as any non-GSM character is present.
 */
export function smsSegments(text: string | null | undefined): SmsSegments {
  const value = text ?? "";
  const chars = Array.from(value);
  let isGsm = true;
  let units = 0;
  for (const ch of chars) {
    if (GSM_BASIC_SET.has(ch)) {
      units += 1;
    } else if (GSM_EXT_SET.has(ch)) {
      units += 2;
    } else {
      isGsm = false;
      break;
    }
  }
  if (!isGsm) {
    // UCS-2: count UTF-16 code units.
    units = value.length;
    const perSingle = 70;
    const perConcat = 67;
    const parts = units === 0 ? 0 : units <= perSingle ? 1 : Math.ceil(units / perConcat);
    return { encoding: "UCS2", length: chars.length, units, parts, perSingle, perConcat };
  }
  const perSingle = 160;
  const perConcat = 153;
  const parts = units === 0 ? 0 : units <= perSingle ? 1 : Math.ceil(units / perConcat);
  return { encoding: "GSM", length: chars.length, units, parts, perSingle, perConcat };
}

// WhatsApp API Oficial: only APPROVED templates may be used to start a broadcast.
// Everything else (REJECTED, PAUSED, DISABLED, PENDING, IN_APPEAL, etc.) is blocked.
const WA_USABLE = new Set(["APPROVED"]);

export function isWaTemplateUsable(status: string | null | undefined): boolean {
  if (!status) return false;
  return WA_USABLE.has(String(status).toUpperCase());
}

/** Reason a WhatsApp template cannot be used, or null when it is usable. */
export function waTemplateBlockReason(status: string | null | undefined): string | null {
  if (isWaTemplateUsable(status)) return null;
  const s = String(status ?? "").toUpperCase();
  if (!s) return "Template sem status informado";
  if (s === "REJECTED") return "Template rejeitado pela Meta";
  if (s === "PAUSED") return "Template pausado pela Meta";
  if (s === "DISABLED") return "Template desativado";
  if (s === "PENDING") return "Template pendente de aprovação";
  return `Template indisponível (${s})`;
}

/**
 * Extract the ordered {{1}}, {{2}} positional variables a WhatsApp official
 * template BODY expects, so the UI can render one input per position.
 */
export function waTemplateBodyVariables(template: {
  components?: Array<{ type?: string; text?: string }> | null;
}): number[] {
  return extractWhatsAppTemplateVariables(template)
    .filter(variable => variable.componentType === "body" && Number.isFinite(Number(variable.token)))
    .map(variable => Number(variable.token));
}

/** Build a contact render context from a contact-like record. */
export function contactTemplateContext(
  contact: {
    name?: string | null;
    phone?: string | null;
    city?: string | null;
    protocol?: string | null;
    link?: string | null;
  } | null | undefined,
  extra: TemplateContext = {},
): TemplateContext {
  return {
    nome: contact?.name ?? "",
    telefone: contact?.phone ?? "",
    cidade: contact?.city ?? "",
    protocolo: contact?.protocol ?? "",
    link: contact?.link ?? "",
    ...extra,
  };
}
