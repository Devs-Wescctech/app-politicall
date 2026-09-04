import { z } from "zod";

export type PetitionContactNetwork = "whatsapp" | "facebook" | "x" | "telegram";
type SocialNetwork = Exclude<PetitionContactNetwork, "whatsapp">;

export type PetitionContactSource = {
  contactWhatsapp?: unknown;
  contactWhatsappMessage?: unknown;
  contactFacebookUrl?: unknown;
  contactXUrl?: unknown;
  contactTelegramUrl?: unknown;
};

export type PetitionWhatsappMessageContext = {
  nome: string;
  cidade: string;
  peticao: string;
  link: string;
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
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}

function formatBrazilianNationalNumber(digits: string): string {
  if (digits.length <= 2) return digits ? `(${digits}` : "";

  const ddd = digits.slice(0, 2);
  const number = digits.slice(2, 11);
  if (number.length <= 4) return `(${ddd}) ${number}`;
  const prefixLength = number.length === 9 ? 5 : 4;
  return `(${ddd}) ${number.slice(0, prefixLength)}-${number.slice(prefixLength)}`;
}

export function formatPetitionWhatsappInput(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 15);
  const isCompleteBrazilian = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  if (isCompleteBrazilian) return `+55 ${formatBrazilianNationalNumber(digits.slice(2))}`;
  if (digits.length <= 11) return formatBrazilianNationalNumber(digits);
  return digits;
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
const whatsappMessageVariables = ["nome", "cidade", "peticao", "link"] as const;
const whatsappMessageVariablePattern = /\{(nome|cidade|peticao|link)\}/g;

function hasOnlySupportedWhatsappMessageVariables(value: string): boolean {
  return !/[{}]/.test(value.replace(whatsappMessageVariablePattern, ""));
}

export function interpolatePetitionWhatsappMessage(
  template: unknown,
  context: PetitionWhatsappMessageContext,
): string | null {
  const normalized = String(template ?? "").trim();
  if (!normalized) return null;

  const values: Record<(typeof whatsappMessageVariables)[number], string> = {
    nome: context.nome ?? "",
    cidade: context.cidade ?? "",
    peticao: context.peticao ?? "",
    link: context.link ?? "",
  };
  return normalized.replace(whatsappMessageVariablePattern, (_match, variable: keyof typeof values) => (
    values[variable] ?? ""
  ));
}

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
  contactWhatsappMessage: optionalInput
    .transform((value) => String(value ?? "").trim())
    .refine((value) => value.length <= 1000, "A mensagem deve ter no máximo 1000 caracteres")
    .refine(
      hasOnlySupportedWhatsappMessageVariables,
      "Use somente as variáveis {nome}, {cidade}, {peticao} e {link}",
    )
    .transform((value) => value === "" ? null : value)
    .optional(),
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

export function buildPetitionContactLinks(
  source: PetitionContactSource,
  context?: PetitionWhatsappMessageContext,
): PetitionContactLink[] {
  const links: PetitionContactLink[] = [];
  const whatsapp = normalizePetitionWhatsapp(source.contactWhatsapp);
  const facebook = normalizePetitionSocialUrl("facebook", source.contactFacebookUrl);
  const x = normalizePetitionSocialUrl("x", source.contactXUrl);
  const telegram = normalizePetitionSocialUrl("telegram", source.contactTelegramUrl);

  if (whatsapp) {
    const message = context
      ? interpolatePetitionWhatsappMessage(source.contactWhatsappMessage, context)
      : null;
    const query = message ? `?text=${encodeURIComponent(message)}` : "";
    links.push({ network: "whatsapp", label: "WhatsApp", url: `https://wa.me/${whatsapp}${query}` });
  }
  if (facebook) links.push({ network: "facebook", label: "Facebook", url: facebook });
  if (x) links.push({ network: "x", label: "X/Twitter", url: x });
  if (telegram) links.push({ network: "telegram", label: "Telegram", url: telegram });

  return links;
}
