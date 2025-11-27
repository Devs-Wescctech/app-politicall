import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription as DialogDesc } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { User, Edit, Camera, Key, Copy, Trash2, Calendar, Clock, CheckCircle2, XCircle, Plus, Code2, AlertCircle, Terminal, Globe, ChevronDown, ExternalLink, RefreshCw, Settings2, Link, Lock } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getAuthUser } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PoliticalParty, ApiKey } from "@shared/schema";
import { POLITICAL_POSITIONS } from "@shared/schema";
import { BRAZILIAN_STATES, getCitiesByState } from "@shared/brazilian-locations";
import { useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Check if admin master is impersonating
const isImpersonating = localStorage.getItem("isImpersonating") === "true";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  phone: z.string().optional(),
  partyId: z.string().optional(),
  politicalPosition: z.string().optional(),
  electionNumber: z.string().optional(),
  lastElectionVotes: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  // Skip current password check if admin master is impersonating
  if (isImpersonating) return true;
  if (data.newPassword && !data.currentPassword) {
    return false;
  }
  return true;
}, {
  message: "Senha atual é obrigatória para alterar a senha",
  path: ["currentPassword"],
}).refine((data) => {
  if (data.newPassword && data.newPassword.length < 6) {
    return false;
  }
  return true;
}, {
  message: "Nova senha deve ter no mínimo 6 caracteres",
  path: ["newPassword"],
}).refine((data) => {
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

const apiKeySchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
});

const googleCalendarSchema = z.object({
  clientId: z.string().min(1, "Client ID é obrigatório"),
  clientSecret: z.string().min(1, "Client Secret é obrigatório"),
  redirectUri: z.string().min(1, "Redirect URI é obrigatório"),
  syncDirection: z.enum(["to_google", "from_google", "both"]).default("both"),
  autoCreateMeet: z.boolean().default(false),
  syncReminders: z.boolean().default(true),
});

type ProfileForm = z.infer<typeof profileSchema>;
type ApiKeyForm = z.infer<typeof apiKeySchema>;
type GoogleCalendarForm = z.infer<typeof googleCalendarSchema>;

