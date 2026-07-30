type LocawebIntegration = {
  locawebBaseUrl?: string | null;
  locawebAccountId?: string | null;
  locawebApiKey?: string | null;
  locawebAuthHeader?: string | null;
  locawebAuthScheme?: string | null;
};

export function locawebConfigFromIntegration(integration: LocawebIntegration) {
  return {
    baseUrl: integration.locawebBaseUrl || "https://emailmarketing.locaweb.com.br/api/v1",
    accountId: integration.locawebAccountId || "",
    apiKey: integration.locawebApiKey || "",
    authHeader: integration.locawebAuthHeader || "Authorization",
    authScheme: integration.locawebAuthScheme || "Bearer",
  };
}
