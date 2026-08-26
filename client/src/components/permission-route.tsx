import { Redirect } from "wouter";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canAccessPermission, canAccessPermissionSet } from "@/lib/permission-access";
import type { UserPermissions } from "@shared/schema";

type PermissionRouteProps = {
  children: React.ReactNode;
  permission?: keyof UserPermissions;
  anyOf?: readonly (keyof UserPermissions)[];
};

export function PermissionRoute({ children, permission, anyOf }: PermissionRouteProps) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center">Carregando...</div>;
  }

  const allowed = permission
    ? canAccessPermission(user, permission)
    : canAccessPermissionSet(user, anyOf ?? []);

  if (!allowed) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}
