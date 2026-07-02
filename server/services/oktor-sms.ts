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

const DEFAULT_OKTOR_ENDPOINT = "http://integracao.oktor.com.br/integracao3.do";

function endpoint(config: OktorSmsConfig) {
  return config.endpoint?.trim() || DEFAULT_OKTOR_ENDPOINT;
}

function baseParams(config: OktorSmsConfig) {
  if (!config.account || !config.code || !config.client) {
    throw new Error("Credenciais SMS Oktor incompletas: account, code e client sao obrigatorios");
  }
  return {
    account: config.account,
    code: config.code,
    client: config.client,
  };
}

async function getText(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Oktor SMS ${response.status}: ${text}`);
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

function assertOktorAccepted(text: string) {
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

  const result = await getText(`${endpoint(config)}?${params.toString()}`);
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

  return getText(`${endpoint(config)}?${params.toString()}`);
}
