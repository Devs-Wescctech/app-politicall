export function parseBrazilianDateTime(dateValue: string, timeValue: string): Date | null {
  const [day, month, year] = dateValue.split("/").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  if (![day, month, year, hour, minute].every(Number.isFinite)) return null;

  const parsed = new Date(year, month - 1, day, hour, minute);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

export function buildEventDateRange(input: {
  startDateStr: string;
  startTimeStr: string;
  endDateStr: string;
  endTimeStr: string;
}): { startDate: Date; endDate: Date } | null {
  const startDate = parseBrazilianDateTime(input.startDateStr, input.startTimeStr);
  const endDate = parseBrazilianDateTime(input.endDateStr, input.endTimeStr);
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}
