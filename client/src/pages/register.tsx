import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { setAuthToken, setAuthUser } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertUser & { salesperson?: string; planValue?: string }>({
    resolver: zodResolver(insertUserSchema.extend({
      salesperson: z.string().optional(),
      planValue: z.string().optional(),
    })),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      salesperson: "",
      planValue: "",
      permissions: {
        dashboard: true,
        contacts: false,
        alliances: false,
        demands: false,
        agenda: false,
        ai: false,
        marketing: false,
        petitions: false,
        users: false,
        settings: false,
      },
    },
  });

  async function onSubmit(data: InsertUser) {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register", data);
      const result = await response.json();
      setAuthToken(result.token);
      setAuthUser(result.user);
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Tente novamente",
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
            Crie sua conta para começar a usar a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome completo</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Seu nome" 
                        data-testid="input-name"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="seu@email.com" 
                        type="email" 
                        data-testid="input-email"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Mínimo 6 caracteres" 
                        type="password" 
                        data-testid="input-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="salesperson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendedor</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Nome do vendedor" 
                          data-testid="input-salesperson"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="planValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor do Plano</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: R$ 299,00" 
                          data-testid="input-plan-value"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3">Módulos disponíveis</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Selecione os módulos que deseja ativar para esta conta
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="permissions.contacts"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-contacts"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Eleitores
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.alliances"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-alliances"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Alianças
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.demands"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-demands"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Demandas
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.agenda"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-agenda"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Agenda
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.ai"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-ai"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Atendimento IA
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.marketing"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-marketing"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Pesquisas
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permissions.petitions"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-petitions"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal cursor-pointer">
                            Petições
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormItem className="flex items-center space-x-2 space-y-0 col-span-2 pt-2 border-t mt-2">
                      <Checkbox
                        checked={
                          form.watch("permissions.contacts") &&
                          form.watch("permissions.alliances") &&
                          form.watch("permissions.demands") &&
                          form.watch("permissions.agenda") &&
                          form.watch("permissions.ai") &&
                          form.watch("permissions.marketing") &&
                          form.watch("permissions.petitions")
                        }
                        onCheckedChange={(checked) => {
                          const value = Boolean(checked);
                          form.setValue("permissions.contacts", value);
                          form.setValue("permissions.alliances", value);
                          form.setValue("permissions.demands", value);
                          form.setValue("permissions.agenda", value);
                          form.setValue("permissions.ai", value);
                          form.setValue("permissions.marketing", value);
                          form.setValue("permissions.petitions", value);
                        }}
                        data-testid="checkbox-select-all"
                      />
                      <FormLabel className="text-sm font-medium cursor-pointer">
                        Selecionar Todas
                      </FormLabel>
                    </FormItem>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-register"
              >
                {isLoading ? "Criando conta..." : "Criar conta"}
              </Button>
            </form>
          </Form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{" "}
              <button
                onClick={() => setLocation("/login")}
                className="text-primary font-medium hover:underline"
                data-testid="link-login"
              >
                Fazer login
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
