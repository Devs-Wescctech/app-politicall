import {
  createBrowserRefreshCoordinator,
  type RefreshCoordinator,
} from "./session-coordinator";

export type DisplayUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  avatar?: string | null;
  phone?: string | null;
  partyId?: string | null;
  politicalPosition?: string | null;
  electionNumber?: string | null;
  lastElectionVotes?: number | null;
  state?: string | null;
  city?: string | null;
  volunteerCode?: string | null;
  landingBackground?: string | null;
  party?: { id: string; name: string; acronym: string; ideology: string } | null;
};

export type SessionSnapshot =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: DisplayUser }
  | { status: "unauthenticated"; user: null };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type SessionCleanup = {
  clearQueryCache(): void;
  clearAttendanceCache(): void;
  clearImpersonationMarker(): void;
};

export type SessionDependencies = {
  fetch: typeof fetch;
  storage: StorageLike;
  readCookie(name: string): string | null;
  cleanup: SessionCleanup;
  coordinateRefresh?: RefreshCoordinator;
  resetRefreshCoordination?: () => void;
};

const USER_CACHE_KEY = "auth_user";
const CSRF_COOKIE = "politicall_csrf";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NON_REFRESHABLE_AUTH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/csrf",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

function browserStorage(): StorageLike {
  if (typeof window !== "undefined") return window.localStorage;
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function noOpCleanup(): SessionCleanup {
  return {
    clearQueryCache: () => undefined,
    clearAttendanceCache: () => undefined,
    clearImpersonationMarker: () => undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null | undefined {
  return value === undefined || value === null || typeof value === "string" ? value : undefined;
}

function sanitizeUser(value: unknown): DisplayUser | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.email !== "string"
    || typeof value.role !== "string"
    || !isRecord(value.permissions)
    || Object.values(value.permissions).some((permission) => typeof permission !== "boolean")) return null;

  const user: DisplayUser = {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    permissions: { ...value.permissions } as Record<string, boolean>,
  };
  const nullableFields: Array<keyof Pick<DisplayUser, "avatar" | "phone" | "partyId" | "politicalPosition" | "electionNumber" | "state" | "city" | "volunteerCode" | "landingBackground">> = [
    "avatar", "phone", "partyId", "politicalPosition", "electionNumber", "state", "city", "volunteerCode", "landingBackground",
  ];
  for (const field of nullableFields) {
    const fieldValue = stringOrNull(value[field]);
    if (fieldValue !== undefined) user[field] = fieldValue;
  }
  if (value.lastElectionVotes === null || typeof value.lastElectionVotes === "number") user.lastElectionVotes = value.lastElectionVotes;
  if (isRecord(value.party)
    && typeof value.party.id === "string"
    && typeof value.party.name === "string"
    && typeof value.party.acronym === "string"
    && typeof value.party.ideology === "string") {
    user.party = { id: value.party.id, name: value.party.name, acronym: value.party.acronym, ideology: value.party.ideology };
  } else if (value.party === null) {
    user.party = null;
  }
  return user;
}

function errorFromResponse(response: Response): Promise<Error> {
  return response.text().then((text) => {
    if (!text) return new Error(response.statusText || "Request failed");
    try {
      const body = JSON.parse(text) as { message?: string; error?: string };
      return new Error(body.message || body.error || text);
    } catch {
      return new Error(text);
    }
  });
}

async function isAuthenticationRejection(response: Response): Promise<boolean> {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().json() as { error?: unknown };
    return body.error === "Authentication failed";
  } catch {
    return false;
  }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isRawBody(value: unknown): value is BodyInit {
  return isFormData(value)
    || (typeof Blob !== "undefined" && value instanceof Blob)
    || (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
    || typeof value === "string";
}

export function createSessionClient(dependencies: SessionDependencies) {
  let snapshot: SessionSnapshot = { status: "loading", user: null };
  let bootstrapInFlight: Promise<SessionSnapshot> | undefined;
  let bootstrapComplete = false;
  let refreshInFlight: Promise<boolean> | undefined;
  const listeners = new Set<(value: SessionSnapshot) => void>();
  const coordinateRefresh = dependencies.coordinateRefresh;

  const publish = (next: SessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };
  const clearCachedUser = () => dependencies.storage.removeItem(USER_CACHE_KEY);
  const cacheUser = (user: unknown): DisplayUser | null => {
    const sanitized = sanitizeUser(user);
    if (!sanitized) return null;
    dependencies.storage.setItem(USER_CACHE_KEY, JSON.stringify(sanitized));
    return sanitized;
  };
  const getCachedUser = (): DisplayUser | null => {
    const raw = dependencies.storage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    try {
      const parsed = sanitizeUser(JSON.parse(raw));
      if (!parsed) clearCachedUser();
      return parsed;
    } catch {
      clearCachedUser();
      return null;
    }
  };
  const ensureCsrfToken = async (): Promise<string> => {
    const existing = dependencies.readCookie(CSRF_COOKIE);
    if (existing) return existing;
    const response = await dependencies.fetch("/api/auth/csrf", { credentials: "include" });
    if (!response.ok) throw await errorFromResponse(response);
    const token = dependencies.readCookie(CSRF_COOKIE);
    if (!token) throw new Error("CSRF token unavailable");
    return token;
  };
  const rawRequest = async (method: string, url: string, data?: unknown, csrf = false): Promise<Response> => {
    const headers = new Headers();
    if (csrf) headers.set("x-csrf-token", await ensureCsrfToken());
    let body: BodyInit | undefined;
    if (data !== undefined) {
      if (isRawBody(data)) body = data;
      else {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(data);
      }
    }
    return dependencies.fetch(url, { method, headers, body, credentials: "include" });
  };
  const performRefresh = async (): Promise<boolean> => {
    try {
      const response = await rawRequest("POST", "/api/auth/refresh", undefined, true);
      if (!response.ok) {
        clearCachedUser();
        publish({ status: "unauthenticated", user: null });
        return false;
      }
      const result = await response.json().catch(() => null) as { user?: unknown } | null;
      const user = cacheUser(result?.user);
      if (user) publish({ status: "authenticated", user });
      return true;
    } catch {
      clearCachedUser();
      publish({ status: "unauthenticated", user: null });
      return false;
    }
  };
  const refreshSession = (): Promise<boolean> => {
    if (!refreshInFlight) {
      refreshInFlight = (coordinateRefresh ? coordinateRefresh(performRefresh) : performRefresh()).finally(() => {
        refreshInFlight = undefined;
      });
    }
    return refreshInFlight;
  };
  const request = async (method: string, url: string, data?: unknown): Promise<Response> => {
    const mutation = MUTATING_METHODS.has(method.toUpperCase());
    let response = await rawRequest(method, url, data, mutation);
    if (response.status === 401 && !NON_REFRESHABLE_AUTH_PATHS.has(url) && await refreshSession()) {
      response = await rawRequest(method, url, data, mutation);
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  };
  const publicApiRequest = async (
    method: string,
    url: string,
    data?: unknown,
    options: { returnErrorResponse?: boolean } = {},
  ): Promise<Response> => {
    const response = await rawRequest(method, url, data);
    if (!response.ok && !options.returnErrorResponse) throw await errorFromResponse(response);
    return response;
  };
  const bootstrap = (): Promise<SessionSnapshot> => {
    if (bootstrapInFlight) return bootstrapInFlight;
    if (bootstrapComplete) return Promise.resolve(snapshot);
    bootstrapInFlight = (async () => {
      try {
        let response = await dependencies.fetch("/api/auth/me", { credentials: "include" });
        if (response.status === 401 && await refreshSession()) {
          response = await dependencies.fetch("/api/auth/me", { credentials: "include" });
        }
        if (!response.ok) {
          clearCachedUser();
          publish({ status: "unauthenticated", user: null });
          return snapshot;
        }
        const user = cacheUser(await response.json());
        if (!user) {
          clearCachedUser();
          publish({ status: "unauthenticated", user: null });
          return snapshot;
        }
        publish({ status: "authenticated", user });
        return snapshot;
      } catch {
        clearCachedUser();
        publish({ status: "unauthenticated", user: null });
        return snapshot;
      }
    })().finally(() => {
      bootstrapComplete = true;
      bootstrapInFlight = undefined;
    });
    return bootstrapInFlight;
  };
  const startSession = async (path: "/api/auth/login" | "/api/auth/register", data: unknown): Promise<DisplayUser> => {
    const response = await rawRequest("POST", path, data);
    if (!response.ok) throw await errorFromResponse(response);
    const result = await response.json() as { user?: unknown };
    const user = cacheUser(result.user);
    if (!user) throw new Error("Authentication response did not include a display user");
    bootstrapComplete = true;
    publish({ status: "authenticated", user });
    return user;
  };
  const logoutSession = async (): Promise<{ error: string | null }> => {
    let error: string | null = null;
    try {
      const response = await rawRequest("POST", "/api/auth/logout", undefined, true);
      if (await isAuthenticationRejection(response)) {
        const fallback = await rawRequest("DELETE", "/api/auth/refresh", undefined, true);
        if (!fallback.ok) error = "Unable to end session";
      } else if (!response.ok) {
        error = "Unable to end session";
      }
    } catch {
      error = "Unable to end session";
    } finally {
      clearCachedUser();
      dependencies.cleanup.clearQueryCache();
      dependencies.cleanup.clearAttendanceCache();
      dependencies.cleanup.clearImpersonationMarker();
      dependencies.resetRefreshCoordination?.();
      bootstrapComplete = true;
      publish({ status: "unauthenticated", user: null });
    }
    return { error };
  };

  return {
    apiRequest: request,
    bootstrap,
    cacheUser,
    ensureCsrfToken,
    getCachedUser,
    getSnapshot: () => snapshot,
    loginSession: (data: unknown) => startSession("/api/auth/login", data),
    logoutSession,
    publicApiRequest,
    refreshSession,
    registerSession: (data: unknown) => startSession("/api/auth/register", data),
    subscribe(listener: (value: SessionSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let cleanup = noOpCleanup();
const browserRefreshCoordinator = createBrowserRefreshCoordinator();
const browserSession = createSessionClient({
  fetch: (...args) => fetch(...args),
  storage: browserStorage(),
  readCookie: readBrowserCookie,
  get cleanup() { return cleanup; },
  coordinateRefresh: browserRefreshCoordinator?.run,
  resetRefreshCoordination: browserRefreshCoordinator?.reset,
});

export function configureSessionCleanup(nextCleanup: SessionCleanup): void {
  cleanup = nextCleanup;
}

export const sessionClient = browserSession;
