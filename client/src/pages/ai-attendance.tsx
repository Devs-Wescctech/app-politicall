import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type AiConfiguration, 
  type AiConversation, 
  type AiTrainingExample,
  type AiResponseTemplate,
  insertAiConfigurationSchema,
  insertAiTrainingExampleSchema,
  insertAiResponseTemplateSchema
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Settings, CheckCircle2, XCircle, Plus, Edit, Trash2, Save, X } from "lucide-react";
import { SiFacebook, SiInstagram, SiX, SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", icon: SiFacebook, color: "#1877F2" },
  { id: "instagram", name: "Instagram", icon: SiInstagram, color: "#E4405F" },
  { id: "twitter", name: "X (Twitter)", icon: SiX, color: "#000000" },
  { id: "whatsapp", name: "WhatsApp", icon: SiWhatsapp, color: "#25D366" },
];

const TRAINING_CATEGORIES = [
  { value: "propostas", label: "Propostas" },
  { value: "biografia", label: "Biografia" },
  { value: "contato", label: "Contato" },
  { value: "geral", label: "Geral" },
];

export default function AiAttendance() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<AiTrainingExample | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AiResponseTemplate | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const { toast } = useToast();

  // Queries
  const { data: config, isLoading: loadingConfig } = useQuery<AiConfiguration>({
    queryKey: ["/api/ai-config"],
  });

  const { data: conversations, isLoading: loadingConversations } = useQuery<AiConversation[]>({
    queryKey: ["/api/ai-conversations"],
  });

  const { data: trainingExamples = [], isLoading: loadingExamples } = useQuery<AiTrainingExample[]>({
    queryKey: ["/api/ai-training-examples"],
  });

  const { data: responseTemplates = [], isLoading: loadingTemplates } = useQuery<AiResponseTemplate[]>({
    queryKey: ["/api/ai-response-templates"],
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

  const templateForm = useForm({
    resolver: zodResolver(insertAiResponseTemplateSchema),
    defaultValues: {
      name: "",
      trigger: "",
      response: "",
      platform: "",
      active: true,
    },
  });

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

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai-response-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-response-templates"] });
      toast({ title: "Template criado com sucesso!" });
      setIsTemplateModalOpen(false);
      templateForm.reset();
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (data: { id: string; body: any }) => 
      apiRequest("PATCH", `/api/ai-response-templates/${data.id}`, data.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-response-templates"] });
      toast({ title: "Template atualizado com sucesso!" });
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      templateForm.reset();
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ai-response-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-response-templates"] });
      toast({ title: "Template removido com sucesso!" });
    },
  });

  // OpenAI API Key Mutations
  const saveApiKeyMutation = useMutation({
    mutationFn: (apiKey: string) => apiRequest("POST", "/api/ai-config/openai-key", { apiKey }),
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
    mutationFn: () => apiRequest("DELETE", "/api/ai-config/openai-key"),
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

  const handleSaveTemplate = (data: any) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, body: data });
    } else {
      createTemplateMutation.mutate(data);
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

  const openEditTemplate = (template: AiResponseTemplate) => {
    setEditingTemplate(template);
    templateForm.reset({
      name: template.name,
      trigger: template.trigger,
      response: template.response,
      platform: template.platform || "",
      active: template.active,
    });
    setIsTemplateModalOpen(true);
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
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
          <TabsTrigger value="templates" className="rounded-full">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Plataformas Conectadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLATFORMS.map((platform) => {
                const connected = isConnected(platform.id);
                return (
                  <Card key={platform.id} data-testid={`platform-${platform.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <platform.icon className="w-8 h-8" style={{ color: platform.color }} />
                        {connected ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Conectado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="w-3 h-3 mr-1" />
                            Desconectado
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h3 className="font-semibold mb-2">{platform.name}</h3>
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
                  </div>
                  {config?.hasCustomKey && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Configurada
                    </Badge>
                  )}
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
                      placeholder="sk-..."
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
                            placeholder="Você é um assessor político profissional que responde de forma cordial e informativa..."
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
                            placeholder="Profissional, acessível, empático, objetivo, confiável..."
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
                            placeholder="João Silva, candidato a vereador pelo partido XYZ. Propostas principais: educação, saúde, transporte público..."
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
                            placeholder="Sempre agradeça pelo contato. Evite discussões polêmicas. Forneça informações verificadas..."
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
                          <Badge variant="outline" className="rounded-full">
                            {TRAINING_CATEGORIES.find(c => c.value === example.category)?.label || example.category}
                          </Badge>
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

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Templates de Resposta</CardTitle>
                  <CardDescription>
                    Configure respostas prontas para palavras-chave específicas
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => {
                    setEditingTemplate(null);
                    templateForm.reset();
                    setIsTemplateModalOpen(true);
                  }}
                  className="rounded-full"
                  data-testid="button-add-template"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : responseTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum template de resposta cadastrado
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Palavras-Chave</TableHead>
                      <TableHead>Resposta</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responseTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell className="max-w-xs truncate">{template.trigger}</TableCell>
                        <TableCell className="max-w-xs truncate">{template.response}</TableCell>
                        <TableCell>
                          {template.platform ? (
                            <Badge variant="outline" className="rounded-full">
                              {PLATFORMS.find(p => p.id === template.platform)?.name || template.platform}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-full">Todas</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={template.active}
                            onCheckedChange={(checked) => {
                              updateTemplateMutation.mutate({
                                id: template.id,
                                body: { active: checked }
                              });
                            }}
                            data-testid={`switch-template-${template.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditTemplate(template)}
                              className="rounded-full"
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                              className="rounded-full text-destructive"
                              data-testid={`button-delete-template-${template.id}`}
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
                        placeholder="Qual é sua proposta para a educação?"
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
                        placeholder="Minha proposta para educação inclui..."
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
                          <SelectValue placeholder="Selecione uma categoria" />
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

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsTrainingModalOpen(false);
                    setEditingTraining(null);
                    trainingForm.reset();
                  }}
                  className="rounded-full"
                  data-testid="button-cancel-training"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-full"
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

      {/* Response Template Modal */}
      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Template de Resposta" : "Novo Template de Resposta"}
            </DialogTitle>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit(handleSaveTemplate)} className="space-y-4">
              <FormField
                control={templateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Template</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Saudação Inicial"
                        data-testid="input-template-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={templateForm.control}
                name="trigger"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Palavras-Chave de Ativação</FormLabel>
                    <FormDescription>
                      Palavras ou frases que ativam este template (separadas por vírgula)
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="olá, oi, bom dia, boa tarde, boa noite"
                        className="min-h-[60px]"
                        data-testid="textarea-template-trigger"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={templateForm.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resposta</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Olá! Obrigado por entrar em contato. Como posso ajudá-lo hoje?"
                        className="min-h-[120px]"
                        data-testid="textarea-template-response"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={templateForm.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plataforma</FormLabel>
                    <FormDescription>
                      Deixe vazio para aplicar em todas as plataformas
                    </FormDescription>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-template-platform">
                          <SelectValue placeholder="Todas as plataformas" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Todas as plataformas</SelectItem>
                        {PLATFORMS.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={templateForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Template Ativo</FormLabel>
                      <FormDescription>
                        Este template será usado nas respostas automáticas
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-template-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsTemplateModalOpen(false);
                    setEditingTemplate(null);
                    templateForm.reset();
                  }}
                  className="rounded-full"
                  data-testid="button-cancel-template"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-full"
                  disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                  data-testid="button-save-template"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingTemplate ? "Atualizar" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Platform Configuration Dialog (existing) */}
      <Dialog open={!!selectedPlatform} onOpenChange={() => setSelectedPlatform(null)}>
        {selectedPlatform === "facebook" && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configurar Facebook</DialogTitle>
            </DialogHeader>
            <Form {...platformForm}>
              <form onSubmit={platformForm.handleSubmit(handleSavePlatform)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={platformForm.control}
                    name="facebookAppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App ID</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="123456789" data-testid="input-fb-app-id" />
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
                          <Input {...field} type="password" placeholder="••••••••" data-testid="input-fb-app-secret" />
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
                          <Input {...field} placeholder="987654321" data-testid="input-fb-page-id" />
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
                          <Input {...field} placeholder="Minha Página" data-testid="input-fb-page-name" />
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
                          <Textarea {...field} placeholder="EAABw..." className="min-h-[80px]" data-testid="textarea-fb-token" />
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
                          <Input {...field} placeholder="my-verify-token" data-testid="input-fb-webhook-token" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" className="rounded-full" data-testid="button-save-fb-config">
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