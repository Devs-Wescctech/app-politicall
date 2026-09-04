const VALID_BRAZILIAN_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function normalizeBrazilianPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  return national.slice(0, 11);
}

export function formatBrazilianPhone(value: unknown): string {
  const digits = normalizeBrazilianPhone(value);
  if (!digits) return "";
  if (digits.length < 2) return `(${digits}`;
  if (digits.length === 2) return `(${digits})`;

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const firstGroupLength = subscriber.startsWith("9") ? 5 : 4;
  const first = subscriber.slice(0, firstGroupLength);
  const second = subscriber.slice(firstGroupLength, firstGroupLength + 4);
  return `(${ddd}) ${first}${second ? `-${second}` : ""}`;
}

export function isValidBrazilianPhone(value: unknown): boolean {
  const digits = normalizeBrazilianPhone(value);
  if (!VALID_BRAZILIAN_DDDS.has(digits.slice(0, 2))) return false;

  const subscriber = digits.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return false;
  if (digits.length === 10) return /^[2-5]/.test(subscriber);
  return digits.length === 11 && subscriber.startsWith("9");
}
