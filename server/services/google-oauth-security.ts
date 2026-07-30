type OAuthErrorLike = {
  response?: { status?: unknown; data?: { error?: unknown; code?: unknown } };
  code?: unknown;
};

export type SafeGoogleOauthFailure = { status: number | null; code: string; message: string };
export type SafeGoogleOauthResponse = { error: string; category: "google_oauth"; status: number; code: string };

export function redactGoogleOauthFailure(error: unknown): SafeGoogleOauthFailure {
  const source = (error && typeof error === "object" ? error : {}) as OAuthErrorLike;
  const status = typeof source.response?.status === "number" && source.response.status >= 400 && source.response.status <= 599
    ? source.response.status
    : null;
  const candidate = source.response?.data?.error ?? source.response?.data?.code ?? source.code;
  const code = typeof candidate === "string" && /^[a-z0-9_.-]{1,64}$/i.test(candidate) ? candidate : "oauth_error";
  return { status, code, message: "Google OAuth request failed" };
}

export function toSafeGoogleOauthResponse(error: unknown): SafeGoogleOauthResponse {
  const failure = redactGoogleOauthFailure(error);
  return {
    error: failure.message,
    category: "google_oauth",
    status: failure.status ?? 500,
    code: failure.code,
  };
}
