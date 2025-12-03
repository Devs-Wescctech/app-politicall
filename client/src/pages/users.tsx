import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type User, DEFAULT_PERMISSIONS, type UserPermissions } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Shield, User as UserIcon, Users, Plus, Settings, Eye, EyeOff, Trash2, ChevronDown, ChevronUp, Trophy, Award, Sun, Calendar, CalendarDays, Infinity, Mail, Phone, MapPin, Heart, Filter } from "lucide-react";
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
  voluntario: { label: "Voluntário de Campanha", icon: Heart, color: "text-orange-600 dark:text-orange-400" },
};

// Roles disponíveis para criação/edição (sem admin)
const EDITABLE_ROLES = {
  coordenador: ROLE_CONFIG.coordenador,
  assessor: ROLE_CONFIG.assessor,
  voluntario: ROLE_CONFIG.voluntario,
};

// Form validation schema (admin não pode ser selecionado)
const createUserSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
  role: z.enum(["coordenador", "assessor", "voluntario"], {
    required_error: "Selecione um nível de acesso",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function UsersManagement() {
  const { toast } = useToast();
  const { user: currentUser, isAdmin } = useCurrentUser();
  const [selectedUser, setSelectedUser] = useState<Omit<User, "password"> | null>(null);
  const [userToDelete, setUserToDelete] = useState<Omit<User, "password"> | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [rankingPeriod, setRankingPeriod] = useState<string>("all");
  const [isUsersSectionOpen, setIsUsersSectionOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [viewingUser, setViewingUser] = useState<Omit<User, "password"> | null>(null);
  
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
  
  // Get admin's available permissions (modules they have access to)
  const adminPermissions = currentUser?.permissions || DEFAULT_PERMISSIONS.admin;
  
  // Filter permissions to only show modules the admin has access to
  const availablePermissionKeys = Object.entries(adminPermissions)
    .filter(([_, hasAccess]) => hasAccess)
    .map(([key]) => key as keyof UserPermissions);
  
  // Update permissions when role changes in create dialog
  // Only enable permissions that the admin has access to
  useEffect(() => {
    if (selectedRoleInForm && adminPermissions) {
      const roleDefaults = DEFAULT_PERMISSIONS[selectedRoleInForm as keyof typeof DEFAULT_PERMISSIONS];
      // Limit to only permissions the admin has
      const limitedPermissions: UserPermissions = {
        dashboard: roleDefaults.dashboard && adminPermissions.dashboard,
        contacts: roleDefaults.contacts && adminPermissions.contacts,
        alliances: roleDefaults.alliances && adminPermissions.alliances,
        demands: roleDefaults.demands && adminPermissions.demands,
        agenda: roleDefaults.agenda && adminPermissions.agenda,
        ai: roleDefaults.ai && adminPermissions.ai,
        marketing: roleDefaults.marketing && adminPermissions.marketing,
        users: roleDefaults.users && adminPermissions.users,
        petitions: roleDefaults.petitions && adminPermissions.petitions,
        settings: roleDefaults.settings && adminPermissions.settings,
      };
      setCustomPermissions(limitedPermissions);
    }
  }, [selectedRoleInForm, adminPermissions]);
  
  // Load saved permissions when opening edit dialog
  useEffect(() => {
    if (selectedUser) {
      // Load SAVED permissions from user
      setEditPermissions(selectedUser.permissions || DEFAULT_PERMISSIONS[selectedUser.role as keyof typeof DEFAULT_PERMISSIONS]);
      setNewRole(selectedUser.role);
    }
  }, [selectedUser]);
  
  // Only update permissions when ROLE changes (not when modal opens)
  // Limit to permissions the admin has access to
  useEffect(() => {
    if (newRole && selectedUser && newRole !== selectedUser.role && adminPermissions) {
      const roleDefaults = DEFAULT_PERMISSIONS[newRole as keyof typeof DEFAULT_PERMISSIONS];
      // Limit to only permissions the admin has
      const limitedPermissions: UserPermissions = {
        dashboard: roleDefaults.dashboard && adminPermissions.dashboard,
        contacts: roleDefaults.contacts && adminPermissions.contacts,
        alliances: roleDefaults.alliances && adminPermissions.alliances,
        demands: roleDefaults.demands && adminPermissions.demands,
        agenda: roleDefaults.agenda && adminPermissions.agenda,
        ai: roleDefaults.ai && adminPermissions.ai,
        marketing: roleDefaults.marketing && adminPermissions.marketing,
        users: roleDefaults.users && adminPermissions.users,
        petitions: roleDefaults.petitions && adminPermissions.petitions,
        settings: roleDefaults.settings && adminPermissions.settings,
      };
      setEditPermissions(limitedPermissions);
    }
  }, [newRole, selectedUser?.role, adminPermissions]);

  const { data: users, isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
  });

  // Filter and sort users alphabetically
  const filteredAndSortedUsers = useMemo(() => {
    if (!users) return [];
    
    let filtered = users;
    
    // Apply role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter(user => user.role === roleFilter);
    }
    
    // Sort alphabetically by name
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [users, roleFilter]);

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
      {/* Collapsible Users Section */}
      <Collapsible open={isUsersSectionOpen} onOpenChange={setIsUsersSectionOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover-elevate">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Usuários</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {users?.length || 0} usuário{(users?.length || 0) !== 1 ? 's' : ''} cadastrado{(users?.length || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon">
                  {isUsersSectionOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Filter Dropdown */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[200px]" data-testid="select-role-filter">
                    <SelectValue placeholder="Filtrar por função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                      <SelectItem key={role} value={role}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Users List */}
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : filteredAndSortedUsers.length > 0 ? (
                <div className="space-y-1">
                  {filteredAndSortedUsers.map((user) => {
                    const roleConfig = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG];
                    const RoleIcon = roleConfig.icon;
                    
                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer border border-transparent hover:border-border"
                        onClick={() => setViewingUser(user)}
                        data-testid={`user-row-${user.id}`}
                      >
                        {user.avatar ? (
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={user.avatar} alt={user.name} />
                            <AvatarFallback>
                              <UserIcon className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 text-foreground text-sm">
                          <RoleIcon className="w-3 h-3" />
                          <span>{roleConfig.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <UserIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {roleFilter !== "all" 
                      ? `Nenhum usuário com a função "${ROLE_CONFIG[roleFilter as keyof typeof ROLE_CONFIG]?.label}" encontrado`
                      : "Nenhum usuário encontrado"
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* View User Details Modal */}
      <Dialog open={!!viewingUser} onOpenChange={(open) => !open && setViewingUser(null)}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0" data-testid="dialog-view-user">
          {/* Fixed Header */}
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription>Informações completas do usuário selecionado</DialogDescription>
          </DialogHeader>
          
          {viewingUser && (
            <>
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {/* User Avatar and Name */}
                <div className="flex flex-col items-center text-center">
                  {viewingUser.avatar ? (
                    <Avatar className="h-20 w-20 mb-3">
                      <AvatarImage src={viewingUser.avatar} alt={viewingUser.name} />
                      <AvatarFallback>
                        <UserIcon className="h-10 w-10" />
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-3">
                      <UserIcon className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <h3 className="text-xl font-semibold">{viewingUser.name}</h3>
                  {(() => {
                    const roleConfig = ROLE_CONFIG[viewingUser.role as keyof typeof ROLE_CONFIG];
                    const RoleIcon = roleConfig.icon;
                    return (
                      <div className="flex items-center gap-1 mt-2 text-foreground">
                        <RoleIcon className="w-4 h-4" />
                        <span className="text-sm">{roleConfig.label}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* User Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium truncate">{viewingUser.email}</p>
                    </div>
                  </div>
                  
                  {viewingUser.phone && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Telefone</p>
                        <p className="text-sm font-medium">{viewingUser.phone}</p>
                      </div>
                    </div>
                  )}
                  
                  {(viewingUser.city || viewingUser.state) && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Localização</p>
                        <p className="text-sm font-medium">
                          {[viewingUser.city, viewingUser.state].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Cadastrado em</p>
                      <p className="text-sm font-medium">
                        {new Date(viewingUser.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric"
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Trophy className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Atividades Realizadas</p>
                      <p className="text-sm font-medium">{(viewingUser as any).activityCount || 0}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              {viewingUser.role !== 'admin' && (
                <DialogFooter className="flex-shrink-0 px-6 py-4 border-t grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setViewingUser(null);
                      handleEditRole(viewingUser);
                    }}
                    data-testid="button-edit-role-modal"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Alterar Permissão
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full text-destructive hover:text-destructive"
                    onClick={() => {
                      setViewingUser(null);
                      setUserToDelete(viewingUser);
                    }}
                    data-testid="button-delete-user-modal"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
                  <p className="text-sm">{selectedUser.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
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
                  <p className="text-xs text-muted-foreground">Apenas módulos disponíveis na sua conta</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries({
                      dashboard: 'Dashboard',
                      contacts: 'Eleitores',
                      alliances: 'Alianças',
                      demands: 'Demandas',
                      agenda: 'Agenda',
                      ai: 'Atendimento IA',
                      marketing: 'Pesquisas',
                      petitions: 'Petições',
                      users: 'Usuários'
                    })
                    .filter(([key]) => adminPermissions[key as keyof UserPermissions])
                    .map(([key, label]) => (
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
                  <p className="text-xs text-muted-foreground">Apenas módulos disponíveis na sua conta</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries({
                      dashboard: 'Dashboard',
                      contacts: 'Eleitores',
                      alliances: 'Alianças',
                      demands: 'Demandas',
                      agenda: 'Agenda',
                      ai: 'Atendimento IA',
                      marketing: 'Pesquisas',
                      petitions: 'Petições',
                      users: 'Usuários'
                    })
                    .filter(([key]) => adminPermissions[key as keyof UserPermissions])
                    .map(([key, label]) => (
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