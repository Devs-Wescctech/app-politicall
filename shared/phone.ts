/**
 * Pure, dependency-free helpers for Brazilian phone normalization.
 * Shared by client (recipient editing) and tests. Network/DB-free.
 */

/** Keep only a leading "+" (if present) and digits. */
export function cleanPhoneInput(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Normalize a single Brazilian phone number to +55 (E.164-ish) form.
 * - strips spaces, parentheses, dashes and other separators
 * - preserves an existing 55 / +55 country code
 * - preserves other international numbers typed with a leading "+"
 * - adds +55 when a local 10/11 digit number has no country code
 * Returns "" when there are no usable digits.
 */
export function normalizeBrazilPhone(value: string | null | undefined): string {
  const cleaned = cleanPhoneInput(value);
  if (!cleaned) return "";
  const hadPlus = cleaned.startsWith("+");
  const digits = cleaned.replace(/^\+/, "");
  if (!digits) return "";

  // Already carries the Brazilian country code (12 = landline, 13 = mobile).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Some other international number explicitly typed with "+": keep as provided.
  if (hadPlus && !digits.startsWith("55")) {
    return `+${digits}`;
  }

  // Local Brazilian number (10 = landline, 11 = mobile) without DDI.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Fallback: honor an explicit "+", otherwise assume Brazil.
  return hadPlus ? `+${digits}` : `+55${digits}`;
}

/** Whether a value already looks like it carries a country code / DDI. */
export function hasCountryCode(value: string | null | undefined): boolean {
  const cleaned = cleanPhoneInput(value);
  if (!cleaned) return false;
  if (cleaned.startsWith("+")) return true;
  const digits = cleaned.replace(/^\+/, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
}

/**
 * Split a free-text list (newline / comma / semicolon separated) into normalized
 * +55 phone numbers, dropping blanks and de-duplicating while preserving order.
 */
export function normalizePhoneList(text: string | null | undefined): string[] {
  const parts = String(text ?? "").split(/[\n,;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizeBrazilPhone(p);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
