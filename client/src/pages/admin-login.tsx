import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";

interface AdminLoginForm {
  password: string;
}

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<AdminLoginForm>({
    defaultValues: {
      password: "",
    },
  });

  async function onSubmit(data: AdminLoginForm) {
    setIsLoading(true);
    
    try {
      const response = await apiRequest("POST", "/api/admin/login", { password: data.password });
      const result = await response.json();
      
      localStorage.setItem("admin_token", result.token);
      setLocation("/admin");
    } catch (error: any) {
      toast({
        title: "Senha incorreta",
        description: "A senha informada não está correta",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={logoUrl} alt="Logo" className="h-12" />
          </div>
          <CardDescription className="text-base">
            Acesso Administrativo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha de Administrador</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="••••••••" 
                        type="password" 
                        data-testid="input-admin-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full rounded-full" 
                disabled={isLoading}
                data-testid="button-admin-login"
              >
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </Form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              <button
                onClick={() => setLocation("/login")}
                className="text-primary font-medium hover:underline"
                data-testid="link-back-login"
              >
                Voltar ao login
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
