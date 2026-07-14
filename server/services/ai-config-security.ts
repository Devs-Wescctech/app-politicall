const AI_CONFIG_SECRET_FIELDS = [
  "facebookAppSecret",
  "facebookPageAccessToken",
  "facebookWebhookVerifyToken",
  "instagramAppSecret",
  "instagramAccessToken",
  "instagramWebhookVerifyToken",
  "twitterApiKey",
  "twitterApiSecretKey",
  "twitterBearerToken",
  "twitterAccessToken",
  "twitterAccessTokenSecret",
  "twitterClientSecret",
  "whatsappAccessToken",
  "whatsappAppSecret",
  "whatsappWebhookVerifyToken",
  "openaiApiKey",
] as const;

export function sanitizeAiConfiguration(config: Record<string, any> | null | undefined): Record<string, any> {
  if (!config) {
    return {
      mode: "compliance",
      hasCustomKey: false,
      openaiApiKeyLast4: null,
    };
  }

  const sanitized: Record<string, any> = { ...config };
  for (const field of AI_CONFIG_SECRET_FIELDS) {
    delete sanitized[field];
  }

  sanitized.hasCustomKey = !!config.openaiApiKey;
  sanitized.openaiApiKeyLast4 = config.openaiApiKeyLast4 || null;

  return sanitized;
}
