// Authentication utilities
import { type User } from "@shared/schema";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("isImpersonating");
}

export function setAuthUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAuthUser(): User | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function getUserRole(): string {
  const user = getAuthUser();
  return user?.role || "assessor";
}

export function isAdmin(): boolean {
  return getUserRole() === "admin";
}

export function isCoordinator(): boolean {
  const role = getUserRole();
  return role === "coordenador" || role === "admin";
}
