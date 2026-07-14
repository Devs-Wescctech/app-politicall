/**
 * Pure, dependency-free helpers for parsing campaign recipient lists.
 *
 * The recipient textarea accepts ONE recipient per line. Each line may include a
 * name using either separator:  "telefone;nome"  or  "telefone,nome"  (the phone
 * / email and the name in any order). Legacy lines with several bare numbers
 * separated by ; or , (and no name) are still expanded into one recipient each.
 *
 * No network / DB access — safe to share between client, server and tests.
 */
import { normalizeBrazilPhone } from "./phone";

export type ParsedRecipient = {
  /** Normalized phone (+55…) or email actually targeted. */
  recipient: string;
  /** Optional display name captured from the line. */
  name?: string;
  /** Original (trimmed) source line. */
  raw: string;
};

export type ParseRecipientsResult = {
  entries: ParsedRecipient[];
  /** Lines that carried no usable phone/email for the channel. */
  invalidLines: string[];
};

/** A stored recipient may be a bare string (legacy) or an object with a name. */
export type RecipientInput = string | { recipient?: string | null; name?: string | null };

export type RecipientRecord = { recipient: string; name?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether a token looks like an email address. */
export function looksLikeEmail(token: string | null | undefined): boolean {
  return EMAIL_RE.test(String(token ?? "").trim());
}

/** Whether a token looks like a phone number (enough digits, not a name). */
export function looksLikePhone(token: string | null | undefined): boolean {
  const t = String(token ?? "").trim();
  if (!t) return false;
  if (looksLikeEmail(t)) return false;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  const letters = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  // A phone token may carry a stray letter, but should be digit-dominated.
  return digits.length >= letters;
}

/** Split one line into its trimmed fields, separated by ";" or ",". */
function splitFields(line: string): string[] {
  return line
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Parse a single line into { recipient, name }.
 * Returns null for blank lines. When no usable id token is found, `recipient`
 * is "" and the caller should treat the line as invalid.
 */
export function parseRecipientLine(line: string, channel: string): ParsedRecipient | null {
  const raw = String(line ?? "").trim();
  if (!raw) return null;
  const isEmail = channel === "email";
  const detector = isEmail ? looksLikeEmail : looksLikePhone;
  const fields = splitFields(raw);
  if (fields.length === 0) return { recipient: "", raw };

  const idField = fields.find(detector);
  if (!idField) {
    // No phone/email — keep the leftover text as a (useless) name for context.
    return { recipient: "", name: fields.join(" ") || undefined, raw };
  }
  const recipient = isEmail ? idField : normalizeBrazilPhone(idField);
  const name = fields.filter((f) => f !== idField && !detector(f)).join(" ").trim();
  return { recipient, name: name || undefined, raw };
}

/**
 * Parse the whole textarea. Splits by NEWLINE only, then interprets each line.
 * Deduplicates by resolved recipient while preserving order.
 */
export function parseRecipients(text: string | null | undefined, channel: string): ParseRecipientsResult {
  const lines = String(text ?? "").split(/\r?\n/);
  const isEmail = channel === "email";
  const detector = isEmail ? looksLikeEmail : looksLikePhone;
  const entries: ParsedRecipient[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  const push = (recipient: string, name: string | undefined, raw: string) => {
    if (!recipient || seen.has(recipient)) return;
    seen.add(recipient);
    entries.push(name ? { recipient, name, raw } : { recipient, raw });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = splitFields(trimmed);
    const idFields = fields.filter(detector);
    const nameFields = fields.filter((f) => !detector(f));

    if (idFields.length === 0) {
      invalidLines.push(trimmed);
      continue;
    }
    if (idFields.length >= 2 && nameFields.length === 0) {
      // Legacy: several bare numbers/emails on one line, no name.
      for (const idf of idFields) push(isEmail ? idf : normalizeBrazilPhone(idf), undefined, trimmed);
    } else {
      const recipient = isEmail ? idFields[0] : normalizeBrazilPhone(idFields[0]);
      const name = nameFields.join(" ").trim() || undefined;
      push(recipient, name, trimmed);
    }
  }
  return { entries, invalidLines };
}

/** Count usable recipients in the textarea. */
export function countRecipients(text: string | null | undefined, channel: string): number {
  return parseRecipients(text, channel).entries.length;
}

/** Convert textarea contents to the payload sent to the API. */
export function recipientsToPayload(text: string | null | undefined, channel: string): RecipientRecord[] {
  return parseRecipients(text, channel).entries.map((e) =>
    e.name ? { recipient: e.recipient, name: e.name } : { recipient: e.recipient },
  );
}

/**
 * "Adicionar +55" helper: re-normalize phone tokens per line while preserving
 * names and leaving name-only lines untouched. Deduplicates the result.
 */
export function normalizeRecipientsText(text: string | null | undefined, channel: string): string {
  const lines = String(text ?? "").split(/\r?\n/);
  const isEmail = channel === "email";
  const detector = isEmail ? looksLikeEmail : looksLikePhone;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (v: string) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = splitFields(trimmed);
    const idFields = fields.filter(detector);
    const nameFields = fields.filter((f) => !detector(f));

    if (idFields.length === 0) {
      add(trimmed); // leave lines without a phone/email as-is
      continue;
    }
    if (idFields.length >= 2 && nameFields.length === 0) {
      for (const idf of idFields) add(isEmail ? idf : normalizeBrazilPhone(idf));
    } else {
      const id = isEmail ? idFields[0] : normalizeBrazilPhone(idFields[0]);
      const name = nameFields.join(" ").trim();
      add(name ? `${id};${name}` : id);
    }
  }
  return out.join("\n");
}

/**
 * Normalize a stored recipients value (array of strings and/or objects) into
 * clean { recipient, name? } records. Accepts legacy "phone;name" encoded
 * strings too. Deduplicates by recipient.
 */
export function toRecipientRecords(raw: unknown, channel: string): RecipientRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipientRecord[] = [];
  const seen = new Set<string>();
  const isEmail = channel === "email";

  for (const item of raw as RecipientInput[]) {
    let recipient = "";
    let name: string | undefined;

    if (typeof item === "string") {
      const parsed = parseRecipientLine(item, channel);
      if (parsed?.recipient) {
        recipient = parsed.recipient;
        name = parsed.name;
      } else {
        // Fall back to the raw string (e.g. already-normalized value).
        recipient = item.trim();
      }
    } else if (item && typeof item === "object") {
      const rawRecipient = String(item.recipient ?? "").trim();
      recipient = isEmail || !rawRecipient ? rawRecipient : normalizeBrazilPhone(rawRecipient) || rawRecipient;
      const n = item.name != null ? String(item.name).trim() : "";
      name = n || undefined;
    }

    if (!recipient || seen.has(recipient)) continue;
    seen.add(recipient);
    out.push(name ? { recipient, name } : { recipient });
  }
  return out;
}

/** Just the resolved recipient strings from a stored recipients value. */
export function toRecipientStrings(raw: unknown, channel: string): string[] {
  return toRecipientRecords(raw, channel).map((r) => r.recipient);
}
