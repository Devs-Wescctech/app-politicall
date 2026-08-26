import { normalizeWhuPhone } from "./whu-connection-identity";

export function buildWhatsappConnectionConfig(integration: Record<string, any>) {
  const phoneNumberId = integration.whatsappPhoneNumberId ?? null;
  const businessAccountId = integration.whatsappBusinessAccountId ?? null;
  const official = Boolean(phoneNumberId && businessAccountId);
  const token = official
    ? (integration.whatsappAccessToken ?? integration.whatsappToken ?? null)
    : (integration.whatsappToken ?? null);
  const phoneNumber = normalizeWhuPhone(integration.whatsappPhoneNumber);

  return {
    name: official ? "WhatsApp Cloud / Meta" : "WhatsApp / WHU",
    channel: "whatsapp",
    provider: official ? "meta_cloud" : "wescctech",
    baseUrl: official ? "https://graph.facebook.com" : "https://api.wescctech.com.br",
    token,
    phoneNumber,
    status: integration.enabled && token ? "pending" : "disabled",
    metadata: {
      source: "settings-omni",
      apiType: official ? "official" : "whu",
      official,
      whatsappOfficial: official,
      phoneNumber,
      phoneNumberId,
      businessAccountId,
      webhookUrl: integration.whatsappWebhookUrl ?? null,
    },
  };
}
