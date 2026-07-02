export type LocawebEmailConfig = {
  baseUrl?: string | null;
  accountId?: string | null;
  apiKey: string;
  authHeader?: string | null;
  authScheme?: string | null;
};

export type LocawebRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

const DEFAULT_LOCAWEB_BASE_URL = "https://emailmarketing.locaweb.com.br/api/v1";

function normalizeBaseUrl(baseUrl?: string | null) {
  return (baseUrl?.trim() || DEFAULT_LOCAWEB_BASE_URL).replace(/\/+$/, "");
}

function buildUrl(config: LocawebEmailConfig, path: string, query?: LocawebRequestOptions["query"]) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizeBaseUrl(config.baseUrl)}${normalizedPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function authHeaders(config: LocawebEmailConfig) {
  if (!config.apiKey?.trim()) throw new Error("Token da Locaweb Email Marketing nao configurado");
  const header = config.authHeader?.trim() || "Authorization";
  const scheme = config.authScheme?.trim();
  return {
    [header]: scheme ? `${scheme} ${config.apiKey}` : config.apiKey,
  };
}

export async function locawebEmailRequest<T = unknown>(config: LocawebEmailConfig, options: LocawebRequestOptions): Promise<T> {
  const response = await fetch(buildUrl(config, options.path, options.query), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(config),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Locaweb Email Marketing ${response.status}: ${text || response.statusText}`);
  }
  return payload as T;
}

function accountPath(config: LocawebEmailConfig, suffix = "") {
  if (!config.accountId?.trim()) throw new Error("Account ID da Locaweb nao configurado");
  return `/accounts/${config.accountId}${suffix}`;
}

export const locawebEmail = {
  listAccounts: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: "/accounts" }),
  getAccount: (config: LocawebEmailConfig, accountId = config.accountId ?? "") =>
    locawebEmailRequest(config, { path: `/accounts/${accountId}` }),
  updateAccount: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "PUT", path: accountPath(config), body }),

  listContacts: (config: LocawebEmailConfig, query?: LocawebRequestOptions["query"]) =>
    locawebEmailRequest(config, { path: accountPath(config, "/contacts"), query }),
  createContact: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/contacts"), body }),
  updateContact: (config: LocawebEmailConfig, contactId: string, body: unknown) =>
    locawebEmailRequest(config, { method: "PUT", path: accountPath(config, `/contacts/${contactId}`), body }),
  deleteContact: (config: LocawebEmailConfig, contactId: string) =>
    locawebEmailRequest(config, { method: "DELETE", path: accountPath(config, `/contacts/${contactId}`) }),

  listContactImports: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/contact_imports") }),
  createContactImport: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/contact_imports"), body }),
  getContactImport: (config: LocawebEmailConfig, importId: string) =>
    locawebEmailRequest(config, { path: accountPath(config, `/contact_imports/${importId}`) }),

  listLists: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/lists") }),
  createList: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/lists"), body }),
  addContactsToList: (config: LocawebEmailConfig, listId: string, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, `/lists/${listId}/contacts`), body }),

  listCampaigns: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/campaigns") }),
  createCampaign: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/campaigns"), body }),

  listMessages: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/messages") }),
  createMessage: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/messages"), body }),
  updateMessage: (config: LocawebEmailConfig, messageId: string, body: unknown) =>
    locawebEmailRequest(config, { method: "PUT", path: accountPath(config, `/messages/${messageId}`), body }),

  listTemplates: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/my_templates") }),
  createTemplate: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/my_templates"), body }),

  listSenders: (config: LocawebEmailConfig) =>
    locawebEmailRequest(config, { path: accountPath(config, "/senders") }),
  createSender: (config: LocawebEmailConfig, body: unknown) =>
    locawebEmailRequest(config, { method: "POST", path: accountPath(config, "/senders"), body }),

  messageReport: (config: LocawebEmailConfig, messageId: string, report: "overview" | "openings" | "uniq_openings" | "links" | "clicks" | "bounces") =>
    locawebEmailRequest(config, { path: accountPath(config, `/messages/${messageId}/${report}`) }),
};
