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
import { UserPlus, ArrowLeft, Mail, Lock, User as UserIcon, MoreVertical, Phone, Pencil, Trash2, Inbox, LogIn, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { setAuthToken, setAuthUser } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { FaWhatsapp } from "react-icons/fa";
import logoUrl from "@assets/logo pol_1763308638963.png";
import type { Lead } from "@shared/schema";

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
  paymentStatus?: string;
  lastPaymentDate?: string;
  politicalPosition?: string;
  avatar?: string;
  party?: {
    id: string;
    name: string;
    abbreviation: string;
    ideology?: string;
  };
};

// Helper function to calculate payment status based on expiry date
function calculatePaymentStatus(user: User): "pago" | "atrasado" | null {
  // If no expiry date, can't calculate
  if (!user.expiryDate) {
    return null;
  }
  
  // Parse DD/MM/YYYY format
  const [day, month, year] = user.expiryDate.split('/').map(Number);
  if (!day || !month || !year) {
    return null;
  }
  
  const expiryDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to compare only dates
  
  // Check if expiry date has passed (one day after expiry)
  const oneDayAfterExpiry = new Date(expiryDate);
  oneDayAfterExpiry.setDate(oneDayAfterExpiry.getDate() + 1);
  
  if (today >= oneDayAfterExpiry) {
    return "atrasado";
  }
  
  // If within the expiry period, it's paid
  return "pago";
}

