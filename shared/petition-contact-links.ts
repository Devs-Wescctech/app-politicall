import { z } from "zod";

export type PetitionContactNetwork = "whatsapp" | "facebook" | "x" | "telegram";
type SocialNetwork = Exclude<PetitionContactNetwork, "whatsapp">;

export type PetitionContactSource = {
  contactWhatsapp?: unknown;
  contactFacebookUrl?: unknown;
  contactXUrl?: unknown;
  contactTelegramUrl?: unknown;
};

export type PetitionContactLink = {
  network: PetitionContactNetwork;
  label: string;
  url: string;
};

const allowedHosts: Record<SocialNetwork, readonly string[]> = {
  facebook: ["facebook.com"],
  x: ["x.com", "twitter.com"],
  telegram: ["t.me", "telegram.me"],
};

function isOfficialHost(hostname: string, roots: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

export function normalizePetitionWhatsapp(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function normalizePetitionSocialUrl(network: SocialNetwork, value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !isOfficialHost(url.hostname, allowedHosts[network])) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const optionalInput = z.union([z.string(), z.null(), z.undefined()]);

function optionalNormalizedField(
  normalize: (value: unknown) => string | null,
  message: string,
) {
  return optionalInput
    .transform((value) => String(value ?? "").trim())
    .refine((value) => value === "" || normalize(value) !== null, message)
    .transform((value) => value === "" ? null : normalize(value))
    .optional();
}

export const petitionContactConfigSchema = z.object({
  contactWhatsapp: optionalNormalizedField(
    normalizePetitionWhatsapp,
    "Informe um WhatsApp com código do país e DDD",
  ),
  contactFacebookUrl: optionalNormalizedField(
    (value) => normalizePetitionSocialUrl("facebook", value),
    "Informe uma URL HTTPS válida do Facebook",
  ),
  contactXUrl: optionalNormalizedField(
    (value) => normalizePetitionSocialUrl("x", value),
    "Informe uma URL HTTPS válida do X/Twitter",
  ),
  contactTelegramUrl: optionalNormalizedField(
    (value) => normalizePetitionSocialUrl("telegram", value),
    "Informe uma URL HTTPS válida do Telegram",
  ),
});

export function buildPetitionContactLinks(source: PetitionContactSource): PetitionContactLink[] {
  const links: PetitionContactLink[] = [];
  const whatsapp = normalizePetitionWhatsapp(source.contactWhatsapp);
  const facebook = normalizePetitionSocialUrl("facebook", source.contactFacebookUrl);
  const x = normalizePetitionSocialUrl("x", source.contactXUrl);
  const telegram = normalizePetitionSocialUrl("telegram", source.contactTelegramUrl);

  if (whatsapp) {
    links.push({ network: "whatsapp", label: "WhatsApp", url: `https://wa.me/${whatsapp}` });
  }
  if (facebook) links.push({ network: "facebook", label: "Facebook", url: facebook });
  if (x) links.push({ network: "x", label: "X/Twitter", url: x });
  if (telegram) links.push({ network: "telegram", label: "Telegram", url: telegram });

  return links;
}
