import path from "node:path";
import { escapeHtml } from "./html-escape";

const SOCIAL_CRAWLER_TOKENS = [
  "facebookexternalhit",
  "facebot",
  "whatsapp",
  "twitterbot",
  "linkedinbot",
  "pinterest",
  "slackbot",
  "telegrambot",
  "discordbot",
  "googlebot",
  "bingbot",
  "applebot",
];

const DEFAULT_ORIGIN = "https://www.politicall.com.br";
const MAX_PREVIEW_DESCRIPTION_LENGTH = 300;

export type PetitionPreviewSource = {
  title: string;
  description: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  goal: number;
  slug: string;
};

export type PetitionLinkPreview = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
};

export type ForwardedHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",", 1)[0]?.trim() ?? "";
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function toPublicImageUrl(value: string | null | undefined, origin: string): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.toLowerCase().startsWith("data:")) return null;

  try {
    const url = new URL(candidate, `${origin}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function toPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  const shortened = value.slice(0, Math.max(0, maximumLength - 3)).trimEnd();
  const wordBoundary = shortened.lastIndexOf(" ");
  const safe = wordBoundary >= Math.floor(maximumLength * 0.6)
    ? shortened.slice(0, wordBoundary)
    : shortened;
  return `${safe.trimEnd()}...`;
}

export function isSocialCrawler(userAgent: string): boolean {
  const normalized = userAgent.toLowerCase();
  return SOCIAL_CRAWLER_TOKENS.some((token) => normalized.includes(token));
}

export function resolvePublicOrigin(
  headers: ForwardedHeaders,
  configuredUrl?: string,
): string {
  const configuredOrigin = parseOrigin(configuredUrl);
  if (configuredOrigin) return configuredOrigin;

  const host = firstHeaderValue(headers["x-forwarded-host"] ?? headers.host);
  const forwardedProtocol = firstHeaderValue(headers["x-forwarded-proto"]).toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : "https";
  return parseOrigin(host ? `${protocol}://${host}` : undefined) ?? DEFAULT_ORIGIN;
}

export function resolvePetitionTemplatePath(
  environment: string | undefined,
  runtimeDirectory: string,
): string {
  return environment === "production"
    ? path.join(runtimeDirectory, "public", "index.html")
    : path.resolve(runtimeDirectory, "..", "client", "index.html");
}

export function buildPetitionPreview(
  petition: PetitionPreviewSource,
  signaturesCount: number,
  origin: string,
): PetitionLinkPreview {
  const count = Math.max(0, Number.isFinite(signaturesCount) ? Math.trunc(signaturesCount) : 0);
  const goal = Math.max(1, Number.isFinite(petition.goal) ? Math.trunc(petition.goal) : 1);
  const metrics = `${count.toLocaleString("pt-BR")} ${count === 1 ? "assinatura" : "assinaturas"} de uma meta de ${goal.toLocaleString("pt-BR")}. Assine e compartilhe esta petição.`;
  const plainDescription = toPlainText(petition.description ?? "");
  const availableDescriptionLength = Math.max(
    0,
    MAX_PREVIEW_DESCRIPTION_LENGTH - metrics.length - (plainDescription ? 1 : 0),
  );
  const summary = truncateAtWord(plainDescription, availableDescriptionLength);
  const description = summary ? `${summary} ${metrics}` : metrics;
  const image = toPublicImageUrl(petition.bannerUrl, origin)
    ?? toPublicImageUrl(petition.logoUrl, origin)
    ?? `${origin}/favicon.png`;

  return {
    title: petition.title,
    description,
    image,
    imageAlt: `Imagem da petição ${petition.title}`,
    url: `${origin}/p/${encodeURIComponent(petition.slug)}`,
  };
}

export function buildGenericPetitionPreview(origin: string, slug: string): PetitionLinkPreview {
  return {
    title: "Petição - Politicall",
    description: "Assine esta petição e faça parte dessa mudança!",
    image: `${origin}/favicon.png`,
    imageAlt: "Politicall",
    url: `${origin}/p/${encodeURIComponent(slug)}`,
  };
}

export function injectPetitionPreviewHtml(
  sourceHtml: string,
  preview: PetitionLinkPreview,
  socialUrl = preview.url,
): string {
  if (!/<\/head>/i.test(sourceHtml)) return sourceHtml;

  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(preview.image);
  const imageAlt = escapeHtml(preview.imageAlt);
  const url = escapeHtml(socialUrl);
  const canonicalUrl = escapeHtml(preview.url);
  const block = `
    <!-- PETITION_LINK_PREVIEW_START -->
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="Politicall" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <!-- PETITION_LINK_PREVIEW_END -->
  `;

  let html = sourceHtml
    .replace(/\s*<!-- PETITION_LINK_PREVIEW_START -->[\s\S]*?<!-- PETITION_LINK_PREVIEW_END -->\s*/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}" />`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");

  html = html.replace(/<\/head>/i, `${block}</head>`);
  return html;
}
