import { useQuery } from "@tanstack/react-query";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useCurrentUser() {
  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
    staleTime: 60000, // Cache for 1 minute
  });

  return {
    user,
    isLoading,
    isAdmin: user?.role === "admin",
    isCoordinator: user?.role === "coordenador" || user?.role === "admin",
  };
}
