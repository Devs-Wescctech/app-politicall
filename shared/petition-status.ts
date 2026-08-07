const PUBLIC_PETITION_STATUSES = new Set(["publicada", "pausada", "concluida"]);

export function isPetitionPublicStatus(status: string | null | undefined): boolean {
  return Boolean(status && PUBLIC_PETITION_STATUSES.has(status));
}
