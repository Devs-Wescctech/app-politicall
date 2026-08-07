export type SmsIntegrationConfig = {
  endpoint?: string | null;
  smsEndpoint?: string | null;
  account?: string | null;
  smsAccount?: string | null;
  code?: string | null;
  smsCode?: string | null;
  client?: string | null;
  smsClient?: string | null;
  tipoEnvio?: string | null;
  smsTipoEnvio?: string | null;
};

type SmsIntegrationEnv = Record<string, string | undefined>;

export function oktorConfigFromIntegration(
  integration: SmsIntegrationConfig,
  env: SmsIntegrationEnv = process.env,
) {
  return {
    endpoint: env.OKTOR_SMS_ENDPOINT || integration.smsEndpoint || integration.endpoint || "",
    account: integration.smsAccount || integration.account || env.OKTOR_SMS_ACCOUNT || "",
    code: integration.smsCode || integration.code || env.OKTOR_SMS_CODE || "",
    client: integration.smsClient || integration.client || env.OKTOR_SMS_CLIENT || "",
    tipoEnvio: integration.smsTipoEnvio || integration.tipoEnvio || env.OKTOR_SMS_TIPO_ENVIO || "7",
  };
}

export function hasOktorSmsCredentials(
  integration: (SmsIntegrationConfig & { enabled?: boolean }) | null | undefined,
  env?: SmsIntegrationEnv,
) {
  if (!integration?.enabled) return false;
  const config = oktorConfigFromIntegration(integration, env);
  return Boolean(config.account && config.code && config.client);
}

export function assertActiveOktorSmsCredentials(integration: SmsIntegrationConfig & { service?: string; enabled?: boolean }) {
  if (integration.service !== "sms" || integration.enabled === false) return;
  const config = oktorConfigFromIntegration(integration);
  const missing = [
    !config.account && "account",
    !config.code && "code",
    !config.client && "client",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Credenciais SMS incompletas: preencha ${missing.join(", ")}.`);
  }
}
