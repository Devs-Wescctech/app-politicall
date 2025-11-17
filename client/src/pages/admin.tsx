import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logoUrl from "@assets/logo pol_1763308638963.png";

export default function Admin() {
  const [, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    async function verifyAdminToken() {
      const token = localStorage.getItem("admin_token");
      
      if (!token) {
        setLocation("/admin-login");
        return;
      }

      try {
        const response = await fetch("/api/admin/verify", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        const result = await response.json();
        
        if (!result.valid) {
          localStorage.removeItem("admin_token");
          setLocation("/admin-login");
        } else {
          setIsVerifying(false);
        }
      } catch (error) {
        localStorage.removeItem("admin_token");
        setLocation("/admin-login");
      }
    }

    verifyAdminToken();
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setLocation("/login");
  };

  if (isVerifying) {
    return null;
  }

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
