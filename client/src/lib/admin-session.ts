import {
  createBrowserRefreshCoordinator,
  type RefreshCoordinator,
} from "./session-coordinator";

export type AdminSessionSnapshot =
  | { status: "loading" }
  | { status: "authenticated" }
  | { status: "unauthenticated" };

type AdminCleanup = {
  clearQueryCache(): void;
  clearAdminCache(): void;
  clearImpersonationMarker(): void;
};

export type AdminSessionDependencies = {
  fetch: typeof fetch;
  readCookie(name: string): string | null;
  cleanup: AdminCleanup;
  coordinateRefresh?: RefreshCoordinator;
  resetRefreshCoordination?: () => void;
};

type GenerationFlight<T> = { generation: number; promise: Promise<T> };

const ADMIN_CSRF_COOKIE = "politicall_admin_csrf";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NON_REFRESHABLE_PATHS = new Set([
  "/api/admin/login",
  "/api/admin/verify",
  "/api/admin/auth/csrf",
  "/api/admin/auth/refresh",
  "/api/admin/auth/logout",
]);

function browserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function noOpCleanup(): AdminCleanup {
  return {
    clearQueryCache: () => undefined,
    clearAdminCache: () => undefined,
    clearImpersonationMarker: () => undefined,
  };
}

function isAuthenticationRejection(response: Response): Promise<boolean> {
  if (response.status === 401) return Promise.resolve(true);
  if (response.status !== 403) return Promise.resolve(false);
  return response.clone().json().then((body: { error?: unknown }) => body.error === "Authentication failed").catch(() => false);
}