export default function Settings() {
  const user = getAuthUser();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showNewKeyAlert, setShowNewKeyAlert] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string>("");
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [isDocumentationOpen, setIsDocumentationOpen] = useState(false);
  const [showGoogleAuthDialog, setShowGoogleAuthDialog] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['profile', 'api', 'google-calendar'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  const { data: parties } = useQuery<PoliticalParty[]>({
    queryKey: ["/api/parties"],
  });

  const { data: currentUser } = useQuery<{
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    partyId?: string;
    politicalPosition?: string;
    electionNumber?: string;
    lastElectionVotes?: number;
    state?: string;
    city?: string;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: apiKeys, isLoading: loadingKeys } = useQuery<ApiKey[]>({
    queryKey: ["/api/keys"],
    enabled: activeTab === "api",
  });

  const { data: googleCalendarConfig, isLoading: loadingGoogleCalendar } = useQuery<{
    id?: string;
    accountId?: string;
    clientId?: string;
    redirectUri?: string;
    email?: string;
    calendarId?: string;
    syncEnabled?: boolean;
    lastSyncAt?: string;
    syncDirection?: string;
    autoCreateMeet?: boolean;
    syncReminders?: boolean;
    isConfigured?: boolean;
    isAuthorized?: boolean;
    createdAt?: string;
    updatedAt?: string;
  } | null>({
    queryKey: ["/api/google-calendar"],
    enabled: activeTab === "google-calendar",
  });

  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedState, setSelectedState] = useState(currentUser?.state || "");
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      electionNumber: currentUser?.electionNumber || "",
      lastElectionVotes: currentUser?.lastElectionVotes?.toString() || "",
      state: currentUser?.state || "",
      city: currentUser?.city || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const apiKeyForm = useForm<ApiKeyForm>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const googleCalendarForm = useForm<GoogleCalendarForm>({
    resolver: zodResolver(googleCalendarSchema),
    defaultValues: {
      clientId: googleCalendarConfig?.clientId || "",
      clientSecret: "",
      redirectUri: "https://www.politicall.com.br/api/google-calendar/callback",
      syncDirection: (googleCalendarConfig?.syncDirection as "to_google" | "from_google" | "both") || "both",
      autoCreateMeet: googleCalendarConfig?.autoCreateMeet || false,
      syncReminders: googleCalendarConfig?.syncReminders !== false,
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const cleanedVotes = data.lastElectionVotes?.replace(/\D/g, '') || '';
      const votesNumber = cleanedVotes ? parseInt(cleanedVotes, 10) : undefined;
      
      const payload: any = {
        name: data.name,
        phone: data.phone || undefined,
        partyId: data.partyId || undefined,
        politicalPosition: data.politicalPosition || undefined,
        electionNumber: data.electionNumber || undefined,
        lastElectionVotes: votesNumber,
        state: data.state || undefined,
        city: data.city || undefined,
      };

      // Check if admin master is impersonating
      const isImpersonatingNow = localStorage.getItem("isImpersonating") === "true";
      const adminToken = localStorage.getItem("admin_token");
      
      if (data.newPassword) {
        if (isImpersonatingNow && adminToken) {
          // Admin master can change password without current password
          payload.newPassword = data.newPassword;
          payload.skipPasswordCheck = true;
        } else if (data.currentPassword) {
          // Normal user needs current password
          payload.currentPassword = data.currentPassword;
          payload.newPassword = data.newPassword;
        }
      }

      // If impersonating, use custom fetch with admin token header
      if (isImpersonatingNow && adminToken && payload.skipPasswordCheck) {
        const token = localStorage.getItem("auth_token");
        const response = await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "X-Admin-Token": adminToken,
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erro ao atualizar perfil");
        }
        
        return await response.json();
      }

      return await apiRequest("PATCH", "/api/auth/profile", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Sucesso",
        description: "Perfil atualizado com sucesso",
      });
      setShowEditDialog(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao atualizar perfil",
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (avatar: string) => {
      return await apiRequest("PATCH", "/api/auth/profile", { avatar });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Sucesso",
        description: "Foto de perfil atualizada",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao enviar foto",
      });
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: ApiKeyForm) => {
      return await apiRequest("POST", "/api/keys", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setNewApiKey(data.key);
      setShowNewKeyAlert(true);
      setShowApiKeyDialog(false);
      apiKeyForm.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao criar chave de API",
      });
    },
  });

  const saveGoogleCalendarMutation = useMutation({
    mutationFn: async (data: GoogleCalendarForm) => {
      return await apiRequest("POST", "/api/google-calendar", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-calendar"] });
      toast({
        title: "Sucesso",
        description: "Credenciais do Google Calendar salvas com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao salvar credenciais",
      });
    },
  });

  const authorizeGoogleCalendarMutation = useMutation<{ authUrl: string }, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/google-calendar/auth", {});
      return await response.json();
    },
    onSuccess: (data) => {
      setIsAuthorizing(true);
      // Open Google OAuth in a new window
      const authWindow = window.open(data.authUrl, "_blank", "width=600,height=600");
      
      // Check if the window closed or the user came back
      const checkInterval = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkInterval);
          setIsAuthorizing(false);
          queryClient.invalidateQueries({ queryKey: ["/api/google-calendar"] });
        }
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao iniciar autorização",
      });
    },
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/google-calendar", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-calendar"] });
      toast({
        title: "Sucesso",
        description: "Integração com Google Calendar removida",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao desconectar",
      });
    },
  });

  const syncGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/google-calendar/sync", {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-calendar"] });
      toast({
        title: "Sucesso",
        description: data.message || "Sincronização concluída",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao sincronizar",
      });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({
        title: "Sucesso",
        description: "Chave de API revogada com sucesso",
      });
      setDeleteKeyId(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao revogar chave de API",
      });
    },
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, selecione uma imagem",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "A imagem deve ter no máximo 2MB",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      uploadAvatarMutation.mutate(base64);
    };
    reader.readAsDataURL(file);
  };

  const onSubmitProfile = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const onSubmitApiKey = (data: ApiKeyForm) => {
    createApiKeyMutation.mutate(data);
  };

  const onSubmitGoogleCalendar = (data: GoogleCalendarForm) => {
    saveGoogleCalendarMutation.mutate(data);
  };

  const copyToClipboard = async (text: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (keyId) {
        setCopiedKeyId(keyId);
        setTimeout(() => setCopiedKeyId(null), 2000);
      }
      toast({
        title: "Copiado!",
        description: "Texto copiado para a área de transferência",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível copiar o texto",
      });
    }
  };

  useEffect(() => {
    if (currentUser?.state) {
      setSelectedState(currentUser.state);
      setAvailableCities(getCitiesByState(currentUser.state));
    }
  }, [currentUser]);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "state" && value.state) {
        setSelectedState(value.state);
        const cities = getCitiesByState(value.state);
        setAvailableCities(cities);
        
        if (value.city && !cities.includes(value.city)) {
          form.setValue("city", "");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleEditClick = () => {
    const formattedVotes = currentUser?.lastElectionVotes 
      ? currentUser.lastElectionVotes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      : "";
    
    form.reset({
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      electionNumber: currentUser?.electionNumber || "",
      lastElectionVotes: formattedVotes,
      state: currentUser?.state || "",
      city: currentUser?.city || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    
    if (currentUser?.state) {
      setSelectedState(currentUser.state);
      setAvailableCities(getCitiesByState(currentUser.state));
    }
    
    setShowEditDialog(true);
  };

  const selectedParty = parties?.find(p => p.id === form.watch("partyId"));
  const baseUrl = 'https://www.politicall.com.br';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-2">Gerencie suas preferências e informações da conta</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 rounded-full p-1">
          <TabsTrigger value="profile" data-testid="tab-profile" className="rounded-full">
            <User className="w-4 h-4 mr-2" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="google-calendar" data-testid="tab-google-calendar" className="rounded-full">
            <Calendar className="w-4 h-4 mr-2" />
            Google Calendar
          </TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-api" className="rounded-full">
            <Key className="w-4 h-4 mr-2" />
            Integrações API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6 max-w-full overflow-x-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Informações da Conta</CardTitle>
                      <CardDescription>Detalhes do seu perfil político</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEditClick}
                      className="rounded-full"
                      data-testid="button-edit-profile"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nome Completo</label>
                    <p className="text-base mt-1" data-testid="text-user-name">{currentUser?.name || "-"}</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                    <p className="text-base mt-1" data-testid="text-user-phone">{currentUser?.phone || "-"}</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-base mt-1" data-testid="text-user-email">{currentUser?.email || "-"}</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Partido Político</label>
                    <p className="text-base mt-1" data-testid="text-user-party">
                      {parties && currentUser?.partyId 
                        ? parties.find(p => p.id === currentUser.partyId)?.acronym || "-"
                        : "-"}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Cargo Político</label>
                    <p className="text-base mt-1" data-testid="text-user-position">{currentUser?.politicalPosition || "-"}</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Número de Eleição</label>
                    <p className="text-base mt-1" data-testid="text-user-election-number">{currentUser?.electionNumber || "-"}</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Ideologia</label>
                    <p className="text-base mt-1" data-testid="text-user-ideology">
                      {parties && currentUser?.partyId 
                        ? parties.find(p => p.id === currentUser.partyId)?.ideology || "-"
                        : "-"}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Votos na Última Eleição</label>
                    <p className="text-base mt-1" data-testid="text-user-votes">
                      {currentUser?.lastElectionVotes ? currentUser.lastElectionVotes.toLocaleString('pt-BR') : "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sobre a Plataforma</CardTitle>
                  <CardDescription>Informações do sistema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Versão</label>
                    <p className="text-base mt-1">1.0.0</p>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Plataforma</label>
                    <p className="text-base mt-1">Gestão Política Completa</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Perfil
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-center">
                    <div 
                      className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer hover-elevate group"
                      onClick={handleAvatarClick}
                      data-testid="avatar-upload"
                    >
                      {currentUser?.avatar ? (
                        <img 
                          src={currentUser.avatar} 
                          alt="Avatar" 
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-12 h-12 text-primary" />
                      )}
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-avatar"
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-lg">{currentUser?.name}</p>
                    <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recursos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {[
                      { key: 'contacts', label: 'Eleitores' },
                      { key: 'alliances', label: 'Alianças' },
                      { key: 'demands', label: 'Demandas' },
                      { key: 'petitions', label: 'Petições' },
                      { key: 'agenda', label: 'Agenda' },
                      { key: 'ai', label: 'Atendimento IA' },
                      { key: 'surveys', label: 'Pesquisas' },
                    ].map(({ key, label }) => {
                      const isActive = adminData?.permissions?.[key] === true;
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-2">
                            {!isActive && <Lock className="w-3 h-3" />}
                            {label}
                          </span>
                          {isActive ? (
                            <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">Bloqueado</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="api" className="space-y-6 mt-6 max-w-full overflow-x-hidden">
            {/* API Keys List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xs">Chaves de API</CardTitle>
                    <CardDescription className="text-xs">Gerencie suas chaves de acesso à API</CardDescription>
                  </div>
                  <Button 
                    onClick={() => setShowApiKeyDialog(true)}
                    data-testid="button-create-api-key"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Chave
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingKeys ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-8 w-8" />
                      </div>
                    ))}
                  </div>
                ) : apiKeys && apiKeys.length > 0 ? (
                  <div className="space-y-4">
                    {apiKeys.map((apiKey) => (
                      <div 
                        key={apiKey.id} 
                        className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                        data-testid={`api-key-item-${apiKey.id}`}
                      >
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-xs">{apiKey.name}</p>
                            <Badge variant="outline" className="font-mono text-xs">
                              {apiKey.keyPrefix}
                            </Badge>
                            {apiKey.isActive ? (
                              <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Ativa
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="w-3 h-3 mr-1" />
                                Revogada
                              </Badge>
                            )}
                          </div>
                          {apiKey.description && (
                            <p className="text-xs text-muted-foreground">{apiKey.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Criada em {format(new Date(apiKey.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            {apiKey.lastUsedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Último uso: {format(new Date(apiKey.lastUsedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteKeyId(apiKey.id)}
                          disabled={!apiKey.isActive}
                          data-testid={`button-delete-key-${apiKey.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Key className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-xs">Nenhuma chave de API criada ainda</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crie uma chave para integrar com sistemas externos
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Documentation */}
            <Card>
              <Collapsible 
                open={isDocumentationOpen} 
                onOpenChange={setIsDocumentationOpen}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1.5">
                        <CardTitle className="flex items-center gap-2 text-xs">
                          <Code2 className="w-5 h-5" />
                          Documentação da API
                        </CardTitle>
                        <CardDescription className="text-xs">Como usar as chaves de API para integração</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <ChevronDown 
                          className={`h-4 w-4 transition-transform ${
                            isDocumentationOpen ? "rotate-180" : ""
                          }`}
                        />
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-6 pt-0">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-xs">
                    <Globe className="w-4 h-4" />
                    URL Base
                  </h4>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs flex items-center justify-between">
                    <span>{baseUrl}/api/v1</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(`${baseUrl}/api/v1`)}
                      data-testid="button-copy-base-url"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-xs">
                    <Key className="w-4 h-4" />
                    Autenticação
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Inclua sua chave de API no header Authorization de todas as requisições:
                  </p>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs">
                    Authorization: Bearer YOUR_API_KEY
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-xs">
                    <Terminal className="w-4 h-4" />
                    Exemplos de Uso
                  </h4>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium mb-2">Listar Contatos</p>
                      <div className="bg-muted p-3 rounded-md">
                        <pre className="text-xs font-mono overflow-x-auto">
{`curl -X GET ${baseUrl}/api/v1/contacts \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                        </pre>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(`curl -X GET ${baseUrl}/api/v1/contacts \\\n  -H "Authorization: Bearer YOUR_API_KEY"`)}
                        data-testid="button-copy-curl-contacts"
                      >
                        <Copy className="w-3 h-3 mr-2" />
                        Copiar
                      </Button>
                    </div>

                    <div>
                      <p className="text-xs font-medium mb-2">Criar Contato</p>
                      <div className="bg-muted p-3 rounded-md">
                        <pre className="text-xs font-mono overflow-x-auto">
{`curl -X POST ${baseUrl}/api/v1/contacts \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "(11) 98765-4321",
    "state": "SP",
    "city": "São Paulo"
  }'`}
                        </pre>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(`curl -X POST ${baseUrl}/api/v1/contacts \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "name": "João Silva",\n    "email": "joao@example.com",\n    "phone": "(11) 98765-4321",\n    "state": "SP",\n    "city": "São Paulo"\n  }'`)}
                        data-testid="button-copy-curl-create-contact"
                      >
                        <Copy className="w-3 h-3 mr-2" />
                        Copiar
                      </Button>
                    </div>

                    <div>
                      <p className="text-xs font-medium mb-2">Buscar Contato por ID</p>
                      <div className="bg-muted p-3 rounded-md">
                        <pre className="text-xs font-mono overflow-x-auto">
{`curl -X GET ${baseUrl}/api/v1/contacts/{contact_id} \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                        </pre>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(`curl -X GET ${baseUrl}/api/v1/contacts/{contact_id} \\\n  -H "Authorization: Bearer YOUR_API_KEY"`)}
                        data-testid="button-copy-curl-get-contact"
                      >
                        <Copy className="w-3 h-3 mr-2" />
                        Copiar
                      </Button>
                    </div>

                    <div>
                      <p className="text-xs font-medium mb-2">Listar Alianças Políticas</p>
                      <div className="bg-muted p-3 rounded-md">
                        <pre className="text-xs font-mono overflow-x-auto">
{`curl -X GET ${baseUrl}/api/v1/alliances \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                        </pre>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(`curl -X GET ${baseUrl}/api/v1/alliances \\\n  -H "Authorization: Bearer YOUR_API_KEY"`)}
                        data-testid="button-copy-curl-alliances"
                      >
                        <Copy className="w-3 h-3 mr-2" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Limites de taxa:</strong> A API tem um limite de 100 requisições por minuto para leitura e 50 requisições por minuto para escrita.
                  </AlertDescription>
                </Alert>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
        </TabsContent>

        <TabsContent value="google-calendar" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column - Configuration */}
            <div className="space-y-6">
              {/* Credentials Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Credenciais OAuth</CardTitle>
                  <CardDescription className="text-xs">
                    Insira as credenciais do Google Cloud Console
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingGoogleCalendar ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <Form {...googleCalendarForm}>
                      <form onSubmit={googleCalendarForm.handleSubmit(onSubmitGoogleCalendar)} className="space-y-4">
                        <FormField
                          control={googleCalendarForm.control}
                          name="clientId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Client ID</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Cole o Client ID aqui" 
                                  {...field}
                                  data-testid="input-google-client-id"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={googleCalendarForm.control}
                          name="clientSecret"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Client Secret</FormLabel>
                              <FormControl>
                                <Input 
                                  type="password"
                                  placeholder="Cole o Client Secret aqui" 
                                  {...field}
                                  data-testid="input-google-client-secret"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-xs font-medium mb-1">Redirect URI (copie para o Google Console)</p>
                          <div className="flex items-center gap-2">
                            <code className="text-xs flex-1 break-all">https://www.politicall.com.br/api/google-calendar/callback</code>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard("https://www.politicall.com.br/api/google-calendar/callback")}
                              data-testid="button-copy-redirect-uri"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <Button 
                          type="submit" 
                          className="w-full rounded-full"
                          disabled={saveGoogleCalendarMutation.isPending}
                          data-testid="button-save-google-credentials"
                        >
                          {saveGoogleCalendarMutation.isPending ? "Salvando..." : "Salvar Credenciais"}
                        </Button>
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>

              {/* Sync Preferences Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Preferências</CardTitle>
                  <CardDescription className="text-xs">
                    Configure como os eventos serão sincronizados
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Form {...googleCalendarForm}>
                    <FormField
                      control={googleCalendarForm.control}
                      name="syncDirection"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Direção da Sincronização</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-full" data-testid="select-sync-direction">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="to_google">Para o Google</SelectItem>
                              <SelectItem value="from_google">Do Google</SelectItem>
                              <SelectItem value="both">Bidirecional</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-xs font-medium">Google Meet Automático</p>
                        <p className="text-xs text-muted-foreground">Criar links do Meet para novos eventos</p>
                      </div>
                      <Switch
                        checked={googleCalendarForm.watch("autoCreateMeet")}
                        onCheckedChange={(v) => googleCalendarForm.setValue("autoCreateMeet", v)}
                        data-testid="switch-auto-meet"
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-xs font-medium">Sincronizar Lembretes</p>
                        <p className="text-xs text-muted-foreground">Incluir lembretes nos eventos</p>
                      </div>
                      <Switch
                        checked={googleCalendarForm.watch("syncReminders")}
                        onCheckedChange={(v) => googleCalendarForm.setValue("syncReminders", v)}
                        data-testid="switch-sync-reminders"
                      />
                    </div>
                  </Form>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Status & Instructions */}
            <div className="space-y-6">
              {/* Connection Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Status da Conexão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingGoogleCalendar ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Status:</span>
                        {googleCalendarConfig?.isAuthorized ? (
                          <Badge className="rounded-full">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Conectado
                          </Badge>
                        ) : googleCalendarConfig?.isConfigured ? (
                          <Badge variant="secondary" className="rounded-full">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Não autorizado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full">
                            <XCircle className="w-3 h-3 mr-1" />
                            Não configurado
                          </Badge>
                        )}
                      </div>

                      {googleCalendarConfig?.email && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Conta:</span>
                          <span className="text-xs text-muted-foreground">{googleCalendarConfig.email}</span>
                        </div>
                      )}

                      {googleCalendarConfig?.lastSyncAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Última sync:</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(googleCalendarConfig.lastSyncAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      )}

                      <Separator />

                      <div className="space-y-2">
                        {googleCalendarConfig?.isConfigured && !googleCalendarConfig?.isAuthorized && (
                          <Button
                            onClick={() => authorizeGoogleCalendarMutation.mutate()}
                            disabled={authorizeGoogleCalendarMutation.isPending || isAuthorizing}
                            className="w-full rounded-full"
                            data-testid="button-authorize-google"
                          >
                            {authorizeGoogleCalendarMutation.isPending || isAuthorizing ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Autorizando...
                              </>
                            ) : (
                              <>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Autorizar com Google
                              </>
                            )}
                          </Button>
                        )}

                        {googleCalendarConfig?.isAuthorized && (
                          <>
                            <Button
                              onClick={() => syncGoogleCalendarMutation.mutate()}
                              disabled={syncGoogleCalendarMutation.isPending}
                              variant="outline"
                              className="w-full rounded-full"
                              data-testid="button-sync-calendar"
                            >
                              <RefreshCw className={`w-4 h-4 mr-2 ${syncGoogleCalendarMutation.isPending ? 'animate-spin' : ''}`} />
                              {syncGoogleCalendarMutation.isPending ? "Sincronizando..." : "Sincronizar Agora"}
                            </Button>

                            <Button
                              onClick={() => {
                                if (confirm("Deseja desconectar sua conta Google?")) {
                                  disconnectGoogleCalendarMutation.mutate();
                                }
                              }}
                              disabled={disconnectGoogleCalendarMutation.isPending}
                              variant="destructive"
                              className="w-full rounded-full"
                              data-testid="button-disconnect-google"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Desconectar
                            </Button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Instructions Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Como Configurar</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-xs text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="font-bold text-foreground">1.</span>
                      Acesse <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.cloud.google.com</a>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-foreground">2.</span>
                      Crie um projeto e ative a "Google Calendar API"
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-foreground">3.</span>
                      Vá em Credenciais → Criar ID OAuth 2.0
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-foreground">4.</span>
                      Copie o Redirect URI acima e cole no Google
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-foreground">5.</span>
                      Cole o Client ID e Secret nos campos à esquerda
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0" data-testid="dialog-edit-profile">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Editar Perfil Político</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitProfile)} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo do político" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(00) 00000-0000" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="partyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partido Político</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-party">
                            <SelectValue placeholder="Selecione o partido" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parties?.map((party) => (
                            <SelectItem key={party.id} value={party.id}>
                              {party.acronym} - {party.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedParty && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-sm font-medium">Ideologia:</p>
                    <p className="text-sm text-muted-foreground">{selectedParty.ideology}</p>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="politicalPosition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo Político</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-position">
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {POLITICAL_POSITIONS.map((position) => (
                            <SelectItem key={position} value={position}>
                              {position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="electionNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Eleição</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="12345" 
                          {...field}
                          value={field.value || ''}
                          data-testid="input-election-number" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastElectionVotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Votos na Última Eleição</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="0.000.000" 
                          value={field.value || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '');
                            if (value === '') {
                              field.onChange('');
                              return;
                            }
                            const formatted = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                            field.onChange(formatted);
                          }}
                          data-testid="input-votes" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-state">
                            <SelectValue placeholder="Selecione o estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedState && (
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-city">
                              <SelectValue placeholder="Selecione a cidade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableCities.map((city) => (
                              <SelectItem key={city} value={city}>
                                {city}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Alterar Senha</p>
                  {isImpersonating ? (
                    <p className="text-xs text-muted-foreground">Como admin master, você pode alterar a senha sem precisar da senha atual</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual</p>
                  )}
                </div>
                {!isImpersonating && (
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha Atual</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Digite sua senha atual" {...field} data-testid="input-current-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Digite sua nova senha" {...field} data-testid="input-new-password" />
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
                      <FormLabel>Confirmar Nova Senha</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirme sua nova senha" {...field} data-testid="input-confirm-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="px-6 py-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent data-testid="dialog-create-api-key">
          <DialogHeader>
            <DialogTitle>Criar Nova Chave de API</DialogTitle>
            <DialogDesc>
              Crie uma nova chave de API para integrar com sistemas externos
            </DialogDesc>
          </DialogHeader>
          <Form {...apiKeyForm}>
            <form onSubmit={apiKeyForm.handleSubmit(onSubmitApiKey)} className="space-y-4">
              <FormField
                control={apiKeyForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Chave</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ex: Integração WhatsApp" 
                        {...field} 
                        data-testid="input-api-key-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Um nome descritivo para identificar esta chave
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={apiKeyForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Descreva o propósito desta chave..."
                        className="resize-none"
                        {...field}
                        data-testid="input-api-key-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowApiKeyDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createApiKeyMutation.isPending}
                  data-testid="button-submit-api-key"
                >
                  {createApiKeyMutation.isPending ? "Criando..." : "Criar Chave"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* New API Key Alert */}
      <Dialog open={showNewKeyAlert} onOpenChange={setShowNewKeyAlert}>
        <DialogContent data-testid="dialog-new-api-key">
          <DialogHeader>
            <DialogTitle>Chave de API Criada</DialogTitle>
          </DialogHeader>
          <Alert className="border-primary/20 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription>
              <strong>Importante:</strong> Esta é a única vez que você verá esta chave completa. 
              Copie-a agora e guarde-a em um local seguro.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Sua nova chave de API:</label>
              <div className="mt-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {newApiKey}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                copyToClipboard(newApiKey);
              }}
              data-testid="button-copy-new-key"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar Chave
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewKeyAlert(false);
                setNewApiKey("");
              }}
              data-testid="button-close-new-key"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={(open) => !open && setDeleteKeyId(null)}>
        <AlertDialogContent data-testid="dialog-delete-api-key">
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar Chave de API</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja revogar esta chave de API? 
              Todas as integrações que usam esta chave deixarão de funcionar imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteApiKeyMutation.mutate(deleteKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Revogar Chave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}