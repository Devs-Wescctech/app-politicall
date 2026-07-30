import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const attendanceRoutes = readFileSync(new URL("./attendance-routes.ts", import.meta.url), "utf8");

describe("Authentication Task 7 route security", () => {
  it("re-encrypts WhatsApp integration credentials for the Omni connection destination", () => {
    const syncStart = routes.indexOf("async function syncWhatsappIntegrationConnection");
    const syncEnd = routes.indexOf("// Cache", syncStart);
    const sync = routes.slice(syncStart, syncEnd);

    expect(sync).toContain("prepareWhatsappOmniConnection");
    expect(sync).not.toContain("...config,");
  });

  it("masks nested webhook credentials from connection test responses and audit payloads", () => {
    const start = attendanceRoutes.indexOf('app.post("/api/attendance/connections/:id/test"');
    const end = attendanceRoutes.indexOf("// ===================== PROVIDER PROXY", start);
    const endpoint = attendanceRoutes.slice(start, end);

    expect(endpoint).toContain("after: maskChannelConnectionSecrets(updated)");
    expect(endpoint).toContain("res.json(maskChannelConnectionSecrets(updated))");
    expect(endpoint).not.toContain("token: maskToken(updated.token)");
  });

  it("uses bounded OAuth sanitizer for token and profile errors", () => {
    expect(routes).toContain("redactGoogleOauthFailure(emailError)");
    expect(routes).not.toContain("emailError.message");
  });
});
