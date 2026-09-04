export function buildPetitionShareUrl(
  origin: string,
  slug: string,
  version?: string | null,
): string {
  const url = new URL(`/p/${encodeURIComponent(slug)}`, origin);
  const normalizedVersion = version?.trim();
  if (normalizedVersion) url.searchParams.set("v", normalizedVersion);
  return url.toString();
}

export function buildPetitionShareText(
  configuredText: string | null | undefined,
  title: string,
  shareUrl: string,
): string {
  const message = configuredText?.trim()
    || `Acabei de assinar "${title}". Junte-se a mim!`;

  if (message.includes("{link}")) {
    return message.split("{link}").join(shareUrl);
  }

  if (message.includes(shareUrl)) return message;
  return `${message}\n\n${shareUrl}`;
}
