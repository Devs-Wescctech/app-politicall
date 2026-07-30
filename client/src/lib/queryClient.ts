import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clearAttendanceCache } from "./auth";
import { configureSessionCleanup, sessionClient } from "./session";

export const apiRequest = sessionClient.apiRequest;
export const publicApiRequest = sessionClient.publicApiRequest;

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const response = await sessionClient.apiRequest("GET", queryKey.join("/") as string);
      return await response.json();
    } catch (error) {
      if (unauthorizedBehavior === "returnNull" && error instanceof Error && error.message === "Authentication failed") return null;
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

configureSessionCleanup({
  clearQueryCache: () => queryClient.clear(),
  clearAttendanceCache,
  clearImpersonationMarker: () => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("isImpersonating");
  },
});
