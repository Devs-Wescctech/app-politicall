import { useState, useEffect } from "react";
import { useQuery as useQueryLib } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type AiConfiguration, 
  type AiConversation, 
  type AiTrainingExample,
  insertAiConfigurationSchema,
  insertAiTrainingExampleSchema
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Settings, CheckCircle2, XCircle, Plus, Edit, Trash2, Save, X, AlertCircle, HelpCircle, RefreshCw, MessageSquare, Info } from "lucide-react";
import { SiFacebook, SiInstagram, SiX, SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", icon: SiFacebook },
  { id: "instagram", name: "Instagram", icon: SiInstagram },
  // X (Twitter) hidden - not yet supported
];

const TRAINING_CATEGORIES = [
  { value: "propostas", label: "Propostas" },
  { value: "biografia", label: "Biografia" },
  { value: "contato", label: "Contato" },
  { value: "geral", label: "Geral" },
];

// Extended type to include server-computed properties
type AiConfigurationWithCustomKey = AiConfiguration & {
  hasCustomKey?: boolean;
  openaiApiKeyLast4?: string;
};

export default function AiAttendance() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<AiTrainingExample | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [accountSlug, setAccountSlug] = useState<string>("");
  // New test-related state variables
  const [testMessage, setTestMessage] = useState('');
  const [aiTestResponse, setAiTestResponse] = useState('');
  const [testHistory, setTestHistory] = useState<Array<{
    message: string;
    response: string;
    timestamp: Date;
  }>>([]);
  const { toast } = useToast();

  // Queries
  const { data: config, isLoading: loadingConfig } = useQuery<AiConfigurationWithCustomKey>({
    queryKey: ["/api/ai-config"],
  });

  // Fetch admin data to get account slug for privacy URLs
  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
  });

  useEffect(() => {
    if (adminData?.slug) {
      setAccountSlug(adminData.slug);
    }
  }, [adminData]);

  const { data: conversations, isLoading: loadingConversations } = useQuery<AiConversation[]>({
    queryKey: ["/api/ai-conversations"],
  });

  const { data: trainingExamples = [], isLoading: loadingExamples } = useQuery<AiTrainingExample[]>({
    queryKey: ["/api/ai-training-examples"],
  });

  // API Status Query
  const { data: apiStatus, isLoading: loadingStatus } = useQuery<{
    status: string;
    message: string;
    checkedAt: Date | string;
  }>({
    queryKey: ['/api/ai-config/openai-status'],
    enabled: !!config?.openaiApiKey,
    refetchInterval: false, // Don't auto-refresh
  });

  // Forms
  const platformForm = useForm({
    resolver: zodResolver(insertAiConfigurationSchema),
    defaultValues: {
      mode: config?.mode || "compliance",
      // Facebook
      facebookAppId: "",
      facebookAppSecret: "",
      facebookPageAccessToken: "",
      facebookPageId: "",
      facebookWebhookVerifyToken: "",
      facebookPageName: "",
      // Instagram
      instagramAppId: "",
      instagramAppSecret: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
      instagramFacebookPageId: "",
      instagramUsername: "",
      instagramWebhookVerifyToken: "",
      // Twitter/X
      twitterApiKey: "",
      twitterApiSecretKey: "",
      twitterBearerToken: "",
      twitterAccessToken: "",
      twitterAccessTokenSecret: "",
      twitterClientId: "",
      twitterClientSecret: "",
      twitterUsername: "",
      // WhatsApp
      whatsappPhoneNumberId: "",
      whatsappBusinessAccountId: "",
      whatsappAccessToken: "",
      whatsappAppId: "",
      whatsappAppSecret: "",
      whatsappWebhookVerifyToken: "",
      whatsappPhoneNumber: "",
      whatsappBusinessName: "",
    },
  });

  const personalizationForm = useForm({
    resolver: zodResolver(z.object({
      systemPrompt: z.string().optional(),
      personalityTraits: z.string().optional(),
      politicalInfo: z.string().optional(),
      responseGuidelines: z.string().optional(),
    })),
    defaultValues: {
      systemPrompt: config?.systemPrompt || "",
      personalityTraits: config?.personalityTraits || "",
      politicalInfo: config?.politicalInfo || "",
      responseGuidelines: config?.responseGuidelines || "",
    },
  });

  const trainingForm = useForm({
    resolver: zodResolver(insertAiTrainingExampleSchema),
    defaultValues: {
      question: "",
      answer: "",
      category: "geral",
      active: true,
    },
  });

  // Auto-check API status on page load if last check was > 15 minutes ago
  useEffect(() => {
    if (config?.openaiApiKey && apiStatus?.checkedAt) {
      const lastCheck = new Date(apiStatus.checkedAt);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (lastCheck < fifteenMinutesAgo) {
        testApiStatusMutation.mutate();
      }
    }
  }, [config?.openaiApiKey]);

  // Reset platform form when config is loaded
  useEffect(() => {
    if (config) {
      platformForm.reset({
        mode: config.mode || "compliance",
        // Facebook
        facebookAppId: config.facebookAppId || "",
        facebookAppSecret: config.facebookAppSecret || "",
        facebookPageAccessToken: config.facebookPageAccessToken || "",
        facebookPageId: config.facebookPageId || "",
        facebookWebhookVerifyToken: config.facebookWebhookVerifyToken || "",
        facebookPageName: config.facebookPageName || "",
        // Instagram
        instagramAppId: config.instagramAppId || "",
        instagramAppSecret: config.instagramAppSecret || "",
        instagramAccessToken: config.instagramAccessToken || "",
        instagramBusinessAccountId: config.instagramBusinessAccountId || "",
        instagramFacebookPageId: config.instagramFacebookPageId || "",
        instagramUsername: config.instagramUsername || "",
        instagramWebhookVerifyToken: config.instagramWebhookVerifyToken || "",
        // Twitter/X
        twitterApiKey: config.twitterApiKey || "",
        twitterApiSecretKey: config.twitterApiSecretKey || "",
        twitterBearerToken: config.twitterBearerToken || "",
        twitterAccessToken: config.twitterAccessToken || "",
        twitterAccessTokenSecret: config.twitterAccessTokenSecret || "",
        twitterClientId: config.twitterClientId || "",
        twitterClientSecret: config.twitterClientSecret || "",
        twitterUsername: config.twitterUsername || "",
        // WhatsApp
        whatsappPhoneNumberId: config.whatsappPhoneNumberId || "",
        whatsappBusinessAccountId: config.whatsappBusinessAccountId || "",
        whatsappAccessToken: config.whatsappAccessToken || "",
        whatsappAppId: config.whatsappAppId || "",
        whatsappAppSecret: config.whatsappAppSecret || "",
        whatsappWebhookVerifyToken: config.whatsappWebhookVerifyToken || "",
        whatsappPhoneNumber: config.whatsappPhoneNumber || "",
        whatsappBusinessName: config.whatsappBusinessName || "",
      });
    }
  }, [config]);

  // Reset personalization form when config is loaded
  useEffect(() => {
    if (config) {
      personalizationForm.reset({
        systemPrompt: config.systemPrompt || "",
        personalityTraits: config.personalityTraits || "",
        politicalInfo: config.politicalInfo || "",
        responseGuidelines: config.responseGuidelines || "",
      });
    }
  }, [config]);

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai-config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ title: "Configuração salva com sucesso!" });
      setSelectedPlatform(null);
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  const toggleModeMutation = useMutation({
    mutationFn: (mode: string) => apiRequest("PATCH", "/api/ai-config/mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ title: "Modo alterado com sucesso!" });
    },
  });

  // Toggle automation mutation
  const toggleAutomationMutation = useMutation({
    mutationFn: (data: { platform: string; enabled: boolean }) => 
      apiRequest("PATCH", "/api/ai-config/automation", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ 
        title: variables.enabled 
          ? `Automação ${variables.platform === 'facebook' ? 'Facebook' : 'Instagram'} ativada` 
          : `Automação ${variables.platform === 'facebook' ? 'Facebook' : 'Instagram'} desativada`
      });
    },
    onError: () => {
      toast({ 
        title: "Erro ao alterar automação", 
        variant: "destructive" 
      });
    },
  });

  // Test API Status Mutation
  const testApiStatusMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-config/test-openai-status");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-config/openai-status'] });
      toast({ title: data.message });
    },
  });

  const createTrainingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai-training-examples", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-training-examples"] });
      toast({ title: "Exemplo de treinamento criado com sucesso!" });
      setIsTrainingModalOpen(false);
      trainingForm.reset();
    },
  });

  const updateTrainingMutation = useMutation({
    mutationFn: (data: { id: string; body: any }) => 
      apiRequest("PATCH", `/api/ai-training-examples/${data.id}`, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-training-examples"] });
      toast({ title: "Exemplo atualizado com sucesso!" });
      setIsTrainingModalOpen(false);
      setEditingTraining(null);
      trainingForm.reset();
    },
  });

  const deleteTrainingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ai-training-examples/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-training-examples"] });
      toast({ title: "Exemplo removido com sucesso!" });
    },
  });

  // Test AI Response Mutation
  const testAiResponseMutation = useMutation({
    mutationFn: async (data: { message: string }) => {
      const res = await apiRequest("POST", "/api/ai-config/test-response", data);
      return await res.json();
    },
    onSuccess: (response) => {
      setAiTestResponse(response.response);
      setTestHistory(prev => [{
        message: testMessage,
        response: response.response,
        timestamp: new Date()
      }, ...prev].slice(0, 10)); // Keep last 10 tests
      toast({ 
        title: "Teste concluído",
        description: "A resposta da IA foi gerada com sucesso"
      });
    },
    onError: () => {
      toast({ 
        title: "Erro no teste",
        description: "Não foi possível gerar a resposta da IA",
        variant: "destructive"
      });
    }
  });

  // OpenAI API Key Mutations
  const saveApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await apiRequest("POST", "/api/ai-config/openai-key", { apiKey });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ title: data.message || "Chave API configurada com sucesso!" });
      setApiKey("");
      setIsTestingKey(false);
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error.message || "Erro ao configurar chave API";
      toast({ title: errorMessage, variant: "destructive" });
      setIsTestingKey(false);
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/ai-config/openai-key");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ title: data.message || "Chave API removida com sucesso!" });
      setApiKey("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover chave API", variant: "destructive" });
    },
  });

  // Handlers
  const handleSavePlatform = (data: any) => {
    updateConfigMutation.mutate(data);
  };

  const handleSavePersonalization = (data: any) => {
    updateConfigMutation.mutate(data);
  };

  const handleSaveTraining = (data: any) => {
    if (editingTraining) {
      updateTrainingMutation.mutate({ id: editingTraining.id, body: data });
    } else {
      createTrainingMutation.mutate(data);
    }
  };

  const openEditTraining = (example: AiTrainingExample) => {
    setEditingTraining(example);
    trainingForm.reset({
      question: example.question,
      answer: example.answer,
      category: example.category || "geral",
      active: example.active,
    });
    setIsTrainingModalOpen(true);
  };

  const isConnected = (platform: string) => {
    if (!config) return false;
    switch (platform) {
      case "facebook":
        return !!(config.facebookAppId && config.facebookPageId);
      case "instagram":
        return !!(config.instagramAppId && config.instagramBusinessAccountId);
      case "twitter":
        return !!(config.twitterApiKey && config.twitterAccessToken);
      case "whatsapp":
        return !!(config.whatsappAppId && config.whatsappPhoneNumberId);
      default:
        return false;
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Atendimento por IA</h1>
        <p className="text-muted-foreground mt-2">Automatize o atendimento nas redes sociais</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Modo de Operação</CardTitle>
              <CardDescription>Escolha como a IA deve responder</CardDescription>
            </div>
            <Switch
              checked={config?.mode === "formal"}
              onCheckedChange={(checked) => toggleModeMutation.mutate(checked ? "formal" : "compliance")}
              disabled={loadingConfig}
              data-testid="switch-ai-mode"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className={config?.mode === "compliance" ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="text-base">Modo Compliance TSE</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-[12px]">
                  Respostas institucionais dentro das normas do TSE. A IA fornece informações gerais e
                  encaminha para canais oficiais quando necessário.
                </p>
              </CardContent>
            </Card>
            <Card className={config?.mode === "formal" ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="text-base">Modo Formal</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-[12px]">
                  A IA responde como se fosse o político, mantendo o tom e posicionamento configurado.
                  Use com responsabilidade.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      <Tabs defaultValue="platforms" className="space-y-4">
        <TabsList className="rounded-full grid w-full grid-cols-4">
          <TabsTrigger value="platforms" className="rounded-full">Plataformas</TabsTrigger>
          <TabsTrigger value="personalizacao" className="rounded-full">Personalização</TabsTrigger>
          <TabsTrigger value="treinamento" className="rounded-full">Treinamento</TabsTrigger>
          <TabsTrigger value="teste" className="rounded-full">Teste sua IA</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Plataformas Conectadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLATFORMS.map((platform) => {
                const connected = isConnected(platform.id);
                const automationEnabled = platform.id === 'facebook' 
                  ? config?.facebookAutomationEnabled 
                  : config?.instagramAutomationEnabled;
                return (
                  <Card key={platform.id} data-testid={`platform-${platform.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-center gap-2">
                        <platform.icon className="w-5 h-5 text-primary" />
                        {connected ? (
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <h3 className="text-sm font-semibold text-center">{platform.name}</h3>
                      
                      {connected && (
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <span className="text-xs text-muted-foreground">Automação</span>
                          <Switch
                            checked={automationEnabled ?? false}
                            onCheckedChange={(checked) => {
                              toggleAutomationMutation.mutate({
                                platform: platform.id,
                                enabled: checked
                              });
                            }}
                            disabled={toggleAutomationMutation.isPending}
                            data-testid={`switch-automation-${platform.id}`}
                          />
                        </div>
                      )}
                      
                      <Button
                        onClick={() => setSelectedPlatform(platform.id)}
                        size="sm"
                        variant={connected ? "outline" : "default"}
                        className="w-full rounded-full"
                        data-testid={`button-configure-${platform.id}`}
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        {connected ? "Reconfigurar" : "Configurar"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="personalizacao">
          <div className="space-y-6">
            {/* API Configuration Section */}
            <Card>
              <CardHeader>
                <CardTitle>Configuração da API OpenAI</CardTitle>
                <CardDescription>
                  Configure sua própria chave de API da OpenAI para personalizar o assistente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status da API</p>
                    <p className="text-sm text-muted-foreground">
                      {config?.hasCustomKey ? (
                        <>OpenAI - Chave Própria (****{config.openaiApiKeyLast4})</>
                      ) : (
                        <>OpenAI</>
                      )}
                    </p>
                    {config?.hasCustomKey && apiStatus?.checkedAt && (
                      <p className="text-xs text-muted-foreground">
                        Última verificação: {format(new Date(apiStatus.checkedAt), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {config?.hasCustomKey ? (
                      <>
                        {loadingStatus || testApiStatusMutation.isPending ? (
                          <Settings className="w-4 h-4 animate-spin" />
                        ) : apiStatus?.status === 'active' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : apiStatus?.status === 'error' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="w-4 h-4" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{apiStatus?.message || 'Erro desconhecido'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <HelpCircle className="w-4 h-4" />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => testApiStatusMutation.mutate()}
                          disabled={testApiStatusMutation.isPending}
                          className="rounded-full"
                          data-testid="button-test-api-status"
                        >
                          <RefreshCw className={`w-3 h-3 ${testApiStatusMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      </>
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-blue-800 dark:text-blue-200" />
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="api-key-input" className="text-sm font-medium">
                      Chave da API
                    </label>
                    <Input
                      id="api-key-input"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                     
                      className="font-mono"
                      data-testid="input-api-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      Sua chave API será criptografada antes de ser armazenada
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setIsTestingKey(true);
                        saveApiKeyMutation.mutate(apiKey);
                      }}
                      disabled={!apiKey || saveApiKeyMutation.isPending || isTestingKey}
                      className="rounded-full"
                      data-testid="button-save-api-key"
                    >
                      {saveApiKeyMutation.isPending ? (
                        <>
                          <Settings className="w-4 h-4 mr-2 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Salvar Chave
                        </>
                      )}
                    </Button>
                    
                    {config?.hasCustomKey && (
                      <Button
                        onClick={() => deleteApiKeyMutation.mutate()}
                        disabled={deleteApiKeyMutation.isPending}
                        variant="destructive"
                        className="rounded-full"
                        data-testid="button-remove-api-key"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remover Chave
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Existing Personality Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Configuração de Personalidade da IA</CardTitle>
                <CardDescription>
                  Configure as instruções e características da IA para respostas personalizadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...personalizationForm}>
                  <form onSubmit={personalizationForm.handleSubmit(handleSavePersonalization)} className="space-y-6">
                  <FormField
                    control={personalizationForm.control}
                    name="systemPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt do Sistema</FormLabel>
                        <FormDescription>
                          Instruções principais para a IA sobre como deve se comportar e responder
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                           
                            className="min-h-[120px]"
                            data-testid="textarea-system-prompt"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={personalizationForm.control}
                    name="personalityTraits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Traços de Personalidade</FormLabel>
                        <FormDescription>
                          Características de personalidade que a IA deve demonstrar nas respostas
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                           
                            className="min-h-[100px]"
                            data-testid="textarea-personality-traits"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={personalizationForm.control}
                    name="politicalInfo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Informações Políticas</FormLabel>
                        <FormDescription>
                          Biografia do político, propostas, informações do partido e plataforma política
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                           
                            className="min-h-[150px]"
                            data-testid="textarea-political-info"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={personalizationForm.control}
                    name="responseGuidelines"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diretrizes de Resposta</FormLabel>
                        <FormDescription>
                          Regras específicas sobre como a IA deve formular suas respostas
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                           
                            className="min-h-[120px]"
                            data-testid="textarea-response-guidelines"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      className="rounded-full"
                      disabled={updateConfigMutation.isPending}
                      data-testid="button-save-personalization"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Personalização
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="treinamento">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Exemplos de Treinamento</CardTitle>
                  <CardDescription>
                    Gerencie perguntas e respostas para treinar a IA
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => {
                    setEditingTraining(null);
                    trainingForm.reset();
                    setIsTrainingModalOpen(true);
                  }}
                  className="rounded-full"
                  data-testid="button-add-training"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Exemplo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingExamples ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : trainingExamples.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum exemplo de treinamento cadastrado
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pergunta</TableHead>
                      <TableHead>Resposta</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingExamples.map((example) => (
                      <TableRow key={example.id}>
                        <TableCell className="max-w-xs truncate">{example.question}</TableCell>
                        <TableCell className="max-w-xs truncate">{example.answer}</TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {TRAINING_CATEGORIES.find(c => c.value === example.category)?.label || example.category}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={example.active}
                            onCheckedChange={(checked) => {
                              updateTrainingMutation.mutate({
                                id: example.id,
                                body: { active: checked }
                              });
                            }}
                            data-testid={`switch-training-${example.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditTraining(example)}
                              className="rounded-full"
                              data-testid={`button-edit-training-${example.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteTrainingMutation.mutate(example.id)}
                              className="rounded-full text-destructive"
                              data-testid={`button-delete-training-${example.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teste">
          <Card>
            <CardHeader>
              <CardTitle>Teste sua IA</CardTitle>
              <CardDescription>
                Teste como sua IA responderá nas redes sociais com base no treinamento configurado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Test Input Section */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensagem de Teste</Label>
                  <Textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                   
                    className="min-h-[100px]"
                    data-testid="textarea-test-message"
                  />
                </div>
                
                <Button
                  onClick={() => testAiResponseMutation.mutate({ message: testMessage })}
                  disabled={!testMessage || testAiResponseMutation.isPending}
                  className="rounded-full"
                  data-testid="button-test-ai"
                >
                  {testAiResponseMutation.isPending ? (
                    <>
                      <Settings className="w-4 h-4 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Testar Resposta
                    </>
                  )}
                </Button>
              </div>
              
              {/* Response Display */}
              {aiTestResponse && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Resposta da IA</Label>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{aiTestResponse}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Test History */}
              {testHistory.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Histórico de Testes</Label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {testHistory.map((test, index) => (
                        <div key={index} className="p-3 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">Pergunta:</p>
                            <p className="text-sm text-muted-foreground">{test.message}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Resposta:</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{test.response}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(test.timestamp), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* Training Example Modal */}
      <Dialog open={isTrainingModalOpen} onOpenChange={setIsTrainingModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTraining ? "Editar Exemplo de Treinamento" : "Novo Exemplo de Treinamento"}
            </DialogTitle>
          </DialogHeader>
          <Form {...trainingForm}>
            <form onSubmit={trainingForm.handleSubmit(handleSaveTraining)} className="space-y-4">
              <FormField
                control={trainingForm.control}
                name="question"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pergunta</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                       
                        className="min-h-[80px]"
                        data-testid="textarea-training-question"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={trainingForm.control}
                name="answer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resposta</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                       
                        className="min-h-[120px]"
                        data-testid="textarea-training-answer"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={trainingForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-training-category">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRAINING_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={trainingForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Exemplo Ativo</FormLabel>
                      <FormDescription>
                        Este exemplo será usado no treinamento da IA
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-training-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="px-6 py-4 border-t grid grid-cols-2 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsTrainingModalOpen(false);
                    setEditingTraining(null);
                    trainingForm.reset();
                  }}
                  className="rounded-full w-full"
                  data-testid="button-cancel-training"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-full w-full"
                  disabled={createTrainingMutation.isPending || updateTrainingMutation.isPending}
                  data-testid="button-save-training"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingTraining ? "Atualizar" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Platform Configuration Dialog (existing) */}
      <Dialog open={!!selectedPlatform} onOpenChange={() => setSelectedPlatform(null)}>
        {selectedPlatform === "facebook" && (
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Configurar Facebook</DialogTitle>
            </DialogHeader>
            <Form {...platformForm}>
              <form onSubmit={platformForm.handleSubmit(handleSavePlatform)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Configuração de Webhook no Meta
                    </h4>
                    <div className="space-y-1 text-sm">
                      <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                        https://www.politicall.com.br/api/webhook/facebook
                      </code>
                      {accountSlug && (
                        <>
                          <p className="font-medium mt-3">Política de Privacidade:</p>
                          <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                            https://www.politicall.com.br/privacy/facebook/{accountSlug}
                          </code>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={platformForm.control}
                    name="facebookAppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-fb-app-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="facebookAppSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App Secret</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-fb-app-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="facebookPageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-fb-page-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="facebookPageName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Página</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-fb-page-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="facebookPageAccessToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Page Access Token</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[80px]" data-testid="textarea-fb-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="facebookWebhookVerifyToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Webhook Verify Token</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-fb-webhook-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
                <DialogFooter className="px-6 py-4 border-t">
                  <Button type="submit" className="rounded-full w-full" data-testid="button-save-fb-config">
                    Salvar Configuração
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        )}
        {selectedPlatform === "instagram" && (
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Configurar Instagram</DialogTitle>
            </DialogHeader>
            <Form {...platformForm}>
              <form onSubmit={platformForm.handleSubmit(handleSavePlatform)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Configuração de Webhook do Instagram (Meta)
                    </h4>
                    <div className="space-y-1 text-sm">
                      <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                        https://www.politicall.com.br/api/webhook/instagram
                      </code>
                      {accountSlug && (
                        <>
                          <p className="font-medium mt-3">Política de Privacidade:</p>
                          <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                            https://www.politicall.com.br/privacy/instagram/{accountSlug}
                          </code>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={platformForm.control}
                    name="instagramAppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-ig-app-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramAppSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App Secret</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-ig-app-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramBusinessAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Account ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-ig-business-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome de Usuário</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-ig-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramFacebookPageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Facebook Page ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-ig-fb-page-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramWebhookVerifyToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Webhook Verify Token</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-ig-webhook-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="instagramAccessToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Access Token</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[80px]" data-testid="textarea-ig-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
                <DialogFooter className="px-6 py-4 border-t">
                  <Button type="submit" className="rounded-full w-full" data-testid="button-save-ig-config">
                    Salvar Configuração
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        )}
        {selectedPlatform === "twitter" && (
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Configurar X (Twitter)</DialogTitle>
            </DialogHeader>
            <Form {...platformForm}>
              <form onSubmit={platformForm.handleSubmit(handleSavePlatform)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Configuração de Webhook do Twitter/X
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Passo 1: Acesse Twitter Developer Portal → Seu App → Account Activity API</p>
                      <p className="font-medium">Passo 2: Cole a URL de Callback:</p>
                      <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                        https://www.politicall.com.br/api/webhook/twitter
                      </code>
                      <p className="text-xs text-muted-foreground">IMPORTANTE: A URL DEVE ser HTTPS (SSL válido obrigatório)</p>
                      <p className="font-medium">Passo 3: Twitter fará verificação CRC automática (nosso backend já suporta)</p>
                      <p className="font-medium">Passo 4: Adicione uma subscription (registro de webhook)</p>
                      <p className="text-xs text-muted-foreground">Permissões necessárias: Read/Write/Direct Messages (OAuth 1.0a)</p>
                      <p className="text-xs text-muted-foreground">ATENÇÃO: Account Activity API requer assinatura paga no Twitter/X (Premium ou Enterprise)</p>
                      {accountSlug && (
                        <>
                          <p className="font-medium mt-3">Política de Privacidade:</p>
                          <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                            https://www.politicall.com.br/privacy/twitter/{accountSlug}
                          </code>
                          <p className="text-xs text-muted-foreground">Use esta URL na configuração de Privacidade do seu app X/Twitter</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={platformForm.control}
                    name="twitterApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-tw-api-key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterApiSecretKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Secret Key</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-tw-api-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterBearerToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Bearer Token</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[80px]" data-testid="textarea-tw-bearer-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterAccessToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-tw-access-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterAccessTokenSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token Secret</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-tw-token-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterClientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-tw-client-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterClientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Secret</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-tw-client-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="twitterUsername"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Nome de Usuário</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-tw-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
                <DialogFooter className="px-6 py-4 border-t">
                  <Button type="submit" className="rounded-full w-full" data-testid="button-save-tw-config">
                    Salvar Configuração
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        )}
        {selectedPlatform === "whatsapp" && (
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Configurar WhatsApp</DialogTitle>
            </DialogHeader>
            <Form {...platformForm}>
              <form onSubmit={platformForm.handleSubmit(handleSavePlatform)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Configuração de Webhook do WhatsApp Cloud API
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Passo 1: Acesse Meta Developer → Seu App → WhatsApp → Configuration</p>
                      <p className="font-medium">Passo 2: Cole a URL de Callback:</p>
                      <code className="block bg-background px-3 py-2 rounded-full border text-xs font-mono">
                        https://www.politicall.com.br/api/webhook/whatsapp
                      </code>
                      <p className="text-xs text-muted-foreground">IMPORTANTE: A URL DEVE ser HTTPS (SSL válido obrigatório)</p>
                      <p className="font-medium">Passo 3: Defina o Webhook Verify Token (mesmo que você definir abaixo)</p>
                      <p className="font-medium">Passo 4: Clique em "Verify and Save"</p>
                      <p className="font-medium">Passo 5: Inscreva-se nos campos: <code className="text-xs">messages</code>, <code className="text-xs">message_status</code></p>
                      <p className="text-xs text-muted-foreground">Permissões necessárias: whatsapp_business_messaging, whatsapp_business_management</p>
                      <p className="text-xs text-muted-foreground">Você recebe um número de teste gratuito. Para produção, adicione seu próprio número.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={platformForm.control}
                    name="whatsappPhoneNumberId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-phone-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappBusinessAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Account ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-business-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappAppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-app-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappAppSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App Secret</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" data-testid="input-wa-app-secret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappPhoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Telefone</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappBusinessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Negócio</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-business-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappAccessToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Access Token</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[80px]" data-testid="textarea-wa-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={platformForm.control}
                    name="whatsappWebhookVerifyToken"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Webhook Verify Token</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-wa-webhook-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
                <DialogFooter className="px-6 py-4 border-t">
                  <Button type="submit" className="rounded-full w-full" data-testid="button-save-wa-config">
                    Salvar Configuração
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}