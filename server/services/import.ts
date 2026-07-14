/**
 * Pure import helpers for the Campaign Center.
 * File -> rows parsing lives in the route (SheetJS for xlsx). Everything from
 * "rows" onward (mapping, dedupe, validation, invalid separation) is here and
 * unit-testable with no DB / network.
 */

export type ImportRow = Record<string, string>;

/** Canonical target fields an import can map onto. */
export const IMPORT_FIELDS = [
  "name",
  "phone",
  "email",
  "city",
  "neighborhood",
  "state",
  "gender",
  "age",
  "interests",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ImportContact {
  name: string;
  phone: string;
  email: string;
  city: string;
  neighborhood: string;
  state: string;
  gender: string;
  age: number | null;
  interests: string[];
  validPhone: boolean;
  validEmail: boolean;
}

export interface ImportResult {
  valid: ImportContact[];
  invalid: { contact: ImportContact; reason: string }[];
  duplicates: ImportContact[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

/** Common header aliases (accent/case-insensitive) -> canonical field. */
const HEADER_ALIASES: Record<string, ImportField> = {
  nome: "name",
  name: "name",
  contato: "name",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  fone: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  cidade: "city",
  city: "city",
  bairro: "neighborhood",
  neighborhood: "neighborhood",
  estado: "state",
  uf: "state",
  state: "state",
  genero: "gender",
  sexo: "gender",
  gender: "gender",
  idade: "age",
  age: "age",
  interesses: "interests",
  interesse: "interests",
  etiquetas: "interests",
  etiqueta: "interests",
  tags: "interests",
  interests: "interests",
};

function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Detect the delimiter of a CSV/TXT header line. */
export function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Parse delimited text (CSV / TXT) into row objects keyed by header. */
export function parseDelimited(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const separator = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], separator).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitLine(line, separator);
    return headers.reduce<ImportRow>((row, header, index) => {
      row[header || `col_${index}`] = (values[index] ?? "").trim();
      return row;
    }, {});
  });
}

/** Split a delimited line honoring simple double-quote quoting. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** Suggest a header -> canonical field mapping from a list of headers. */
export function suggestMapping(headers: string[]): Record<string, ImportField> {
  const mapping: Record<string, ImportField> = {};
  for (const header of headers) {
    const canonical = HEADER_ALIASES[norm(header)];
    if (canonical) mapping[header] = canonical;
  }
  return mapping;
}

export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Canonical dedup key for a phone number. Drops the Brazilian country code
 * (55) so "+55 11 99999-9999" and "11 99999-9999" collapse to one key.
 */
export function phoneKey(value: string | null | undefined): string {
  let digits = normalizePhone(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits;
}

/** BR-friendly phone check: 10–13 digits (incl. optional country code). */
export function isValidPhone(value: string | null | undefined): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 13;
}

export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitInterests(value: string): string[] {
  return String(value ?? "")
    .split(/[|,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Apply a header->field mapping to raw rows.
 * `mapping` maps a source header to a canonical ImportField. Rows may also
 * already use canonical field names directly (identity fallback).
 */
export function applyMapping(rows: ImportRow[], mapping: Record<string, ImportField>): ImportContact[] {
  // Build reverse lookup: canonical field -> source header
  const fieldToHeader: Partial<Record<ImportField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!fieldToHeader[field]) fieldToHeader[field] = header;
  }

  const read = (row: ImportRow, field: ImportField): string => {
    const header = fieldToHeader[field];
    if (header && row[header] != null) return String(row[header]).trim();
    if (row[field] != null) return String(row[field]).trim();
    return "";
  };

  return rows.map((row) => {
    const phone = read(row, "phone");
    const email = read(row, "email");
    const ageRaw = read(row, "age");
    const age = ageRaw ? parseInt(ageRaw.replace(/\D/g, ""), 10) : NaN;
    return {
      name: read(row, "name"),
      phone,
      email,
      city: read(row, "city"),
      neighborhood: read(row, "neighborhood"),
      state: read(row, "state"),
      gender: read(row, "gender"),
      age: Number.isNaN(age) ? null : age,
      interests: splitInterests(read(row, "interests")),
      validPhone: isValidPhone(phone),
      validEmail: isValidEmail(email),
    };
  });
}

/**
 * Deduplicate + validate mapped contacts and split into valid / invalid / duplicates.
 * - invalid: has neither a valid phone nor a valid email
 * - duplicate: a later row sharing the same phone key (or email key when no phone)
 * - valid: reachable and first occurrence
 * `requiredChannel` optionally forces which contact method must be valid.
 */
export function dedupeAndValidate(
  contacts: ImportContact[],
  requiredChannel?: "phone" | "email",
): ImportResult {
  const valid: ImportContact[] = [];
  const invalid: { contact: ImportContact; reason: string }[] = [];
  const duplicates: ImportContact[] = [];
  const seen = new Set<string>();

  for (const contact of contacts) {
    const reachablePhone = contact.validPhone;
    const reachableEmail = contact.validEmail;

    let isReachable: boolean;
    if (requiredChannel === "phone") isReachable = reachablePhone;
    else if (requiredChannel === "email") isReachable = reachableEmail;
    else isReachable = reachablePhone || reachableEmail;

    if (!isReachable) {
      const reason =
        requiredChannel === "phone"
          ? "Telefone inválido"
          : requiredChannel === "email"
            ? "E-mail inválido"
            : "Sem telefone ou e-mail válido";
      invalid.push({ contact, reason });
      continue;
    }

    // Dedup key: prefer phone (unless email is the required channel)
    const key =
      requiredChannel === "email"
        ? normalizeEmail(contact.email)
        : reachablePhone
          ? phoneKey(contact.phone)
          : normalizeEmail(contact.email);

    if (seen.has(key)) {
      duplicates.push(contact);
      continue;
    }
    seen.add(key);
    valid.push(contact);
  }

  return {
    valid,
    invalid,
    duplicates,
    stats: {
      total: contacts.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicates.length,
    },
  };
}

/** Convenience: rows + mapping -> full processed result. */
export function processImport(
  rows: ImportRow[],
  mapping: Record<string, ImportField>,
  requiredChannel?: "phone" | "email",
): ImportResult {
  return dedupeAndValidate(applyMapping(rows, mapping), requiredChannel);
}