export default function ContractsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [inboxDialogOpen, setInboxDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editPlanValue, setEditPlanValue] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [deleteUserConfirmOpen, setDeleteUserConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pago" | "atrasado">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(12);
  }, [statusFilter, searchQuery]);

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

  // Fetch leads from inbox
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao carregar leads");
      }
      
      return response.json();
    },
    enabled: !isVerifying,
  });

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
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users/${data.userId}/contract`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          whatsapp: data.whatsapp,
          planValue: data.planValue,
          expiryDate: data.expiryDate,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao salvar');
      }
      
      return response.json();
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

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (userId: string) => {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users/${userId}/payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao confirmar pagamento');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Pagamento confirmado!",
        description: `O status foi atualizado para Pago.`,
      });
      setPaymentDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao confirmar pagamento",
        description: error.message || "Não foi possível confirmar o pagamento.",
        variant: "destructive",
      });
    },
  });

  const handlePaymentClick = (user: User, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    const status = calculatePaymentStatus(user);
    if (status !== "pago") {
      setSelectedUser(user);
      setPaymentDialogOpen(true);
    }
  };

  const handlePaymentConfirm = () => {
    if (selectedUser) {
      paymentMutation.mutate(selectedUser.id);
    }
  };

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao excluir conta');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Conta excluída!",
        description: "A conta foi removida permanentemente do sistema.",
      });
      setDeleteUserConfirmOpen(false);
      setDetailsDialogOpen(false);
      setUserToDelete(null);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir conta",
        description: error.message || "Não foi possível excluir a conta.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteUserConfirm = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  const handleImpersonate = async (userId: string) => {
    try {
      const adminToken = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao entrar na conta");
      }
      
      const result = await response.json();
      
      setAuthToken(result.token);
      setAuthUser(result.user);
      
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "Erro ao entrar na conta",
        description: error.message || "Não foi possível acessar a conta.",
        variant: "destructive",
      });
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
              onClick={() => setInboxDialogOpen(true)}
              variant="outline"
              className="rounded-full w-48"
              data-testid="button-inbox"
            >
              <Inbox className="w-4 h-4 mr-2" />
              Caixa de Entrada
            </Button>
            <Button 
              onClick={() => setLocation("/admin")}
              variant="outline"
              className="rounded-full w-48"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button 
              onClick={handleLogout} 
              variant="outline"
              className="rounded-full w-48"
              data-testid="button-logout"
            >
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2" data-testid="text-page-title">
                Gerenciamento de Contratos
                <Badge variant="secondary" className="text-sm font-normal" data-testid="text-total-contracts">
                  {adminUsers.length} {adminUsers.length === 1 ? 'contrato' : 'contratos'}
                </Badge>
              </h2>
              <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
                Lista de usuários administradores da plataforma
              </p>
            </div>
            <Button
              onClick={() => setLocation("/register")}
              variant="default"
              className="rounded-full"
              data-testid="button-create-account"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Criar Conta
            </Button>
          </div>
          
          {/* Search and Status Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground mr-2">Status:</span>
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                data-testid="filter-all"
              >
                Todos
              </Button>
              <Button
                variant={statusFilter === "pago" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("pago")}
                className={statusFilter === "pago" ? "bg-green-500 hover:bg-green-600" : ""}
                data-testid="filter-paid"
              >
                Pagos
              </Button>
              <Button
                variant={statusFilter === "atrasado" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("atrasado")}
                className={statusFilter === "atrasado" ? "bg-red-500 hover:bg-red-600" : ""}
                data-testid="filter-overdue"
              >
                Atrasados
              </Button>
            </div>
          </div>
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
              (() => {
                const filteredUsers = adminUsers.filter((user) => {
                  // Filter by search query
                  if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase().trim();
                    if (!user.name.toLowerCase().includes(query)) {
                      return false;
                    }
                  }
                  
                  // Filter by status
                  if (statusFilter === "all") return true;
                  const status = calculatePaymentStatus(user);
                  return status === statusFilter;
                });
                
                if (filteredUsers.length === 0) {
                  return (
                    <Card className="p-6 col-span-full" data-testid="empty-filter-state">
                      <p className="text-center text-muted-foreground">
                        {searchQuery.trim() 
                          ? `Nenhum usuário encontrado para "${searchQuery}"`
                          : `Nenhum usuário ${statusFilter === "pago" ? "pago" : "atrasado"} encontrado`
                        }
                      </p>
                    </Card>
                  );
                }
                
                const visibleUsers = filteredUsers.slice(0, visibleCount);
                const remainingCount = filteredUsers.length - visibleCount;
                
                return (
                  <>
                    {visibleUsers.map((user) => {
                const status = calculatePaymentStatus(user);
                const isPaid = status === "pago";
                const isOverdue = status === "atrasado";
                
                return (
                  <Card 
                    key={user.id} 
                    data-testid={`user-card-${user.id}`}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleCardClick(user)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar || ''} alt={user.name} />
                            <AvatarFallback className="text-sm bg-primary/10 text-primary">
                              {user.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <CardTitle className="text-base font-semibold" data-testid={`user-name-${user.id}`}>
                            {user.name}
                          </CardTitle>
                        </div>
                        {status && (
                          <Badge 
                            variant="default" 
                            className={isPaid ? "bg-green-500 text-white" : "bg-red-500 text-white"} 
                            data-testid={`user-badge-${user.id}`}
                          >
                            {isPaid ? "Pago" : "Atrasado"}
                          </Badge>
                        )}
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
                        disabled={!isOverdue}
                        variant={isOverdue ? "default" : "outline"}
                        size="sm"
                        className={isOverdue ? "bg-green-500 hover:bg-green-600 text-white" : "border-green-500 text-green-500"}
                        data-testid={`button-pay-${user.id}`}
                      >
                        Pagar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
                })}
                    
                    {remainingCount > 0 && (
                      <div className="col-span-full flex justify-center pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleCount(prev => prev + 12)}
                          data-testid="button-show-more"
                        >
                          Mostrar mais ({remainingCount} restantes)
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </div>
        )}
      </main>

      {/* User Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-user-details">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={selectedUser?.avatar || ''} alt={selectedUser?.name} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {selectedUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle data-testid="text-dialog-details-title">
                  {selectedUser?.name}
                </DialogTitle>
                <DialogDescription data-testid="text-dialog-details-description">
                  {selectedUser?.party?.abbreviation || 'Sem partido'} | {selectedUser?.party?.ideology || 'Não informado'} | {selectedUser?.politicalPosition || selectedUser?.role}
                </DialogDescription>
              </div>
            </div>
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
                  variant="default"
                  onClick={() => selectedUser && handleImpersonate(selectedUser.id)}
                  className="flex-1"
                  data-testid="button-impersonate-user"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Entrar
                </Button>
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
                    setUserToDelete(selectedUser);
                    setDeleteUserConfirmOpen(true);
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
              Ao confirmar, o status do usuário será atualizado para "Pago" e o vencimento será atualizado para o próximo mês.
            </p>
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Valor do plano: R$ {selectedUser?.planValue || '0,00'}
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

      {/* Inbox Dialog - Leads from Landing Page */}
      <Dialog open={inboxDialogOpen} onOpenChange={setInboxDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] [&>button]:hidden" data-testid="dialog-inbox">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-inbox-title">
              Caixa de Entrada
            </DialogTitle>
            <DialogDescription data-testid="text-dialog-inbox-description">
              Cadastros realizados através do formulário da landing page
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto max-h-[60vh]">
            {leadsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {leadsError && (
              <div className="text-center py-12">
                <p className="text-destructive font-medium mb-2">
                  Erro ao carregar cadastros
                </p>
                <p className="text-sm text-muted-foreground">
                  {(leadsError as Error).message}
                </p>
              </div>
            )}

            {!leadsLoading && !leadsError && leads.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum cadastro encontrado
                </p>
              </div>
            )}

            {!leadsLoading && leads.length > 0 && (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <Card key={lead.id} className="hover-elevate" data-testid={`lead-card-${lead.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-base font-semibold mb-1" data-testid={`lead-name-${lead.id}`}>
                            {lead.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {lead.position} • {lead.city}/{lead.state}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        {lead.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`mailto:${lead.email}`}
                              className="text-primary hover:underline"
                              data-testid={`lead-email-${lead.id}`}
                            >
                              {lead.email}
                            </a>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              data-testid={`lead-phone-${lead.id}`}
                            >
                              {lead.phone}
                            </a>
                          </div>
                        )}
                      </div>
                      {lead.message && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1 font-medium">Mensagem:</p>
                          <p className="text-sm" data-testid={`lead-message-${lead.id}`}>
                            {lead.message}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInboxDialogOpen(false)}
              data-testid="button-close-inbox"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={deleteUserConfirmOpen} onOpenChange={setDeleteUserConfirmOpen}>
        <DialogContent data-testid="dialog-delete-user-confirm">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-delete-user-title">Confirmar Exclusão Permanente</DialogTitle>
            <DialogDescription data-testid="text-dialog-delete-user-description">
              {userToDelete && (
                <>
                  Você está prestes a excluir permanentemente a conta de: <strong>{userToDelete.name}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/30">
              <p className="text-sm font-semibold text-destructive mb-2">
                ⚠️ Esta ação é irreversível!
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Todos os dados do usuário serão excluídos permanentemente</li>
                <li>O acesso ao sistema será revogado imediatamente</li>
                <li>Esta ação não pode ser desfeita</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja continuar?
            </p>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteUserConfirmOpen(false);
                setUserToDelete(null);
              }}
              className="flex-1"
              data-testid="button-cancel-delete-user"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUserConfirm}
              disabled={deleteUserMutation.isPending}
              className="flex-1"
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Sim, Excluir Permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
