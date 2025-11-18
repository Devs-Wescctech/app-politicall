import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { UserPlus, ArrowLeft, Mail, Lock, User as UserIcon } from "lucide-react";
import logoUrl from "@assets/logo pol_1763308638963.png";

// User type from backend
type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordenador" | "assessor";
  permissions: any;
  createdAt: Date;
  activityCount?: number;
};

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function ContractsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  // Verify admin token on mount
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

  // Fetch all users with admin token
  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/users", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao carregar usuários");
      }
      
      return response.json();
    },
    enabled: !isVerifying,
  });

  // Filter only admin users
  const adminUsers = users.filter(user => user.role === "admin");

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          role: "admin",
          permissions: {
            dashboard: true,
            contacts: true,
            alliances: true,
            demands: true,
            agenda: true,
            ai: true,
            marketing: true,
            users: true,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao criar usuário");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Conta criada com sucesso!",
        description: "O novo usuário admin foi adicionado ao sistema.",
      });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Não foi possível criar a conta.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
  });

  const handleCreateUser = (data: CreateUserForm) => {
    createUserMutation.mutate(data);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setLocation("/admin-login");
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando autenticação...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <img src={logoUrl} alt="Politicall Logo" className="h-10" data-testid="img-logo" />
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setLocation("/admin")}
              variant="outline"
              className="rounded-full"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button 
              onClick={handleLogout} 
              variant="outline"
              className="rounded-full"
              data-testid="button-logout"
            >
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-2" data-testid="text-page-title">
              Gerenciamento de Contratos
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Lista de usuários administradores da plataforma
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="default"
            className="rounded-full"
            data-testid="button-create-account"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Criar Conta
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="p-6" data-testid="card-error">
            <p className="text-center text-destructive" data-testid="text-error">
              Erro ao carregar usuários: {(error as Error).message}
            </p>
          </Card>
        )}

        {!isLoading && !error && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3" data-testid="users-grid">
            {adminUsers.length === 0 ? (
              <Card className="p-6 col-span-full" data-testid="empty-state">
                <p className="text-center text-muted-foreground">
                  Nenhum usuário administrador encontrado
                </p>
              </Card>
            ) : (
              adminUsers.map((user) => (
                <Card key={user.id} data-testid={`user-card-${user.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold" data-testid={`user-name-${user.id}`}>
                        {user.name}
                      </CardTitle>
                      <Badge variant="default" className="bg-[#40E0D0] text-white" data-testid={`user-badge-${user.id}`}>
                        Admin
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span data-testid={`user-email-${user.id}`}>{user.email}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="text-muted-foreground">Valor do plano</span>
                      <span className="font-semibold" data-testid={`user-plan-value-${user.id}`}>
                        R$ 0.000,00
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pt-2">
                      Criado em: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-user">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Criar Nova Conta Admin</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              Preencha os dados abaixo para criar uma nova conta de administrador
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateUser)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Digite o nome completo"
                        data-testid="input-name"
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
                        {...field}
                        type="email"
                        placeholder="email@exemplo.com"
                        data-testid="input-email"
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
                        {...field}
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    form.reset();
                  }}
                  className="flex-1"
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit"
                >
                  {createUserMutation.isPending ? "Criando..." : "Criar Conta"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
