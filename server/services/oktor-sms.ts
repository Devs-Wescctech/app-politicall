export type OktorSmsConfig = {
  endpoint?: string | null;
  account: string;
  code: string;
  client: string;
  tipoEnvio?: string | null;
};

export type OktorSendInput = {
  to: string;
  msg: string;
};

export const OKTOR_INVALID_CREDENTIALS_MESSAGE =
  "Credenciais SMS inválidas. Verifique account e code/token da integração SMS no Admin Master.";

export function resolveSmsEndpoint(config: OktorSmsConfig) {
  const url = config.endpoint?.trim();
  if (!url) {
    throw new Error(
      "Endpoint SMS não configurado. Defina OKTOR_SMS_ENDPOINT (proxy n8n) ou o smsEndpoint da integração da empresa. O envio direto para a Oktor a partir do servidor está desativado (IP bloqueado)."
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    // A common misconfiguration is pasting one of the *query parameters*
    // (account/code/tipoEnvio) into the OKTOR_SMS_ENDPOINT secret/field by
    // mistake, instead of the proxy's base URL. Surface that distinctly so
    // it isn't confused with a real DNS/URL typo.
    throw new Error(
      `Endpoint SMS inválido: "${url}". O valor configurado não é uma URL (não começa com http:// ou https://). ` +
      "Verifique se OKTOR_SMS_ENDPOINT não foi preenchido, por engano, com o valor de outro parâmetro " +
      "(account, code, tipoEnvio, client). O valor esperado é a URL base do proxy, por exemplo: " +
      "https://n8n.wescctech.com.br/webhook/<seu-caminho>."
    );
  }

  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`Endpoint SMS inválido: ${url}`);
  }

  if (/(^|\.)oktor\.com\.br$/i.test(host) || /integracao3\.do/i.test(url)) {
    throw new Error(
      "Envio direto para a Oktor está desativado (IP do servidor bloqueado). Configure OKTOR_SMS_ENDPOINT para o proxy n8n (n8n.wescctech.com.br)."
    );
  }

  console.log("[SMS] endpoint host:", host);
  return url;
}

function maskSecret(value: string | null | undefined): string {
  if (!value) return "(vazio)";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
}

function maskUrlForLog(url: string, rawCode: string | undefined): string {
  if (!rawCode) return url;
  // `code` is sent URL-encoded inside the query string, so redact the
  // encoded form, not the raw secret value.
  const encodedCode = encodeURIComponent(rawCode);
  return url.split(encodedCode).join(maskSecret(rawCode));
}

export function baseParams(config: OktorSmsConfig) {
  if (!config.account || !config.code || !config.client) {
    throw new Error("Credenciais SMS Oktor incompletas: account, code e client sao obrigatorios");
  }
  return {
    account: config.account,
    code: config.code,
    client: config.client,
  };
}

async function getText(url: string, debugParams?: Record<string, string>) {
  if (debugParams) {
        console.log("[SMS] has account:", Boolean(debugParams.account));
    console.log("[SMS] has code:", Boolean(debugParams.code));
    console.log("[SMS] client:", debugParams.client || "(vazio)");
  }

  const response = await fetch(url);
  const text = await response.text();

  console.log("[SMS] response status:", response.status);
  // Response bodies are not logged because providers may echo credentials.

  if (!response.ok) {
    // Gateways often return large HTML error pages (e.g. a 502 from nginx).
    // Strip the markup so the stored error reason stays short and readable.
    const clean = text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    throw new Error(`Oktor SMS HTTP ${response.status}${clean ? `: ${clean}` : ""}`);
  }
  return { httpStatus: response.status, raw: text };
}

function parseOktorResponse(text: string): Record<string, any> | null {
  let current: unknown = text.trim();

  for (let i = 0; i < 2; i += 1) {
    if (typeof current !== "string") break;
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }

  return current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, any>
    : null;
}

export function assertOktorAccepted(text: string) {
  const payload = parseOktorResponse(text);
  const code = String(payload?.codigo ?? payload?.code ?? "").trim();
  const description = String(
    payload?.descricao_retorno ??
    payload?.descricaoRetorno ??
    payload?.message ??
    payload?.erro ??
    payload?.error ??
    ""
  ).trim();
  const readable = description || text;
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) {
    throw new Error("Oktor SMS retornou resposta vazia");
  }

  if (code === "900" || normalized.includes("usuario invalido")) {
    throw new Error(OKTOR_INVALID_CREDENTIALS_MESSAGE);
  }

  const errorSignals = [
    "erro",
    "error",
    "invalid",
    "inval",
    "falha",
    "failure",
    "unauthorized",
    "nao autorizado",
    "sem credito",
    "credito insuficiente",
    "account",
    "code",
    "client",
    "senha",
    "token",
  ];

  if (errorSignals.some(signal => normalized.includes(signal))) {
    if (normalized.includes("ip nao autorizado")) {
      throw new Error(`Oktor SMS recusou o envio: IP não autorizado${code ? ` (código ${code})` : ""}. Libere o IP público do servidor na Oktor/Wescctech.`);
    }
    throw new Error(`Oktor SMS recusou o envio${code ? ` (código ${code})` : ""}: ${readable}`);
  }
}

export async function sendOktorSms(config: OktorSmsConfig, input: OktorSendInput) {
  if (!input.to?.trim()) throw new Error("Telefone de destino obrigatorio");
  if (!input.msg?.trim()) throw new Error("Mensagem obrigatoria");

  const params = new URLSearchParams({
    ...baseParams(config),
    type: "E",
    dispatch: "sendmsg",
    msg: input.msg,
    to: input.to.replace(/\D/g, ""),
    tipoEnvio: config.tipoEnvio?.trim() || "7",
  });

  const resolvedEndpoint = resolveSmsEndpoint(config);
  const result = await getText(`${resolvedEndpoint}?${params.toString()}`, {
    account: config.account,
    code: config.code,
    client: config.client,
    type: "E",
    dispatch: "sendmsg",
    to: input.to.replace(/\D/g, ""),
    tipoEnvio: config.tipoEnvio?.trim() || "7",
  });
  assertOktorAccepted(result.raw);
  return result;
}

export async function queryOktorSms(config: OktorSmsConfig, ids: string[]) {
  const normalizedIds = ids.map(id => id.trim()).filter(Boolean);
  if (normalizedIds.length === 0) throw new Error("Informe ao menos um ID para consulta");

  const params = new URLSearchParams({
    ...baseParams(config),
    type: "C",
    id: normalizedIds.join(";"),
  });

  return getText(`${resolveSmsEndpoint(config)}?${params.toString()}`, {
    account: config.account,
    code: config.code,
    client: config.client,
    type: "C",
    id: normalizedIds.join(";"),
  });
}
