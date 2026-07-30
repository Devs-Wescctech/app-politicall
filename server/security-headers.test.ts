import { describe, expect, it, vi } from "vitest";
import { securityHeaders } from "./security-headers";

function createResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    res: {
      setHeader: (key: string, value: string) => headers.set(key, value),
    },
  };
}

describe("securityHeaders", () => {
  it("sets baseline browser hardening headers", () => {
    const { headers, res } = createResponse();
    const next = vi.fn();

    securityHeaders({} as any, res as any, next);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("sets HSTS only in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const { headers, res } = createResponse();
    securityHeaders({} as any, res as any, vi.fn());

    expect(headers.get("Strict-Transport-Security")).toBe("max-age=15552000; includeSubDomains");
    expect(headers.get("Content-Security-Policy")).toBe([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https: data: blob:",
      "media-src 'self' https: data: blob:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://drive.google.com https://www.youtube.com https://player.vimeo.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "));
    process.env.NODE_ENV = originalNodeEnv;
  });
});
