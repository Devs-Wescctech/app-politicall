export type PublicPetitionStatus = {
  status?: string | null;
};

export type PublicSignatureRequirementConfig = {
  requireEmail?: boolean | null;
  requirePhone?: boolean | null;
  requireLocation?: boolean | null;
  requireCpf?: boolean | null;
  requireComment?: boolean | null;
  lgpdText?: string | null;
};

export type PetitionCollectionConfig = PublicSignatureRequirementConfig & {
  collectEmail?: boolean | null;
  collectPhone?: boolean | null;
  collectCity?: boolean | null;
  collectState?: boolean | null;
  collectCpf?: boolean | null;
  collectComment?: boolean | null;
};

export type PublicSignatureInput = {
  email?: unknown;
  phone?: unknown;
  city?: unknown;
  state?: unknown;
  cpf?: unknown;
  comment?: unknown;
  acceptedTerms?: unknown;
  acceptedLgpd?: unknown;
};

export type PublicSignatureValidationIssue = {
  field: string;
  message: string;
};

export type FixedWindowEntry = {
  count: number;
  resetAt: number;
};

const PUBLIC_VISIBLE_STATUSES = new Set(["publicada", "pausada", "concluida"]);

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null && String(value).trim().length > 0;
}

function isAccepted(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

export function isPublicPetitionVisible<T extends PublicPetitionStatus>(petition: T | null | undefined): petition is T {
  return Boolean(petition?.status && PUBLIC_VISIBLE_STATUSES.has(petition.status));
}

export function isPublicPetitionOpenForSignature<T extends PublicPetitionStatus>(petition: T | null | undefined): petition is T {
  return petition?.status === "publicada";
}

export function filterPublishedPetitions<T extends PublicPetitionStatus>(petitions: T[]): T[] {
  return petitions.filter((petition) => petition.status === "publicada");
}

export function validatePublicSignatureRequirements(
  petition: PublicSignatureRequirementConfig,
  input: PublicSignatureInput,
): PublicSignatureValidationIssue[] {
  const issues: PublicSignatureValidationIssue[] = [];

  if (petition.requireEmail && !hasText(input.email)) {
    issues.push({ field: "email", message: "E-mail é obrigatório." });
  }
  if (petition.requirePhone && !hasText(input.phone)) {
    issues.push({ field: "phone", message: "Telefone é obrigatório." });
  }
  if (petition.requireLocation && !hasText(input.city) && !hasText(input.state)) {
    issues.push({ field: "location", message: "Informe cidade ou estado." });
  }
  if (petition.requireCpf && !hasText(input.cpf)) {
    issues.push({ field: "cpf", message: "CPF é obrigatório." });
  }
  if (petition.requireComment && !hasText(input.comment)) {
    issues.push({ field: "comment", message: "Comentário é obrigatório." });
  }
  if (!isAccepted(input.acceptedTerms)) {
    issues.push({ field: "acceptedTerms", message: "Aceite dos termos é obrigatório." });
  }
  if (hasText(petition.lgpdText) && !isAccepted(input.acceptedLgpd)) {
    issues.push({ field: "acceptedLgpd", message: "Aceite da política de privacidade é obrigatório." });
  }

  return issues;
}

export function normalizePetitionCollectionConfig<T extends PetitionCollectionConfig>(config: T): T {
  const normalized: Record<string, any> = { ...config };

  if (normalized.requireEmail) normalized.collectEmail = true;
  if (normalized.requirePhone) normalized.collectPhone = true;
  if (normalized.requireCpf) normalized.collectCpf = true;
  if (normalized.requireComment) normalized.collectComment = true;
  if (normalized.requireLocation && !normalized.collectCity && !normalized.collectState) {
    normalized.collectCity = true;
  }

  return normalized as T;
}

export function sanitizePublicPetition(petition: Record<string, any>) {
  const normalized = normalizePetitionCollectionConfig(petition);

  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description,
    bannerUrl: normalized.bannerUrl,
    logoUrl: normalized.logoUrl,
    videoUrl: normalized.videoUrl,
    primaryColor: normalized.primaryColor,
    shareText: normalized.shareText,
    goal: normalized.goal,
    status: normalized.status,
    slug: normalized.slug,
    collectPhone: normalized.collectPhone,
    collectCity: normalized.collectCity,
    collectState: normalized.collectState,
    collectCpf: normalized.collectCpf,
    collectEmail: normalized.collectEmail,
    collectComment: normalized.collectComment,
    requireEmail: normalized.requireEmail,
    requirePhone: normalized.requirePhone,
    requireLocation: normalized.requireLocation,
    requireCpf: normalized.requireCpf,
    requireComment: normalized.requireComment,
    lgpdText: normalized.lgpdText,
    signaturesCount: normalized.signaturesCount,
  };
}

export function sanitizePetitionCampaign<T extends Record<string, any>>(campaign: T): Omit<T, "apiToken"> {
  const { apiToken: _apiToken, ...safeCampaign } = campaign;
  return safeCampaign as Omit<T, "apiToken">;
}

export function normalizePetitionCampaignLogStatus(ok: boolean): "success" | "error" {
  return ok ? "success" : "error";
}

export function allowFixedWindowAttempt(
  store: Map<string, FixedWindowEntry>,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number } {
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}
