import type { User } from "@shared/schema";
import { sessionClient, type DisplayUser } from "./session";

const ATTENDANCE_CACHE_PREFIX = "politicall:attendance:messages";

export type CachedAuthUser = DisplayUser;

export function clearAttendanceCache(): void {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(ATTENDANCE_CACHE_PREFIX)) localStorage.removeItem(key);
  }
}

export function setAuthUser(user: Partial<User> | DisplayUser): void {
  sessionClient.cacheUser(user);
}

export function getAuthUser(): CachedAuthUser | null {
  return sessionClient.getCachedUser();
}

export function clearAuthUser(): void {
  sessionClient.getCachedUser();
  if (typeof localStorage !== "undefined") localStorage.removeItem("auth_user");
}

// Kept as an inert compatibility export while Task 6 removes the admin impersonation caller.
export function setAuthToken(_token: string): void {}
