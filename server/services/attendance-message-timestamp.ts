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
