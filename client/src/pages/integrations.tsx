import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Integration, type InsertIntegration, insertIntegrationSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, MessageCircle, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Integrations() {
  const [showSendGridApiKey, setShowSendGridApiKey] = useState(false);
  const [showTwilioAuthToken, setShowTwilioAuthToken] = useState(false);
  const [testingSendGrid, setTestingSendGrid] = useState(false);
  const [testingTwilio, setTestingTwilio] = useState(false);
  const { toast } = useToast();

  // Query for integrations
  const { data: integrations, isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  // SendGrid form
  const sendgridForm = useForm<InsertIntegration>({
    resolver: zodResolver(insertIntegrationSchema),
    defaultValues: {
      service: "sendgrid",
      enabled: false,
      sendgridApiKey: "",
      fromEmail: "",
      fromName: "",
      testMode: false,
    },
  });

  // Twilio form
  const twilioForm = useForm<InsertIntegration>({
    resolver: zodResolver(insertIntegrationSchema),
    defaultValues: {
      service: "twilio",
      enabled: false,
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioPhoneNumber: "",
      testMode: false,
    },
  });

  // Update forms when data is loaded
  const sendgridData = integrations?.find(i => i.service === "sendgrid");
  const twilioData = integrations?.find(i => i.service === "twilio");

  if (sendgridData && sendgridForm.getValues("sendgridApiKey") === "") {
    sendgridForm.reset({
      service: "sendgrid",
      enabled: sendgridData.enabled,
      sendgridApiKey: sendgridData.sendgridApiKey || "",
      fromEmail: sendgridData.fromEmail || "",
      fromName: sendgridData.fromName || "",
      testMode: sendgridData.testMode || false,
    });
  }

  if (twilioData && twilioForm.getValues("twilioAccountSid") === "") {
    twilioForm.reset({
      service: "twilio",
      enabled: twilioData.enabled,
      twilioAccountSid: twilioData.twilioAccountSid || "",
      twilioAuthToken: twilioData.twilioAuthToken || "",
      twilioPhoneNumber: twilioData.twilioPhoneNumber || "",
      testMode: twilioData.testMode || false,
    });
  }

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: InsertIntegration) => apiRequest("POST", "/api/integrations", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ 
        title: `${variables.service === 'sendgrid' ? 'SendGrid' : 'Twilio'} salvo com sucesso!`,
        description: "As configurações foram atualizadas." 
      });
    },
    onError: (_, variables) => {
      toast({ 
        title: `Erro ao salvar ${variables.service === 'sendgrid' ? 'SendGrid' : 'Twilio'}`, 
        variant: "destructive" 
      });
    },
  });

  // Test integrations
  const testIntegration = async (service: string) => {
    if (service === "sendgrid") {
      setTestingSendGrid(true);
    } else {
      setTestingTwilio(true);
    }

    try {
      const response = await apiRequest("POST", `/api/integrations/${service}/test`) as unknown as { message: string };
      toast({ 
        title: response.message,
        description: "A integração está funcionando corretamente!"
      });
    } catch (error: any) {
      toast({ 
        title: "Erro no teste", 
        description: error.details || error.error || "Falha ao testar integração",
        variant: "destructive" 
      });
    } finally {
      setTestingSendGrid(false);
      setTestingTwilio(false);
    }
  };

  const onSubmitSendGrid = (data: InsertIntegration) => {
    saveMutation.mutate(data);
  };

  const onSubmitTwilio = (data: InsertIntegration) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Integrações</h1>
        <p className="text-muted-foreground mt-2">
          Configure as integrações para envio de email e WhatsApp
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* SendGrid Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email - SendGrid
            </CardTitle>
            <CardDescription>
              Configure o envio de emails através do SendGrid
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...sendgridForm}>
              <form onSubmit={sendgridForm.handleSubmit(onSubmitSendGrid)} className="space-y-4">
                <FormField
                  control={sendgridForm.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <FormLabel>Ativar SendGrid</FormLabel>
                        <FormDescription>
                          Habilite para usar SendGrid nas campanhas de email
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-sendgrid-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={sendgridForm.control}
                  name="sendgridApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            value={field.value || ''}
                            type={showSendGridApiKey ? "text" : "password"}
                            placeholder="SG.xxxxxxxxxx"
                            data-testid="input-sendgrid-api-key"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowSendGridApiKey(!showSendGridApiKey)}
                            data-testid="button-toggle-sendgrid-api-key"
                          >
                            {showSendGridApiKey ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Sua chave de API do SendGrid
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={sendgridForm.control}
                  name="fromEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email do Remetente</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ''}
                          type="email"
                          placeholder="seu@email.com"
                          data-testid="input-sendgrid-from-email"
                        />
                      </FormControl>
                      <FormDescription>
                        Email que aparecerá como remetente
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={sendgridForm.control}
                  name="fromName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Remetente</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ''}
                          placeholder="Seu Nome"
                          data-testid="input-sendgrid-from-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Nome que aparecerá como remetente
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={sendgridForm.control}
                  name="testMode"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Modo de Teste</FormLabel>
                        <FormDescription>
                          Ativa o modo sandbox (não envia emails reais)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-sendgrid-test-mode"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testIntegration("sendgrid")}
                    disabled={testingSendGrid || !sendgridForm.getValues("sendgridApiKey")}
                    data-testid="button-test-sendgrid"
                  >
                    {testingSendGrid ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Testar Conexão
                      </>
                    )}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    data-testid="button-save-sendgrid"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar Configurações"
                    )}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground pt-4 border-t">
                  <p className="mb-2">
                    <strong>Como obter as credenciais:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Acesse <a href="https://sendgrid.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">sendgrid.com</a></li>
                    <li>Crie uma conta gratuita ou faça login</li>
                    <li>Vá em Settings → API Keys</li>
                    <li>Crie uma nova API Key com permissão "Full Access"</li>
                    <li>Copie a chave e cole acima</li>
                  </ol>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Twilio Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              WhatsApp - Twilio
            </CardTitle>
            <CardDescription>
              Configure o envio de mensagens WhatsApp através do Twilio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...twilioForm}>
              <form onSubmit={twilioForm.handleSubmit(onSubmitTwilio)} className="space-y-4">
                <FormField
                  control={twilioForm.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <FormLabel>Ativar Twilio</FormLabel>
                        <FormDescription>
                          Habilite para usar Twilio nas campanhas de WhatsApp
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-twilio-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={twilioForm.control}
                  name="twilioAccountSid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account SID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ''}
                          placeholder="ACxxxxxxxxxx"
                          data-testid="input-twilio-account-sid"
                        />
                      </FormControl>
                      <FormDescription>
                        Identificador da sua conta Twilio
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={twilioForm.control}
                  name="twilioAuthToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Auth Token</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            value={field.value || ''}
                            type={showTwilioAuthToken ? "text" : "password"}
                            placeholder="xxxxxxxxxx"
                            data-testid="input-twilio-auth-token"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowTwilioAuthToken(!showTwilioAuthToken)}
                            data-testid="button-toggle-twilio-auth-token"
                          >
                            {showTwilioAuthToken ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Token de autenticação da sua conta
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={twilioForm.control}
                  name="twilioPhoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número do WhatsApp</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ''}
                          placeholder="whatsapp:+5511999999999"
                          data-testid="input-twilio-phone-number"
                        />
                      </FormControl>
                      <FormDescription>
                        Formato: whatsapp:+5511999999999
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={twilioForm.control}
                  name="testMode"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Modo de Teste</FormLabel>
                        <FormDescription>
                          Ativa o modo de desenvolvimento
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-twilio-test-mode"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testIntegration("twilio")}
                    disabled={testingTwilio || !twilioForm.getValues("twilioAccountSid")}
                    data-testid="button-test-twilio"
                  >
                    {testingTwilio ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Testar Conexão
                      </>
                    )}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    data-testid="button-save-twilio"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar Configurações"
                    )}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground pt-4 border-t">
                  <p className="mb-2">
                    <strong>Como obter as credenciais:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Acesse <a href="https://www.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">twilio.com</a></li>
                    <li>Crie uma conta ou faça login</li>
                    <li>No Console, encontre Account SID e Auth Token</li>
                    <li>Configure um número WhatsApp Business</li>
                    <li>Copie as credenciais e cole acima</li>
                  </ol>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Informações Importantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• As credenciais são armazenadas de forma segura e criptografada</li>
            <li>• O modo de teste permite validar as configurações sem enviar mensagens reais</li>
            <li>• Certifique-se de ter uma conta verificada nos serviços antes de configurar</li>
            <li>• Para WhatsApp Business, você precisa de aprovação do Facebook/Meta</li>
            <li>• Taxas de envio podem ser aplicadas conforme seu plano em cada serviço</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}