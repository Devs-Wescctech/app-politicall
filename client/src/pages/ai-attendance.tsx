import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type AiConfiguration, type AiConversation, insertAiConfigurationSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Settings, CheckCircle2, XCircle } from "lucide-react";
import { SiFacebook, SiInstagram, SiX, SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", icon: SiFacebook, color: "#1877F2" },
  { id: "instagram", name: "Instagram", icon: SiInstagram, color: "#E4405F" },
  { id: "twitter", name: "X (Twitter)", icon: SiX, color: "#000000" },
  { id: "whatsapp", name: "WhatsApp", icon: SiWhatsapp, color: "#25D366" },
];

export default function AiAttendance() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: config, isLoading: loadingConfig } = useQuery<AiConfiguration>({
    queryKey: ["/api/ai-config"],
  });

  const { data: conversations, isLoading: loadingConversations } = useQuery<AiConversation[]>({
    queryKey: ["/api/ai-conversations"],
  });

  const form = useForm({
    resolver: zodResolver(insertAiConfigurationSchema),
    defaultValues: {
      mode: config?.mode || "compliance",
      facebookToken: "",
      facebookPageId: "",
      instagramToken: "",
      instagramAccountId: "",
      twitterToken: "",
      twitterTokenSecret: "",
      whatsappToken: "",
      whatsappPhoneId: "",
    },
  });

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

  const handleSavePlatform = (data: any) => {
    updateConfigMutation.mutate(data);
  };

  const isConnected = (platform: string) => {
    if (!config) return false;
    switch (platform) {
      case "facebook":
        return !!(config.facebookToken && config.facebookPageId);
      case "instagram":
        return !!(config.instagramToken && config.instagramAccountId);
      case "twitter":
        return !!(config.twitterToken && config.twitterTokenSecret);
      case "whatsapp":
        return !!(config.whatsappToken && config.whatsappPhoneId);
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

      <div>
        <h2 className="text-xl font-semibold mb-4">Plataformas Conectadas</h2>
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
                <CardContent className="space-y-3">
                  <h3 className="font-semibold">{platform.name}</h3>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setSelectedPlatform(platform.id)}
                    data-testid={`button-configure-${platform.id}`}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitor de Conversas</CardTitle>
          <CardDescription>Últimas interações da IA</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              {PLATFORMS.map((platform) => (
                <TabsTrigger key={platform.id} value={platform.id}>
                  <platform.icon className="w-4 h-4 mr-2" />
                  {platform.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all" className="space-y-3 mt-4">
              {loadingConversations ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
              ) : conversations && conversations.length > 0 ? (
                conversations.map((conversation) => {
                  const platform = PLATFORMS.find((p) => p.id === conversation.platform);
                  return (
                    <Card key={conversation.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {platform && <platform.icon className="w-4 h-4" style={{ color: platform.color }} />}
                            <span className="font-medium">{platform?.name}</span>
                            <Badge variant="secondary">{conversation.mode === "compliance" ? "TSE" : "Formal"}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(conversation.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {conversation.postContent && (
                          <div className="bg-muted p-3 rounded-lg text-sm">
                            <p className="text-muted-foreground text-xs mb-1">Contexto da publicação:</p>
                            <p>{conversation.postContent}</p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">Usuário:</p>
                            <p className="text-sm">{conversation.userMessage}</p>
                          </div>
                          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">IA:</p>
                            <p className="text-sm">{conversation.aiResponse}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma conversa registrada ainda
                </div>
              )}
            </TabsContent>
            {PLATFORMS.map((platform) => (
              <TabsContent key={platform.id} value={platform.id} className="mt-4">
                <div className="text-center py-8 text-muted-foreground">
                  Filtrando conversas de {platform.name}...
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!selectedPlatform} onOpenChange={(open) => !open && setSelectedPlatform(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Configurar {PLATFORMS.find((p) => p.id === selectedPlatform)?.name}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSavePlatform)} className="space-y-4">
              {selectedPlatform === "facebook" && (
                <>
                  <FormField
                    control={form.control}
                    name="facebookToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token de Acesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Token da API do Facebook" type="password" data-testid="input-facebook-token" {...field} />
                        </FormControl>
                        <FormDescription>Token de acesso da API do Facebook Graph</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="facebookPageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID da Página</FormLabel>
                        <FormControl>
                          <Input placeholder="ID da sua página" data-testid="input-facebook-page-id" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {selectedPlatform === "instagram" && (
                <>
                  <FormField
                    control={form.control}
                    name="instagramToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token de Acesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Token da API do Instagram" type="password" data-testid="input-instagram-token" {...field} />
                        </FormControl>
                        <FormDescription>Token de acesso da Instagram Graph API</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="instagramAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID da Conta</FormLabel>
                        <FormControl>
                          <Input placeholder="ID da sua conta comercial" data-testid="input-instagram-account-id" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {selectedPlatform === "twitter" && (
                <>
                  <FormField
                    control={form.control}
                    name="twitterToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token</FormLabel>
                        <FormControl>
                          <Input placeholder="Token de acesso do X" type="password" data-testid="input-twitter-token" {...field} />
                        </FormControl>
                        <FormDescription>Access Token da API v2 do X (Twitter)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="twitterTokenSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token Secret</FormLabel>
                        <FormControl>
                          <Input placeholder="Secret do token" type="password" data-testid="input-twitter-secret" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {selectedPlatform === "whatsapp" && (
                <>
                  <FormField
                    control={form.control}
                    name="whatsappToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token de Acesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Token da API do WhatsApp Business" type="password" data-testid="input-whatsapp-token" {...field} />
                        </FormControl>
                        <FormDescription>Token da WhatsApp Business API</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="whatsappPhoneId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID do Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="ID do número de telefone" data-testid="input-whatsapp-phone-id" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <DialogFooter>
                <Button type="submit" disabled={updateConfigMutation.isPending} data-testid="button-save-platform-config">
                  {updateConfigMutation.isPending ? "Salvando..." : "Salvar Configuração"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
