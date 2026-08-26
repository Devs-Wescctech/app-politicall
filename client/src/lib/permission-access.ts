import { resolveUserPermissions, type UserPermissions } from "@shared/schema";

export type PermissionPrincipal = {
  role?: string;
  permissions?: Partial<UserPermissions> | null;
};

export function canAccessPermission(
  principal: PermissionPrincipal | null | undefined,
  permission: keyof UserPermissions,
): boolean {
  if (!principal) return false;
  if (principal.role === "admin") return true;
  return resolveUserPermissions(principal.role, principal.permissions)[permission] === true;
}

export function canAccessPermissionSet(
  principal: PermissionPrincipal | null | undefined,
  permissions: readonly (keyof UserPermissions)[],
): boolean {
  return permissions.some((permission) => canAccessPermission(principal, permission));
}
