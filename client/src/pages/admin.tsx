import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logoUrl from "@assets/logo pol_1763308638963.png";

export default function Admin() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const isAdminAuthenticated = localStorage.getItem("admin_authenticated") === "true";
    if (!isAdminAuthenticated) {
      setLocation("/admin-login");
    }
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("admin_authenticated");
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={logoUrl} alt="Logo" className="h-12" />
          </div>
          <CardTitle className="text-center text-2xl">Área Administrativa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-8">
            <p className="text-lg text-muted-foreground" data-testid="text-admin-message">
              Área administrativa em construção
            </p>
          </div>
          <div className="flex justify-center">
            <Button 
              onClick={handleLogout} 
              variant="outline"
              className="rounded-full"
              data-testid="button-admin-logout"
            >
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
