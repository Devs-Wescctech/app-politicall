import { useLocation } from "wouter";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      setLocation("/login");
    }
  }, [session.status, setLocation]);

  if (session.status === "loading") {
    return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  }

  if (session.status === "unauthenticated") return null;
  return <>{children}</>;
}
