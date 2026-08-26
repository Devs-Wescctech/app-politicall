export function ensureAttendanceMessageCreatedAt<T extends object>(
  message: T,
  now: () => Date = () => new Date(),
): T & { createdAt: Date } {
  const createdAt = (message as T & { createdAt?: Date | null }).createdAt;

  return {
    ...message,
    createdAt: createdAt ?? now(),
  };
}

type WesccMessageTimestamp = {
  dhMessage?: unknown;
  utcDhMessage?: unknown;
};

const EXPLICIT_TIMEZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

function parseTimestamp(value: unknown, defaultOffset: "Z" | "-03:00"): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim().replace(" ", "T");
  const date = new Date(EXPLICIT_TIMEZONE.test(normalized) ? normalized : `${normalized}${defaultOffset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseWesccMessageDate(message: WesccMessageTimestamp): Date | null {
  const localDate = parseTimestamp(message.dhMessage, "-03:00");
  if (localDate) return localDate;
  return parseTimestamp(message.utcDhMessage, "Z");
}

export function normalizeStoredWesccMessageDate<T extends { createdAt: Date; metadata?: unknown }>(message: T): T {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return message;
  const remote = (metadata as { remote?: unknown }).remote;
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return message;

  const createdAt = parseWesccMessageDate(remote as WesccMessageTimestamp);
  return createdAt ? { ...message, createdAt } : message;
}
