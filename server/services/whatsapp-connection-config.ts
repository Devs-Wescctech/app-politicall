export function buildWhatsappConnectionConfig(integration: Record<string, any>) {
  const phoneNumberId = integration.whatsappPhoneNumberId ?? null;
  const businessAccountId = integration.whatsappBusinessAccountId ?? null;
  const official = Boolean(phoneNumberId && businessAccountId);
  const token = official
    ? (integration.whatsappAccessToken ?? integration.whatsappToken ?? null)
    : (integration.whatsappToken ?? null);

  return {
    name: official ? "WhatsApp Cloud / Meta" : "WhatsApp / WHU",
    channel: "whatsapp",
    provider: official ? "meta_cloud" : "wescctech",
    baseUrl: official ? "https://graph.facebook.com" : "https://api.wescctech.com.br",
    token,
    status: integration.enabled && token ? "pending" : "disabled",
    metadata: {
      source: "settings-omni",
      apiType: official ? "official" : "whu",
      official,
      whatsappOfficial: official,
      phoneNumber: integration.whatsappPhoneNumber ?? null,
      phoneNumberId,
      businessAccountId,
      webhookUrl: integration.whatsappWebhookUrl ?? null,
    },
  };
}
