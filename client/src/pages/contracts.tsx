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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { UserPlus, ArrowLeft, Mail, Lock, User as UserIcon, MoreVertical, Phone, Pencil, Trash2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
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
  whatsapp?: string;
  planValue?: string;
  expiryDate?: string;
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
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userStatuses, setUserStatuses] = useState<Record<string, "pago" | "atrasado">>({});
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editPlanValue, setEditPlanValue] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");

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

  const formatCurrency = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    if (!numbers) return '';
    
    // Converte para centavos
    const amount = parseInt(numbers, 10);
    
    // Formata como moeda brasileira
    const formatted = (amount / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return formatted;
  };

  const handlePlanValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrency(e.target.value);
    setEditPlanValue(formatted);
  };

  const formatDate = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    if (!numbers) return '';
    
    // Aplica a máscara DD/MM/AAAA
    let formatted = numbers;
    
    if (numbers.length > 2) {
      formatted = numbers.slice(0, 2) + '/' + numbers.slice(2);
    }
    if (numbers.length > 4) {
      formatted = numbers.slice(0, 2) + '/' + numbers.slice(2, 4) + '/' + numbers.slice(4, 8);
    }
    
    return formatted;
  };

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDate(e.target.value);
    setEditExpiryDate(formatted);
  };

  const handleCardClick = (user: User) => {
    setSelectedUser(user);
    setDetailsDialogOpen(true);
    setIsEditingUser(false);
    // Initialize edit values from user data
    setEditPlanValue(user.planValue || "");
    setEditExpiryDate(user.expiryDate || "");
    setEditWhatsapp(user.whatsapp || "");
  };

  const handleEditUser = () => {
    setIsEditingUser(true);
  };

  const handleCancelEdit = () => {
    setIsEditingUser(false);
    // Reset to original values from selected user
    if (selectedUser) {
      setEditPlanValue(selectedUser.planValue || "");
      setEditExpiryDate(selectedUser.expiryDate || "");
      setEditWhatsapp(selectedUser.whatsapp || "");
    }
  };

  const updateContractMutation = useMutation({
    mutationFn: async (data: { userId: string; whatsapp: string; planValue: string; expiryDate: string }) => {
      return apiRequest(`/api/admin/users/${data.userId}/contract`, {
        method: 'PATCH',
        body: JSON.stringify({
          whatsapp: data.whatsapp,
          planValue: data.planValue,
          expiryDate: data.expiryDate,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditingUser(false);
      toast({
        title: "Alterações salvas!",
        description: "Os dados do usuário foram atualizados.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    },
  });

  const handleSaveEdit = () => {
    if (!selectedUser) return;
    
    updateContractMutation.mutate({
      userId: selectedUser.id,
      whatsapp: editWhatsapp,
      planValue: editPlanValue,
      expiryDate: editExpiryDate,
    });
  };

  const handlePaymentClick = (user: User, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    const status = userStatuses[user.id] || "pago";
    if (status === "atrasado") {
      setSelectedUser(user);
      setPaymentDialogOpen(true);
    }
  };

  const handlePaymentConfirm = () => {
    if (selectedUser) {
      setUserStatuses(prev => ({
        ...prev,
        [selectedUser.id]: "pago"
      }));
      toast({
        title: "Pagamento confirmado!",
        description: `O status de ${selectedUser.name} foi atualizado para Pago.`,
      });
      setPaymentDialogOpen(false);
      setSelectedUser(null);
    }
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
              adminUsers.map((user) => {
                const status = userStatuses[user.id] || "pago";
                const isPaid = status === "pago";
                
                return (
                  <Card 
                    key={user.id} 
                    data-testid={`user-card-${user.id}`}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleCardClick(user)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold" data-testid={`user-name-${user.id}`}>
                          {user.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="default" 
                            className={isPaid ? "bg-green-500 text-white" : "bg-red-500 text-white"} 
                            data-testid={`user-badge-${user.id}`}
                          >
                            {isPaid ? "Pago" : "Atrasado"}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8" 
                                data-testid={`button-menu-${user.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setUserStatuses(prev => ({
                                  ...prev,
                                  [user.id]: "atrasado"
                                }))}
                                data-testid={`menu-set-delayed-${user.id}`}
                              >
                                Marcar como Atrasado
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setUserStatuses(prev => ({
                                  ...prev,
                                  [user.id]: "pago"
                                }))}
                                data-testid={`menu-set-paid-${user.id}`}
                              >
                                Marcar como Pago
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Valor do plano</span>
                      <span className="font-semibold" data-testid={`user-plan-value-${user.id}`}>
                        {user.planValue ? `R$ ${user.planValue}` : 'Não informado'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Vencimento</span>
                      <span className="font-semibold" data-testid={`user-expiry-${user.id}`}>
                        {user.expiryDate || 'Não informado'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-3 gap-2">
                      <div className="text-xs text-muted-foreground">
                        Criado em: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                      <Button
                        onClick={(e) => handlePaymentClick(user, e)}
                        disabled={isPaid}
                        variant={isPaid ? "outline" : "default"}
                        size="sm"
                        className={isPaid ? "border-green-500 text-green-500" : "bg-green-500 hover:bg-green-600 text-white"}
                        data-testid={`button-pay-${user.id}`}
                      >
                        Pagar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* User Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-user-details">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-details-title">
              {selectedUser?.name}
            </DialogTitle>
            <DialogDescription data-testid="text-dialog-details-description">
              Informações e contato do usuário
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Contact Icons */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => window.open(`https://wa.me/${editWhatsapp}`, '_blank')}
                data-testid="button-whatsapp"
              >
                <FaWhatsapp className="h-6 w-6 text-green-500" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => window.open(`mailto:${selectedUser?.email}`, '_blank')}
                data-testid="button-email"
              >
                <Mail className="h-6 w-6 text-blue-500" />
              </Button>
            </div>

            {/* WhatsApp field (only visible when editing) */}
            {isEditingUser && (
              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp</label>
                <Input
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="5511999999999"
                  data-testid="input-edit-whatsapp"
                />
              </div>
            )}

            {/* Plan Details */}
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor do plano</label>
                {isEditingUser ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      value={editPlanValue}
                      onChange={handlePlanValueChange}
                      placeholder="0,00"
                      className="pl-10"
                      data-testid="input-edit-plan-value"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-semibold">
                      {editPlanValue ? `R$ ${editPlanValue}` : 'Não informado'}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Vencimento</label>
                {isEditingUser ? (
                  <Input
                    value={editExpiryDate}
                    onChange={handleExpiryDateChange}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    data-testid="input-edit-expiry-date"
                  />
                ) : (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-semibold">
                      {editExpiryDate || 'Não informado'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            {isEditingUser ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="flex-1"
                  data-testid="button-cancel-edit"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateContractMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-edit"
                >
                  {updateContractMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleEditUser}
                  className="flex-1"
                  data-testid="button-edit-user"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDetailsDialogOpen(false);
                    // TODO: Implement delete functionality
                    toast({
                      title: "Em desenvolvimento",
                      description: "Funcionalidade de exclusão em breve.",
                    });
                  }}
                  className="flex-1"
                  data-testid="button-delete-user"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Confirmation Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent data-testid="dialog-payment">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-payment-title">Confirmar Pagamento</DialogTitle>
            <DialogDescription data-testid="text-dialog-payment-description">
              {selectedUser && (
                <>
                  Você está confirmando o pagamento para: <strong>{selectedUser.name}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ao confirmar, o status do usuário será atualizado para "Pago".
            </p>
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Valor do plano: R$ 0.000,00
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPaymentDialogOpen(false);
                setSelectedUser(null);
              }}
              className="flex-1"
              data-testid="button-cancel-payment"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePaymentConfirm}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              data-testid="button-confirm-payment"
            >
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
