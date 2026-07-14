import { describe, expect, it } from "vitest";
import { sanitizeAiConfiguration } from "./ai-config-security";

describe("sanitizeAiConfiguration", () => {
  it("removes provider secrets from API responses while preserving safe metadata", () => {
    const result = sanitizeAiConfiguration({
      id: "cfg-1",
      accountId: "account-1",
      userId: "user-1",
      mode: "compliance",
      facebookAppId: "app-id",
      facebookPageName: "Página",
      facebookAppSecret: "app-secret",
      facebookPageAccessToken: "page-token",
      facebookWebhookVerifyToken: "verify-token",
      instagramAccessToken: "ig-token",
      twitterBearerToken: "bearer-token",
      twitterAccessTokenSecret: "token-secret",
      whatsappAccessToken: "wa-token",
      whatsappAppSecret: "wa-secret",
      openaiApiKey: "sk-secret",
      openaiApiKeyLast4: "abcd",
    });

    expect(result).toMatchObject({
      id: "cfg-1",
      mode: "compliance",
      facebookAppId: "app-id",
      facebookPageName: "Página",
      hasCustomKey: true,
      openaiApiKeyLast4: "abcd",
    });
    expect(result).not.toHaveProperty("facebookAppSecret");
    expect(result).not.toHaveProperty("facebookPageAccessToken");
    expect(result).not.toHaveProperty("facebookWebhookVerifyToken");
    expect(result).not.toHaveProperty("instagramAccessToken");
    expect(result).not.toHaveProperty("twitterBearerToken");
    expect(result).not.toHaveProperty("twitterAccessTokenSecret");
    expect(result).not.toHaveProperty("whatsappAccessToken");
    expect(result).not.toHaveProperty("whatsappAppSecret");
    expect(result).not.toHaveProperty("openaiApiKey");
  });

  it("returns default public AI config metadata when no config exists", () => {
    expect(sanitizeAiConfiguration(undefined)).toEqual({
      mode: "compliance",
      hasCustomKey: false,
      openaiApiKeyLast4: null,
    });
  });
});
