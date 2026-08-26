export type WhuConnectionFormValues = {
  name: string;
  phoneNumber: string;
  token: string;
};

export type WhuConnectionPayload = {
  name: string;
  channel: "whatsapp";
  provider: "wescctech";
  phoneNumber: string;
  token?: string;
  baseUrl: string;
  metadata: {
    apiType: "whu";
    official: false;
    whatsappOfficial: false;
    phoneNumber: string;
  };
};

function isMaskedToken(value: string): boolean {
  return value.length > 0 && /^[*•]+$/.test(value);
}

export function validateWhuConnectionForm(values: WhuConnectionFormValues, editing: boolean): string[] {
  const errors: string[] = [];
  if (!values.name.trim()) errors.push("Informe o nome da conexão.");
  if (!values.phoneNumber.replace(/\D/g, "")) errors.push("Informe o número do WhatsApp.");
  const token = values.token.trim();
  if (!editing && (!token || isMaskedToken(token))) errors.push("Informe o token WHU.");
  return errors;
}

export function buildWhuConnectionPayload(
  values: WhuConnectionFormValues,
  editing: boolean,
): WhuConnectionPayload {
  const name = values.name.trim();
  const phoneNumber = values.phoneNumber.replace(/\D/g, "");
  const token = values.token.trim();
  const hasReplacementToken = Boolean(token) && !isMaskedToken(token);
  return {
    name,
    channel: "whatsapp",
    provider: "wescctech",
    phoneNumber,
    ...(hasReplacementToken ? { token } : {}),
    baseUrl: "https://api.wescctech.com.br",
    metadata: {
      apiType: "whu",
      official: false,
      whatsappOfficial: false,
      phoneNumber,
    },
  };
}

const stableMessages: Record<string, string> = {
  WHU_DUPLICATE_PHONE: "Este número já está ativo em outra conexão.",
  WHU_DUPLICATE_TOKEN: "Este token já está vinculado a outra conexão.",
  WHU_TOKEN_REQUIRED: "Informe o token WHU para criar a conexão.",
  WHU_PHONE_REQUIRED: "Informe o número do WhatsApp.",
  WHU_NAME_REQUIRED: "Informe o nome da conexão.",
  CHANNEL_CONNECTION_DISABLED: "Reative a conexão antes de testá-la.",
  CHANNEL_CONNECTION_IN_USE: "Esta conexão está vinculada a campanhas ou atendimentos. Desative-a antes de alterar o vínculo.",
};

export function connectionErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (stableMessages[code]) return stableMessages[code];

  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("já existe uma conexão whu ativa")) return stableMessages.WHU_DUPLICATE_PHONE;
  if (normalized.includes("token whu já está em uso")) return stableMessages.WHU_DUPLICATE_TOKEN;
  if (normalized.includes("token whu é obrigatório")) return stableMessages.WHU_TOKEN_REQUIRED;
  if (normalized.includes("número whu é obrigatório")) return stableMessages.WHU_PHONE_REQUIRED;
  if (normalized.includes("campanhas") || normalized.includes("atendimentos vinculados")) {
    return stableMessages.CHANNEL_CONNECTION_IN_USE;
  }
  return "Não foi possível concluir a operação com esta conexão.";
}
