import type { AttendanceChannelHealth, AttendanceChannelHealthResponse } from "@shared/attendance-channel-health";

type ConnectionConfig = {
  id: string;
  name: string;
  status: string;
  channel: string;
  provider: string;
  lastTestedAt?: Date | string | null;
  lastError?: string | null;
};

type IntegrationConfig = {
  enabled?: boolean;
  whatsappToken?: string | null;
  smsAccount?: string | null;
  smsCode?: string | null;
  smsClient?: string | null;
  smsEndpoint?: string | null;
  sendgridApiKey?: string | null;
  fromEmail?: string | null;
  smtpHost?: string | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  imapHost?: string | null;
  imapUser?: string | null;
  imapPassword?: string | null;
  locawebBaseUrl?: string | null;
  locawebAccountId?: string | null;
  locawebApiKey?: string | null;
};

export type AttendanceChannelHealthInput = {
  connections: ConnectionConfig[];
  whatsappIntegration?: IntegrationConfig | null;
  smsIntegration?: IntegrationConfig | null;
  emailIntegration?: IntegrationConfig | null;
  smsEndpoint?: string | null;
  now?: Date;
};

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function whatsappHealth(input: AttendanceChannelHealthInput): AttendanceChannelHealth {
  const connections = input.connections.filter(connection => {
    const identity = `${connection.channel} ${connection.provider}`.toLowerCase();
    return connection.status !== "disabled" && /whatsapp|whu|wescctech|meta/.test(identity);
  });
  const connected = connections.filter(connection => connection.status === "connected");
  const failed = connections.filter(connection => connection.status === "error");
  const latestTest = connections
    .map(connection => connection.lastTestedAt ? new Date(connection.lastTestedAt) : null)
    .filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  if (connected.length > 0) {
    return {
      id: "whatsapp",
      label: "WhatsApp",
      status: "operational",
      message: `${connected.length} conexão${connected.length === 1 ? "" : "ões"} operacional${connected.length === 1 ? "" : "is"}`,
      canSend: true,
      canReceive: true,
      configuredConnections: connections.length,
      lastCheckedAt: latestTest?.toISOString() ?? null,
    };
  }

  if (failed.length > 0) {
    return {
      id: "whatsapp",
      label: "WhatsApp",
      status: "error",
      message: "A conexão configurada não está operacional",
      canSend: false,
      canReceive: false,
      configuredConnections: connections.length,
      lastCheckedAt: latestTest?.toISOString() ?? null,
    };
  }

  if (connections.length > 0 || (input.whatsappIntegration?.enabled && hasValue(input.whatsappIntegration.whatsappToken))) {
    return {
      id: "whatsapp",
      label: "WhatsApp",
      status: "warning",
      message: "Configuração encontrada; teste a conexão antes de atender",
      canSend: false,
      canReceive: false,
      configuredConnections: connections.length,
      lastCheckedAt: latestTest?.toISOString() ?? null,
    };
  }

  return {
    id: "whatsapp",
    label: "WhatsApp",
    status: "inactive",
    message: "Nenhuma conexão configurada",
    canSend: false,
    canReceive: false,
    configuredConnections: 0,
  };
}

function smsHealth(input: AttendanceChannelHealthInput): AttendanceChannelHealth {
  const integration = input.smsIntegration;
  if (!integration?.enabled) {
    return { id: "sms", label: "SMS", status: "inactive", message: "Integração desativada", canSend: false, canReceive: false };
  }

  const missing = [
    !hasValue(integration.smsAccount) && "account",
    !hasValue(integration.smsCode) && "code",
    !hasValue(integration.smsClient) && "client",
    !hasValue(input.smsEndpoint || integration.smsEndpoint) && "endpoint",
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return {
      id: "sms",
      label: "SMS",
      status: "error",
      message: `Configuração incompleta: ${missing.join(", ")}`,
      canSend: false,
      canReceive: false,
      missing,
    };
  }

  return {
    id: "sms",
    label: "SMS",
    status: "operational",
    message: "Pronto para envios; recebimento não disponível neste provedor",
    canSend: true,
    canReceive: false,
  };
}

function emailHealth(input: AttendanceChannelHealthInput): AttendanceChannelHealth {
  const integration = input.emailIntegration;
  if (!integration?.enabled) {
    return { id: "email", label: "E-mail", status: "inactive", message: "Integração desativada", canSend: false, canReceive: false };
  }

  const smtpReady = hasValue(integration.smtpHost)
    && hasValue(integration.smtpUser)
    && hasValue(integration.smtpPassword)
    && hasValue(integration.fromEmail);
  const sendgridReady = hasValue(integration.sendgridApiKey) && hasValue(integration.fromEmail);
  const locawebReady = hasValue(integration.locawebBaseUrl)
    && hasValue(integration.locawebAccountId)
    && hasValue(integration.locawebApiKey)
    && hasValue(integration.fromEmail);
  const canSend = smtpReady || sendgridReady || locawebReady;
  const canReceive = hasValue(integration.imapHost)
    && hasValue(integration.imapUser)
    && hasValue(integration.imapPassword);

  if (!canSend) {
    return {
      id: "email",
      label: "E-mail",
      status: "error",
      message: "Configuração de envio incompleta",
      canSend: false,
      canReceive,
      missing: ["remetente", "credenciais de envio"],
    };
  }

  return {
    id: "email",
    label: "E-mail",
    status: canReceive ? "operational" : "warning",
    message: canReceive ? "Envio e recebimento configurados" : "Envio configurado; caixa de entrada IMAP pendente",
    canSend: true,
    canReceive,
  };
}

export function buildAttendanceChannelHealth(input: AttendanceChannelHealthInput): AttendanceChannelHealthResponse {
  return {
    channels: [whatsappHealth(input), smsHealth(input), emailHealth(input)],
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
}
