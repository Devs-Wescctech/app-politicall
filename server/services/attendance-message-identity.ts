export function extractAttendanceExternalMessageId(message: any): string | null {
  return String(
    message?.messageSentId ||
    message?.messagesSentIds?.[0] ||
    message?.id ||
    message?.IdMessage ||
    "",
  ).trim() || null;
}
