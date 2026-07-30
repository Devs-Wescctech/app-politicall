const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function cookieLines(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : [];
}

function defaultCookiePath(pathname) {
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash === 0 ? "/" : pathname.slice(0, lastSlash);
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function pathMatches(pathname, cookiePath) {
  if (pathname === cookiePath) return true;
  if (!pathname.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || pathname[cookiePath.length] === "/";
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
  #nextCreationIndex = 0;

  absorb(headers, responseUrl) {
    const response = new URL(responseUrl);
    const responseHostname = response.hostname.toLowerCase();

    for (const line of cookieLines(headers)) {
      const [pair, ...attributes] = line.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const rawValue = pair.slice(separator + 1).trim();

      let domain = responseHostname;
      let hostOnly = true;
      let path = defaultCookiePath(response.pathname);
      let secure = false;
      let expiresAt = null;
      let maxAge;

      for (const rawAttribute of attributes) {
        const attribute = rawAttribute.trim();
        const attributeSeparator = attribute.indexOf("=");
        const attributeName = (
          attributeSeparator === -1 ? attribute : attribute.slice(0, attributeSeparator)
        ).trim().toLowerCase();
        const attributeValue = attributeSeparator === -1
          ? ""
          : attribute.slice(attributeSeparator + 1).trim();

        if (attributeName === "domain") {
          const candidate = attributeValue.replace(/^\./, "").toLowerCase();
          if (!candidate || !domainMatches(responseHostname, candidate)) {
            domain = null;
            break;
          }
          domain = candidate;
          hostOnly = false;
        } else if (attributeName === "path" && attributeValue.startsWith("/")) {
          path = attributeValue;
        } else if (attributeName === "secure") {
          secure = true;
        } else if (attributeName === "max-age" && /^[+-]?\d+$/.test(attributeValue)) {
          maxAge = Number(attributeValue);
        } else if (attributeName === "expires") {
          const parsedExpiry = Date.parse(attributeValue);
          if (!Number.isNaN(parsedExpiry)) expiresAt = parsedExpiry;
        }
      }

      if (domain === null) continue;
      if (maxAge !== undefined) expiresAt = Date.now() + maxAge * 1_000;
      const key = `${name}\u0000${domain}\u0000${path}`;
      if (expiresAt !== null && expiresAt <= Date.now()) {
        this.#cookies.delete(key);
        continue;
      }

      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        // Preserve a valid raw cookie value when it is not URI encoded.
      }

      const existing = this.#cookies.get(key);
      this.#cookies.set(key, {
        name,
        rawValue,
        value,
        domain,
        hostOnly,
        path,
        secure,
        expiresAt,
        creationIndex: existing?.creationIndex ?? this.#nextCreationIndex++,
      });
    }
  }

  #matchingCookies(targetUrl) {
    const target = new URL(targetUrl);
    const hostname = target.hostname.toLowerCase();
    const secureTransport = target.protocol === "https:" || target.protocol === "wss:";
    const now = Date.now();
    const matches = [];

    for (const [key, cookie] of this.#cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
        this.#cookies.delete(key);
        continue;
      }
      if (cookie.secure && !secureTransport) continue;
      if (cookie.hostOnly ? hostname !== cookie.domain : !domainMatches(hostname, cookie.domain)) {
        continue;
      }
      if (!pathMatches(target.pathname, cookie.path)) continue;
      matches.push(cookie);
    }

    return matches.sort(
      (left, right) => right.path.length - left.path.length
        || left.creationIndex - right.creationIndex,
    );
  }

  get(name, targetUrl) {
    return this.#matchingCookies(targetUrl).find((cookie) => cookie.name === name)?.value;
  }

  header(targetUrl) {
    return this.#matchingCookies(targetUrl)
      .map((cookie) => `${cookie.name}=${cookie.rawValue}`)
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
    const destinationUrl = `${normalizedBaseUrl}${path}`;
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    headers.set("Origin", configuredOrigin);
    const cookie = jar.header(destinationUrl);
    if (cookie) headers.set("Cookie", cookie);

    const usesForm = options.formData !== undefined;
    if (options.body !== undefined && !usesForm) headers.set("Content-Type", "application/json");
    if (!SAFE_METHODS.has(method) && options.csrf !== false) {
      const csrf = jar.get("politicall_csrf", destinationUrl);
      if (!csrf) throw new Error(`Missing user CSRF cookie for ${method} ${path}`);
      headers.set("x-csrf-token", csrf);
    }

    const response = await fetchImpl(destinationUrl, {
      method,
      headers,
      body: usesForm
        ? options.formData
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });
    jar.absorb(response.headers, response.url || destinationUrl);
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
      const loginUrl = `${normalizedBaseUrl}/api/auth/login`;
      if (!jar.get("politicall_access", loginUrl) || !jar.get("politicall_csrf", loginUrl)) {
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
  const cookie = client.jar.header(websocketUrl.toString());
  if (!cookie) throw new Error("Realtime smoke requires an authenticated cookie session");
  return new WebSocketConstructor(websocketUrl.toString(), {
    origin: client.origin,
    headers: { Cookie: cookie },
    perMessageDeflate: false,
  });
}
