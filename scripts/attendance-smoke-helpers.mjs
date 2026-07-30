const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function cookieLines(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : [];
}

function parseResponseData(text, contentType) {
  if (!text) return null;
  return contentType.includes("application/json") ? JSON.parse(text) : text;
}

function exactOrigin(value) {
  const parsed = new URL(value);
  if (parsed.origin !== value) throw new Error("Smoke Origin must be an exact URL origin");
  return value;
}

export class CookieJar {
  #cookies = new Map();

  absorb(headers) {
    for (const line of cookieLines(headers)) {
      const [pair, ...attributes] = line.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const rawValue = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => attribute.trim().toLowerCase() === "max-age=0");
      if (expired || !rawValue) {
        this.#cookies.delete(name);
        continue;
      }
      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        // Preserve a valid raw cookie value when it is not URI encoded.
      }
      this.#cookies.set(name, { rawValue, value });
    }
  }

  set(name, value) {
    this.#cookies.set(name, { rawValue: value, value });
  }

  get(name) {
    return this.#cookies.get(name)?.value;
  }

  header() {
    return [...this.#cookies]
      .map(([name, cookie]) => `${name}=${cookie.rawValue}`)
      .join("; ");
  }
}

export function requireEnvironment(name, environment = process.env) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be set for the attendance smoke test`);
  }
  return value;
}

export function createSmokeHttpClient({
  baseUrl,
  origin,
  fetchImpl = globalThis.fetch,
  jar = new CookieJar(),
}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const configuredOrigin = exactOrigin(origin);

  async function send(path, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    headers.set("Origin", configuredOrigin);
    const cookie = jar.header();
    if (cookie) headers.set("Cookie", cookie);

    const usesForm = options.formData !== undefined;
    if (options.body !== undefined && !usesForm) headers.set("Content-Type", "application/json");
    if (!SAFE_METHODS.has(method) && options.csrf !== false) {
      const csrf = jar.get("politicall_csrf");
      if (!csrf) throw new Error(`Missing user CSRF cookie for ${method} ${path}`);
      headers.set("x-csrf-token", csrf);
    }

    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method,
      headers,
      body: usesForm
        ? options.formData
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });
    jar.absorb(response.headers);
    const text = await response.text();
    const data = parseResponseData(text, response.headers.get("content-type") ?? "");
    return { response, text, data };
  }

  async function request(path, options = {}) {
    const result = await send(path, options);
    if (!result.response.ok) {
      throw new Error(`${options.method ?? "GET"} ${path} failed ${result.response.status}: ${result.text}`);
    }
    return result.data;
  }

  return {
    baseUrl: normalizedBaseUrl,
    origin: configuredOrigin,
    jar,

    async login(email, password) {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: { email, password },
        csrf: false,
      });
      if (!jar.get("politicall_access") || !jar.get("politicall_csrf")) {
        throw new Error("User login did not establish the required cookie session");
      }
      return data;
    },

    request,

    async requestFailure(path, options = {}, expectedStatus) {
      const result = await send(path, options);
      if (result.response.ok) {
        throw new Error(`${options.method ?? "GET"} ${path} unexpectedly succeeded`);
      }
      if (expectedStatus && result.response.status !== expectedStatus) {
        throw new Error(
          `${options.method ?? "GET"} ${path} expected ${expectedStatus}, got ${result.response.status}: ${result.text}`,
        );
      }
      return { status: result.response.status, data: result.data, text: result.text };
    },

    requestForm(path, formData, method = "POST") {
      return request(path, { method, formData });
    },

    async requestText(path, options = {}) {
      const result = await send(path, options);
      if (!result.response.ok) {
        throw new Error(`${options.method ?? "GET"} ${path} failed ${result.response.status}: ${result.text}`);
      }
      return result.text;
    },
  };
}

export function openAttendanceRealtimeSocket(WebSocketConstructor, client) {
  const websocketUrl = new URL("/api/attendance/realtime", client.baseUrl);
  websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
  const cookie = client.jar.header();
  if (!cookie) throw new Error("Realtime smoke requires an authenticated cookie session");
  return new WebSocketConstructor(websocketUrl.toString(), {
    origin: client.origin,
    headers: { Cookie: cookie },
    perMessageDeflate: false,
  });
}
