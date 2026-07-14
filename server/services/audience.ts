import type { AudienceFilters } from "@shared/schema";

/**
 * Pure audience-segmentation helpers for the Campaign Center.
 * No DB / network imports — the DB layer fetches contacts + builds the
 * attendance index, then these functions decide who matches. Keeps the
 * segmentation rules unit-testable.
 */

/** Minimal contact shape needed for segmentation (subset of the Contact row). */
export interface AudienceContact {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  state?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  interests?: string[] | null;
  source?: string | null;
}

/** Attendance summary for one contact (keyed by normalized phone). */
export interface AttendanceSummary {
  channel?: string | null;
  status?: string | null;
  lastMessageAt?: Date | string | null;
  responded?: boolean;
}

export interface AudienceContext {
  /** normalized phone -> attendance summary */
  attendanceByPhone?: Map<string, AttendanceSummary>;
  /** normalized phones/emails that belong to a previous campaign */
  previousRecipientKeys?: Set<string>;
}

const IMPORTED_SOURCE = "importacao"; // normalized (accent-stripped) form of "Importação"

/** Lowercase, trim and strip accents for case/accent-insensitive matching. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Keep only digits. */
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Canonical phone dedup key (drops the Brazilian 55 country code). */
export function phoneKey(value: string | null | undefined): string {
  let digits = normalizePhone(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits;
}

function hasFilterValues(values?: string[]): values is string[] {
  return Array.isArray(values) && values.length > 0;
}

function matchesAny(value: string | null | undefined, filterValues: string[]): boolean {
  const target = normalizeText(value);
  if (!target) return false;
  return filterValues.some((f) => normalizeText(f) === target);
}

function matchesAnyInterest(interests: string[] | null | undefined, filterValues: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  const normalized = interests.map(normalizeText);
  return filterValues.some((f) => normalized.includes(normalizeText(f)));
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whether a single contact satisfies all provided filters. */
export function matchContact(
  contact: AudienceContact,
  filters: AudienceFilters,
  ctx: AudienceContext = {},
): boolean {
  if (hasFilterValues(filters.tags) && !matchesAnyInterest(contact.interests, filters.tags)) return false;
  if (hasFilterValues(filters.interests) && !matchesAnyInterest(contact.interests, filters.interests)) return false;
  if (hasFilterValues(filters.cities) && !matchesAny(contact.city, filters.cities)) return false;
  if (hasFilterValues(filters.neighborhoods) && !matchesAny(contact.neighborhood, filters.neighborhoods)) return false;
  if (hasFilterValues(filters.states) && !matchesAny(contact.state, filters.states)) return false;
  if (hasFilterValues(filters.genders) && !matchesAny(contact.gender, filters.genders)) return false;
  if (hasFilterValues(filters.sources) && !matchesAny(contact.source, filters.sources)) return false;

  if (typeof filters.ageMin === "number") {
    if (contact.age == null || contact.age < filters.ageMin) return false;
  }
  if (typeof filters.ageMax === "number") {
    if (contact.age == null || contact.age > filters.ageMax) return false;
  }

  if (filters.importedOnly === true) {
    if (normalizeText(contact.source) !== IMPORTED_SOURCE) return false;
  }

  if (filters.previousCampaignId) {
    const keys = ctx.previousRecipientKeys;
    const pKey = phoneKey(contact.phone);
    const emailKey = normalizeText(contact.email);
    const inPrevious = !!keys && ((!!pKey && keys.has(pKey)) || (!!emailKey && keys.has(emailKey)));
    if (!inPrevious) return false;
  }

  // Attendance-based filters
  const needsAttendance =
    hasFilterValues(filters.originChannels) ||
    hasFilterValues(filters.attendanceStatuses) ||
    !!filters.lastAttendanceAfter ||
    !!filters.lastAttendanceBefore ||
    typeof filters.responded === "boolean";

  if (needsAttendance) {
    const phoneKey = normalizePhone(contact.phone);
    const att = phoneKey ? ctx.attendanceByPhone?.get(phoneKey) : undefined;
    if (!att) return false;

    if (hasFilterValues(filters.originChannels) && !matchesAny(att.channel, filters.originChannels)) return false;
    if (hasFilterValues(filters.attendanceStatuses) && !matchesAny(att.status, filters.attendanceStatuses)) return false;

    const last = toTime(att.lastMessageAt);
    if (filters.lastAttendanceAfter) {
      const after = toTime(filters.lastAttendanceAfter);
      if (after != null && (last == null || last < after)) return false;
    }
    if (filters.lastAttendanceBefore) {
      const before = toTime(filters.lastAttendanceBefore);
      if (before != null && (last == null || last > before)) return false;
    }
    if (typeof filters.responded === "boolean") {
      if ((att.responded === true) !== filters.responded) return false;
    }
  }

  return true;
}

/** Return the subset of contacts that match the filters. */
export function applyAudienceFilters<T extends AudienceContact>(
  contacts: T[],
  filters: AudienceFilters,
  ctx: AudienceContext = {},
): T[] {
  return contacts.filter((c) => matchContact(c, filters, ctx));
}

export interface AudiencePreview {
  total: number;
  withPhone: number;
  withEmail: number;
  sample: {
    id?: string;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
  }[];
}

/** Basic phone reachability check (BR: 10–13 digits incl. country code). */
export function hasReachablePhone(contact: AudienceContact): boolean {
  const digits = normalizePhone(contact.phone);
  return digits.length >= 10 && digits.length <= 13;
}

/** Basic email reachability check. */
export function hasReachableEmail(contact: AudienceContact): boolean {
  const email = String(contact.email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Build an audience preview (count + reachability + a small sample). */
export function buildAudiencePreview(
  contacts: AudienceContact[],
  filters: AudienceFilters,
  ctx: AudienceContext = {},
  sampleSize = 20,
): AudiencePreview {
  const matched = applyAudienceFilters(contacts, filters, ctx);
  return {
    total: matched.length,
    withPhone: matched.filter(hasReachablePhone).length,
    withEmail: matched.filter(hasReachableEmail).length,
    sample: matched.slice(0, sampleSize).map((c) => ({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? null,
      email: c.email ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
    })),
  };
}

/**
 * Resolve the actual addresses to dispatch on for a given channel.
 * whatsapp/sms -> phone, email -> email. De-duplicated, invalids dropped.
 */
export function resolveRecipients(
  contacts: AudienceContact[],
  channel: string,
): string[] {
  const wantsEmail = channel === "email";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of contacts) {
    if (wantsEmail) {
      if (!hasReachableEmail(c)) continue;
      const key = String(c.email).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(String(c.email).trim());
    } else {
      if (!hasReachablePhone(c)) continue;
      const key = phoneKey(c.phone);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(String(c.phone).trim());
    }
  }
  return out;
}
