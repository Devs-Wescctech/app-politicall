import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type User, DEFAULT_PERMISSIONS, type UserPermissions } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Shield, User as UserIcon, Users, Plus, Settings, Eye, EyeOff, Trash2, ChevronDown, ChevronUp, Trophy, Award, Sun, Calendar, CalendarDays, Infinity } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const ROLE_CONFIG = {
  admin: { label: "Adm", icon: Shield, color: "text-red-600 dark:text-red-400" },
  coordenador: { label: "Coordenador", icon: Users, color: "text-blue-600 dark:text-blue-400" },
  assessor: { label: "Assessor", icon: UserIcon, color: "text-green-600 dark:text-green-400" },
};

// Roles disponíveis para criação/edição (sem admin)
const EDITABLE_ROLES = {
  coordenador: ROLE_CONFIG.coordenador,
  assessor: ROLE_CONFIG.assessor,
};

// Form validation schema (admin não pode ser selecionado)
const createUserSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
  role: z.enum(["coordenador", "assessor"], {
    required_error: "Selecione um nível de acesso",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function UsersManagement() {
  const { toast } = useToast();
  const { isAdmin } = useCurrentUser();
  const [selectedUser, setSelectedUser] = useState<Omit<User, "password"> | null>(null);
  const [userToDelete, setUserToDelete] = useState<Omit<User, "password"> | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [rankingPeriod, setRankingPeriod] = useState<string>("all");
  
  // Edit dialog password states
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  
  // Permissions state for create dialog
  const [customPermissions, setCustomPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.assessor);
  
  // Permissions state for edit dialog
  const [editPermissions, setEditPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.assessor);

  const toggleCard = (userId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "assessor",
    },
  });
  
  // Watch role changes in create form
  const selectedRoleInForm = form.watch("role");
  
  // Update permissions when role changes in create dialog
  useEffect(() => {
    if (selectedRoleInForm) {
      setCustomPermissions(DEFAULT_PERMISSIONS[selectedRoleInForm as keyof typeof DEFAULT_PERMISSIONS]);
    }
  }, [selectedRoleInForm]);
  
  // Load saved permissions when opening edit dialog
  useEffect(() => {
    if (selectedUser) {
      // Load SAVED permissions from user
      setEditPermissions(selectedUser.permissions || DEFAULT_PERMISSIONS[selectedUser.role as keyof typeof DEFAULT_PERMISSIONS]);
      setNewRole(selectedUser.role);
    }
  }, [selectedUser]);
  
  // Only update permissions when ROLE changes (not when modal opens)
  useEffect(() => {
    if (newRole && selectedUser && newRole !== selectedUser.role) {
      // User changed role, so reset to defaults of new role
      setEditPermissions(DEFAULT_PERMISSIONS[newRole as keyof typeof DEFAULT_PERMISSIONS]);
    }
  }, [newRole, selectedUser?.role]);

  const { data: users, isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
  });

  // Query for activity ranking with period filter
  const { data: ranking, isLoading: isRankingLoading } = useQuery<Array<{
    id: string;
    name: string;
    role: string;
    activityCount: number;
  }>>({
    queryKey: ["/api/users/activity-ranking", rankingPeriod],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/users/activity-ranking?period=${rankingPeriod}`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Erro ao carregar ranking" }));
        throw new Error(error.error || "Erro ao carregar ranking");
      }
      return response.json();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, permissions, password }: { userId: string; role: string; permissions: UserPermissions; password?: string }) => {
      const updateData: any = { role, permissions };
      if (password) {
        updateData.password = password;
      }
      return await apiRequest("PATCH", `/api/users/${userId}`, updateData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      // If the current user's role was changed, update localStorage and force refresh
      const currentUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
      if (currentUser.id === data.id) {
        localStorage.setItem("auth_user", JSON.stringify(data));
        toast({
          title: "Sua permissão foi alterada",
          description: "Recarregando a página para aplicar as mudanças...",
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSelectedUser(null);
        setNewRole("");
        setNewPassword("");
        setConfirmNewPassword("");
        toast({
          title: "Permissão atualizada",
          description: "O nível de acesso do usuário foi atualizado com sucesso.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao atualizar permissão",
      });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm & { permissions: UserPermissions }) => {
      const { confirmPassword, ...userData } = data;
      return await apiRequest("POST", "/api/users/create", userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowAddUserDialog(false);
      form.reset();
      setShowPassword(false);
      setShowConfirmPassword(false);
      toast({
        title: "Usuário criado",
        description: "O novo usuário foi criado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar usuário",
        description: error.message || "Não foi possível criar o usuário",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUserToDelete(null);
      toast({
        title: "Usuário excluído",
        description: "O usuário foi removido do sistema com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao excluir usuário",
        description: error.message || "Não foi possível excluir o usuário",
      });
    },
  });

  const handleEditRole = (user: Omit<User, "password">) => {
    setSelectedUser(user);
    setNewRole(user.role);
    // Set current permissions or default for role
    setEditPermissions(user.permissions || DEFAULT_PERMISSIONS[user.role as keyof typeof DEFAULT_PERMISSIONS]);
  };

  const handleSaveRole = () => {
    if (selectedUser && newRole) {
      // Validate at least one permission is checked
      const hasAtLeastOnePermission = Object.values(editPermissions).some(val => val === true);
      if (!hasAtLeastOnePermission) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Pelo menos uma permissão deve estar marcada",
        });
        return;
      }
      
      // Validate password if provided
      if (newPassword || confirmNewPassword) {
        if (newPassword.length < 6) {
          toast({
            variant: "destructive",
            title: "Erro",
            description: "A nova senha deve ter pelo menos 6 caracteres",
          });
          return;
        }
        if (newPassword !== confirmNewPassword) {
          toast({
            variant: "destructive",
            title: "Erro",
            description: "As senhas não coincidem",
          });
          return;
        }
      }
      
      updateRoleMutation.mutate({ 
        userId: selectedUser.id, 
        role: newRole, 
        permissions: editPermissions,
        password: newPassword || undefined
      });
    }
  };

  const onSubmitCreateUser = (data: CreateUserForm) => {
    // Validate at least one permission is checked
    const hasAtLeastOnePermission = Object.values(customPermissions).some(val => val === true);
    if (!hasAtLeastOnePermission) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Pelo menos uma permissão deve estar marcada",
      });
      return;
    }
    createUserMutation.mutate({ ...data, permissions: customPermissions });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
          <p className="text-muted-foreground mt-2">Gerencie permissões e acessos dos usuários</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowAddUserDialog(true)}
            className="rounded-full"
            data-testid="button-add-user"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Usuário
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
        ) : users && users.length > 0 ? (
          users.map((user) => {
            const roleConfig = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG];
            const RoleIcon = roleConfig.icon;

            const isExpanded = expandedCards.has(user.id);
            
            return (
              <Card key={user.id} className="hover-elevate" data-testid={`card-user-${user.id}`}>
                <div
                  className="cursor-pointer"
                  onClick={() => toggleCard(user.id)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {user.role === 'admin' && user.avatar ? (
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={user.avatar} alt={user.name} />
                            <AvatarFallback>
                              <UserIcon className="h-5 w-5 text-primary" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <UserIcon className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className={`min-w-0 flex-1 flex items-center gap-1 text-sm font-medium ${roleConfig.color}`}>
                          <RoleIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">{roleConfig.label}</span>
                          <span className="sm:hidden">{roleConfig.label.substring(0, 3)}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCard(user.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                </div>
                
                {isExpanded && (
                  <CardContent className="p-6 pt-0 space-y-3">
                    <p className="text-base font-medium truncate pb-3 border-b" title={user.name}>
                      {user.name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate pb-3 border-b" title={user.email}>
                      {user.email}
                    </p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        <span className="hidden sm:inline">Cadastrado em </span>
                        {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="font-medium">
                        Atividades: {(user as any).activityCount || 0}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      {user.role !== 'admin' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditRole(user);
                            }}
                            data-testid={`button-edit-role-${user.id}`}
                            className="rounded-full flex-1"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Alterar Permissão
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToDelete(user);
                            }}
                            data-testid={`button-delete-user-${user.id}`}
                            className="rounded-full text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full p-12 text-center">
            <UserIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </Card>
        )}
      </div>

      {/* Activity Ranking Section */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              <CardTitle>Ranking de Atividades</CardTitle>
            </div>
            <Tabs value={rankingPeriod} onValueChange={setRankingPeriod}>
              <TabsList className="rounded-full">
                <TabsTrigger value="today" data-testid="filter-today" className="rounded-full text-xs">
                  <Sun className="w-3 h-3 mr-1" />
                  Hoje
                </TabsTrigger>
                <TabsTrigger value="week" data-testid="filter-week" className="rounded-full text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  Semana
                </TabsTrigger>
                <TabsTrigger value="month" data-testid="filter-month" className="rounded-full text-xs">
                  <CalendarDays className="w-3 h-3 mr-1" />
                  Mês
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="filter-all" className="rounded-full text-xs">
                  <Infinity className="w-3 h-3 mr-1" />
                  Todo Período
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isRankingLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : ranking && ranking.length > 0 ? (
            <div className="space-y-3">
              {ranking.map((user, index) => {
                const roleConfig = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG];
                const isTopUser = index === 0;
                const maxActivity = ranking[0]?.activityCount || 1;
                const percentage = (user.activityCount / maxActivity) * 100;
                
                return (
                  <div
                    key={user.id}
                    className="p-4 rounded-md border border-border"
                    data-testid={`ranking-user-${user.id}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-semibold text-lg shrink-0">{index + 1}°</span>
                        <span className="font-medium truncate">{user.name}</span>
                        <span className="text-sm text-muted-foreground shrink-0">
                          ({roleConfig.label})
                        </span>
                      </div>
                      <span className="font-bold text-lg shrink-0">
                        {user.activityCount}
                      </span>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`absolute top-0 left-0 h-full ${
                          isTopUser ? "bg-primary" : "bg-primary/60"
                        } transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma atividade registrada no período selecionado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => {
        if (!open) {
          setSelectedUser(null);
          setNewPassword("");
          setConfirmNewPassword("");
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0" data-testid="dialog-edit-role">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Alterar Nível de Acesso</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <>
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Usuário</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.name} ({selectedUser.email})</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Novo Nível de Acesso</p>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EDITABLE_ROLES).map(([role, config]) => {
                        const Icon = config.icon;
                        return (
                          <SelectItem key={role} value={role}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4" />
                              {config.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm font-medium">Permissões de Acesso aos Menus</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries({
                      dashboard: 'Dashboard',
                      contacts: 'Eleitores',
                      alliances: 'Alianças',
                      demands: 'Demandas',
                      agenda: 'Agenda',
                      ai: 'Atendimento IA',
                      marketing: 'Marketing',
                      users: 'Usuários'
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-perm-${key}`}
                          checked={editPermissions[key as keyof UserPermissions]}
                          onCheckedChange={(checked) => {
                            setEditPermissions(prev => ({
                              ...prev,
                              [key]: checked === true
                            }));
                          }}
                          data-testid={`checkbox-edit-permission-${key}`}
                        />
                        <label
                          htmlFor={`edit-perm-${key}`}
                          className="text-sm cursor-pointer"
                        >
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm font-medium">Alterar Senha (Opcional)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Nova Senha</label>
                      <Input
                        type="password"
                        placeholder="Deixe em branco para manter a senha atual"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="input-edit-password"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Confirmar Nova Senha</label>
                      <Input
                        type="password"
                        placeholder="Confirme a nova senha"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        data-testid="input-edit-confirm-password"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="px-6 py-4 border-t grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedUser(null)} 
                  data-testid="button-cancel"
                  className="rounded-full w-full"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveRole}
                  disabled={!newRole || updateRoleMutation.isPending}
                  data-testid="button-save-role"
                  className="rounded-full w-full"
                >
                  {updateRoleMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0" data-testid="dialog-add-user">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Adicionar Novo Usuário</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitCreateUser)} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" {...field} data-testid="input-name" />
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
                        <Input type="email" placeholder="email@exemplo.com" {...field} data-testid="input-email" />
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
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Mínimo 6 caracteres"
                            {...field}
                            data-testid="input-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Digite a senha novamente"
                            {...field}
                            data-testid="input-confirm-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            data-testid="button-toggle-confirm-password"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nível de Acesso</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-new-user-role">
                            <SelectValue placeholder="Selecione o nível de acesso" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(EDITABLE_ROLES).map(([role, config]) => {
                            const Icon = config.icon;
                            return (
                              <SelectItem key={role} value={role}>
                                <div className="flex items-center gap-2">
                                  <Icon className="w-4 h-4" />
                                  {config.label}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-3">
                  <p className="text-sm font-medium">Permissões de Acesso aos Menus</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries({
                      dashboard: 'Dashboard',
                      contacts: 'Eleitores',
                      alliances: 'Alianças',
                      demands: 'Demandas',
                      agenda: 'Agenda',
                      ai: 'Atendimento IA',
                      marketing: 'Marketing',
                      users: 'Usuários'
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`perm-${key}`}
                          checked={customPermissions[key as keyof UserPermissions]}
                          onCheckedChange={(checked) => {
                            setCustomPermissions(prev => ({
                              ...prev,
                              [key]: checked === true
                            }));
                          }}
                          data-testid={`checkbox-permission-${key}`}
                        />
                        <label
                          htmlFor={`perm-${key}`}
                          className="text-sm cursor-pointer"
                        >
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <DialogFooter className="px-6 py-4 border-t grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddUserDialog(false);
                    form.reset();
                    setShowPassword(false);
                    setShowConfirmPassword(false);
                  }}
                  data-testid="button-cancel-add-user"
                  className="rounded-full w-full"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  data-testid="button-submit-add-user"
                  className="rounded-full w-full"
                >
                  {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Delete User Confirmation Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-delete-user">
          <DialogHeader className="pb-4">
            <DialogTitle>Excluir Usuário</DialogTitle>
          </DialogHeader>
          {userToDelete && (
            <>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  Tem certeza que deseja excluir o usuário <strong>{userToDelete.name}</strong> ({userToDelete.email})?
                </p>
                <p className="text-sm text-destructive mt-4">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <DialogFooter className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setUserToDelete(null)}
                  data-testid="button-cancel-delete"
                  className="rounded-full w-full"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteUserMutation.mutate(userToDelete.id)}
                  disabled={deleteUserMutation.isPending}
                  data-testid="button-confirm-delete"
                  className="rounded-full w-full"
                >
                  {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}