function isRawBody(value: unknown): value is BodyInit {
  return (typeof FormData !== "undefined" && value instanceof FormData)
    || (typeof Blob !== "undefined" && value instanceof Blob)
    || (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
    || typeof value === "string";
}

export function createAdminSessionClient(dependencies: AdminSessionDependencies) {
  let snapshot: AdminSessionSnapshot = { status: "loading" };
  let generation = 0;
  let bootstrapComplete = false;
  let bootstrapInFlight: GenerationFlight<AdminSessionSnapshot> | undefined;
  let refreshInFlight: GenerationFlight<boolean> | undefined;
  let cleanedGeneration: number | undefined;
  const listeners = new Set<(snapshot: AdminSessionSnapshot) => void>();
  const current = (candidate: number) => candidate === generation;
  const publish = (next: AdminSessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(next));
  };
  const reset = () => {
    generation += 1;
    bootstrapComplete = false;
    cleanedGeneration = undefined;
    dependencies.resetRefreshCoordination?.();
    return generation;
  };
  const invalidate = (activeGeneration: number) => {
    if (!current(activeGeneration)) return;
    if (cleanedGeneration !== activeGeneration) {
      cleanedGeneration = activeGeneration;
      dependencies.cleanup.clearQueryCache();
      dependencies.cleanup.clearAdminCache();
      dependencies.cleanup.clearImpersonationMarker();
      dependencies.resetRefreshCoordination?.();
    }
    bootstrapComplete = true;
    publish({ status: "unauthenticated" });
  };
  const ensureCsrf = async () => {
    const existing = dependencies.readCookie(ADMIN_CSRF_COOKIE);
    if (existing) return existing;
    const response = await dependencies.fetch("/api/admin/auth/csrf", { credentials: "include" });
    if (!response.ok) throw new Error("Admin request failed");
    const token = dependencies.readCookie(ADMIN_CSRF_COOKIE);
    if (!token) throw new Error("Admin request failed");
    return token;
  };
  const rawRequest = async (method: string, url: string, data?: unknown, csrf = false) => {
    const headers = new Headers();
    if (csrf) headers.set("x-csrf-token", await ensureCsrf());
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
  const refresh = (): Promise<boolean> => {
    const activeGeneration = generation;
    if (refreshInFlight?.generation === activeGeneration) return refreshInFlight.promise;
    let flight!: { generation: number; promise: Promise<boolean> };
    const request = async () => {
      try {
        const response = await rawRequest("POST", "/api/admin/auth/refresh", undefined, true);
        if (!current(activeGeneration)) return false;
        if (!response.ok) {
          invalidate(activeGeneration);
          return false;
        }
        publish({ status: "authenticated" });
        return true;
      } catch {
        invalidate(activeGeneration);
        return false;
      }
    };
    const promise = (dependencies.coordinateRefresh ? dependencies.coordinateRefresh(request) : request())
      .then((success) => current(activeGeneration) && success)
      .finally(() => { if (refreshInFlight === flight) refreshInFlight = undefined; });
    flight = { generation: activeGeneration, promise };
    refreshInFlight = flight;
    return promise;
  };
  const bootstrap = (): Promise<AdminSessionSnapshot> => {
    const activeGeneration = generation;
    if (bootstrapInFlight?.generation === activeGeneration) return bootstrapInFlight.promise;
    if (bootstrapComplete) return Promise.resolve(snapshot);
    let flight!: GenerationFlight<AdminSessionSnapshot>;
    const promise = (async () => {
      try {
        let response = await dependencies.fetch("/api/admin/verify", { credentials: "include" });
        if (response.status === 401 && current(activeGeneration) && await refresh() && current(activeGeneration)) {
          response = await dependencies.fetch("/api/admin/verify", { credentials: "include" });
        }
        if (!current(activeGeneration)) return snapshot;
        if (response.ok && (await response.json().catch(() => null) as { valid?: unknown } | null)?.valid === true) {
          publish({ status: "authenticated" });
        } else invalidate(activeGeneration);
      } catch {
        invalidate(activeGeneration);
      } finally {
        if (current(activeGeneration)) bootstrapComplete = true;
        if (bootstrapInFlight === flight) bootstrapInFlight = undefined;
      }
      return snapshot;
    })();
    flight = { generation: activeGeneration, promise };
    bootstrapInFlight = flight;
    return promise;
  };
  const login = async (data: { password: string }) => {
    const activeGeneration = reset();
    const response = await rawRequest("POST", "/api/admin/login", data);
    if (!current(activeGeneration) || !response.ok) {
      invalidate(activeGeneration);
      throw new Error("Admin login failed");
    }
    bootstrapComplete = true;
    publish({ status: "authenticated" });
  };
  const adminRequest = async (
    method: string,
    url: string,
    data?: unknown,
    options: { returnErrorResponse?: boolean } = {},
  ): Promise<Response> => {
    const activeGeneration = generation;
    const csrf = MUTATING_METHODS.has(method.toUpperCase());
    let response = await rawRequest(method, url, data, csrf);
    if (response.status === 401 && current(activeGeneration) && !NON_REFRESHABLE_PATHS.has(url)
      && await refresh() && current(activeGeneration)) {
      response = await rawRequest(method, url, data, csrf);
    }
    if (!response.ok && !options.returnErrorResponse) throw new Error("Admin request failed");
    return response;
  };
  const logout = async (): Promise<{ error: string | null }> => {
    const activeGeneration = reset();
    let error: string | null = null;
    try {
      const response = await rawRequest("POST", "/api/admin/auth/logout", undefined, true);
      if (current(activeGeneration) && await isAuthenticationRejection(response)) {
        const fallback = await rawRequest("DELETE", "/api/admin/auth/refresh", undefined, true);
        if (!fallback.ok) error = "Unable to end session";
      } else if (!response.ok) error = "Unable to end session";
    } catch {
      error = "Unable to end session";
    } finally {
      if (current(activeGeneration)) {
        invalidate(activeGeneration);
      }
    }
    return { error };
  };
  return {
    adminRequest,
    bootstrap,
    ensureCsrf,
    getSnapshot: () => snapshot,
    login,
    logout,
    refresh,
    subscribe(listener: (next: AdminSessionSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let cleanup = noOpCleanup();
const coordinator = createBrowserRefreshCoordinator("politicall-admin-session-refresh");
export const adminSessionClient = createAdminSessionClient({
  fetch: (...args) => fetch(...args),
  readCookie: browserCookie,
  get cleanup() { return cleanup; },
  coordinateRefresh: coordinator?.run,
  resetRefreshCoordination: coordinator?.reset,
});

export function configureAdminSessionCleanup(next: AdminCleanup): void {
  cleanup = next;
}

export const adminRequest = adminSessionClient.adminRequest;
