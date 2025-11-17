import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type MarketingCampaign, type InsertMarketingCampaign, insertMarketingCampaignSchema, type Contact, type PoliticalAlliance, type Integration, type InsertIntegration, insertIntegrationSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Mail, MessageCircle, Send, Calendar as CalendarIcon, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  draft: { label: "Rascunho", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  scheduled: { label: "Agendado", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  sent: { label: "Enviado", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  failed: { label: "Falhou", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

// Component for date and time input fields
function DateTimeInput({ field }: { field: any }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  
  // Parse existing value if it exists
  useEffect(() => {
    if (field.value) {
      const dt = new Date(field.value);
      setDate(dt.toISOString().split('T')[0]);
      setTime(dt.toTimeString().slice(0,5));
    }
  }, [field.value]);
  
  // Combine date and time when either changes
  const updateDateTime = (newDate: string, newTime: string) => {
    if (newDate && newTime) {
      const combined = new Date(`${newDate}T${newTime}`);
      field.onChange(combined.toISOString());
    } else {
      field.onChange(undefined);
    }
  };
  
  return (
    <FormItem>
      <FormLabel>Agendar Envio (Opcional)</FormLabel>
      <div className="grid grid-cols-2 gap-2">
        <FormControl>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              updateDateTime(e.target.value, time);
            }}
            data-testid="input-schedule-date"
            placeholder="DD/MM/AAAA"
          />
        </FormControl>
        <FormControl>
          <Input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              updateDateTime(date, e.target.value);
            }}
            data-testid="input-schedule-time"
            placeholder="HH:MM"
          />
        </FormControl>
      </div>
      <FormDescription>
        Selecione a data e horário para envio programado
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
}

export default function Marketing() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [recipientType, setRecipientType] = useState<"manual" | "voters" | "alliance" | "all">("manual");
  
  // Integration states
  const [showSendGridApiKey, setShowSendGridApiKey] = useState(false);
  const [showTwilioAuthToken, setShowTwilioAuthToken] = useState(false);
  const [testingSendGrid, setTestingSendGrid] = useState(false);
  const [testingTwilio, setTestingTwilio] = useState(false);
  
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/campaigns"],
  });
  
  // Query for integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  // Query for contacts
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: recipientType === "voters" || recipientType === "all",
  });

  // Query for political alliances
  const { data: alliances } = useQuery<PoliticalAlliance[]>({
    queryKey: ["/api/alliances"],
    enabled: recipientType === "alliance" || recipientType === "all",
  });

  const form = useForm<InsertMarketingCampaign>({
    resolver: zodResolver(insertMarketingCampaignSchema),
    defaultValues: {
      name: "",
      type: "email",
      subject: "",
      message: "",
      recipients: [],
      scheduledFor: undefined,
      status: "draft",
    },
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

  const createMutation = useMutation({
    mutationFn: (data: InsertMarketingCampaign) => apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha criada com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
      setRecipientsText("");
      setRecipientType("manual");
    },
    onError: () => {
      toast({ title: "Erro ao criar campanha", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/campaigns/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha enviada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao enviar campanha", variant: "destructive" });
    },
  });

  // Save mutation for integrations
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

  const handleSubmit = (data: InsertMarketingCampaign) => {
    const recipients = recipientsText
      .split(/[,;\n]/)
      .map((r) => r.trim())
      .filter((r) => r);
    
    createMutation.mutate({
      ...data,
      recipients,
    });
  };

  const handleSend = (id: string) => {
    if (confirm("Tem certeza que deseja enviar esta campanha?")) {
      sendMutation.mutate(id);
    }
  };

  const campaignType = form.watch("type");

  // Automatically populate recipients based on selection
  useEffect(() => {
    if (recipientType === "manual") {
      setRecipientsText(""); // Clear field for manual entry
      return;
    }
    
    let recipients: string[] = [];
    
    if (recipientType === "voters" && contacts) {
      recipients = campaignType === "email" 
        ? contacts.filter(c => c.email).map(c => c.email!)
        : contacts.filter(c => c.phone).map(c => c.phone!);
    } else if (recipientType === "alliance" && alliances) {
      // Alliances have direct email and phone fields
      recipients = campaignType === "email"
        ? alliances.filter(a => a.email).map(a => a.email!)
        : alliances.filter(a => a.phone).map(a => a.phone!);
    } else if (recipientType === "all") {
      const voterRecipients = contacts ? (campaignType === "email" 
        ? contacts.filter(c => c.email).map(c => c.email!)
        : contacts.filter(c => c.phone).map(c => c.phone!)) : [];
      
      const allianceRecipients = alliances ? (campaignType === "email"
        ? alliances.filter(a => a.email).map(a => a.email!)
        : alliances.filter(a => a.phone).map(a => a.phone!)) : [];
      
      // Remove duplicados usando Set
      recipients = [...new Set([...voterRecipients, ...allianceRecipients])];
    }
    
    setRecipientsText(recipients.join(", "));
  }, [recipientType, contacts, alliances, campaignType]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketing</h1>
          <p className="text-muted-foreground mt-2">Disparos em massa por email e WhatsApp</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-campaign">
            <Plus className="w-4 h-4 mr-2" />
            Nova Campanha
          </Button>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Nova Campanha</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Campanha *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Newsletter Mensal" data-testid="input-campaign-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-campaign-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="email">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                Email
                              </div>
                            </SelectItem>
                            <SelectItem value="whatsapp">
                              <div className="flex items-center gap-2">
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {campaignType === "email" && (
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assunto *</FormLabel>
                        <FormControl>
                          <Input placeholder="Assunto do email" data-testid="input-subject" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem *</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={campaignType === "email" ? "Conteúdo do email" : "Mensagem do WhatsApp"} 
                          rows={6}
                          data-testid="input-message"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Tipo de Destinatários *</FormLabel>
                  <RadioGroup
                    value={recipientType}
                    onValueChange={(value: "manual" | "voters" | "alliance" | "all") => setRecipientType(value)}
                    className="flex flex-wrap gap-4 mt-2 mb-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="manual" id="manual" />
                      <Label htmlFor="manual">Manual</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="voters" id="voters" />
                      <Label htmlFor="voters">Lista de Eleitores</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="alliance" id="alliance" />
                      <Label htmlFor="alliance">Lista de Aliança Política</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="all" />
                      <Label htmlFor="all">Todos</Label>
                    </div>
                  </RadioGroup>

                  <FormLabel>Destinatários *</FormLabel>
                  <Textarea
                    placeholder={campaignType === "email" ? "email1@exemplo.com, email2@exemplo.com" : "+5511999999999, +5511888888888"}
                    rows={4}
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    className="mt-2"
                    data-testid="input-recipients"
                    disabled={recipientType !== "manual"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {recipientType === "manual" 
                      ? `Separe múltiplos ${campaignType === "email" ? "emails" : "telefones"} com vírgula, ponto e vírgula ou quebra de linha`
                      : `${recipientsText.split(",").filter(r => r.trim()).length} ${campaignType === "email" ? "emails" : "telefones"} selecionados`}
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="scheduledFor"
                  render={({ field }) => (
                    <DateTimeInput field={field} />
                  )}
                />
                </div>
                <DialogFooter className="px-6 py-4 border-t gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      form.setValue("status", "draft");
                      form.handleSubmit(handleSubmit)();
                    }}
                    disabled={createMutation.isPending}
                    data-testid="button-save-draft"
                  >
                    Salvar Rascunho
                  </Button>
                  <Button 
                    type="submit" 
                    onClick={() => form.setValue("status", form.watch("scheduledFor") ? "scheduled" : "draft")}
                    disabled={createMutation.isPending}
                    data-testid="button-save-campaign"
                  >
                    {createMutation.isPending ? "Salvando..." : "Criar Campanha"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="rounded-full">
          <TabsTrigger value="all" className="rounded-full">Todas</TabsTrigger>
          <TabsTrigger value="draft" className="rounded-full">Rascunhos</TabsTrigger>
          <TabsTrigger value="scheduled" className="rounded-full">Agendadas</TabsTrigger>
          <TabsTrigger value="sent" className="rounded-full">Enviadas</TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-full">Integrações</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-6">
          {isLoading ? (
            [...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : campaigns && campaigns.length > 0 ? (
            campaigns.map((campaign) => (
              <Card key={campaign.id} data-testid={`campaign-${campaign.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        <Badge className={STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.color}>
                          {STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.label}
                        </Badge>
                        <Badge variant="outline">
                          {campaign.type === "email" ? (
                            <><Mail className="w-3 h-3 mr-1" /> Email</>
                          ) : (
                            <><MessageCircle className="w-3 h-3 mr-1" /> WhatsApp</>
                          )}
                        </Badge>
                      </div>
                      {campaign.subject && (
                        <p className="text-sm text-muted-foreground">Assunto: {campaign.subject}</p>
                      )}
                    </div>
                    {campaign.status === "draft" && (
                      <Button onClick={() => handleSend(campaign.id)} disabled={sendMutation.isPending} data-testid={`button-send-${campaign.id}`}>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar Agora
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm line-clamp-2">{campaign.message}</p>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                    <span>👥 {Array.isArray(campaign.recipients) ? campaign.recipients.length : 0} destinatários</span>
                    {campaign.scheduledFor && (
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        Agendado para {format(new Date(campaign.scheduledFor), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    )}
                    {campaign.sentAt && (
                      <span>
                        ✓ Enviado em {format(new Date(campaign.sentAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Nenhuma campanha criada. Clique em "Nova Campanha" para começar.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {["draft", "scheduled", "sent"].map((status) => {
          const filteredCampaigns = campaigns?.filter(c => c.status === status) || [];
          
          return (
            <TabsContent key={status} value={status} className="space-y-4 mt-6">
              {isLoading ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
              ) : filteredCampaigns.length > 0 ? (
                filteredCampaigns.map((campaign) => (
                  <Card key={campaign.id} data-testid={`campaign-${campaign.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <CardTitle className="text-lg">{campaign.name}</CardTitle>
                            <Badge className={STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.color}>
                              {STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.label}
                            </Badge>
                            <Badge variant="outline">
                              {campaign.type === "email" ? (
                                <><Mail className="w-3 h-3 mr-1" /> Email</>
                              ) : (
                                <><MessageCircle className="w-3 h-3 mr-1" /> WhatsApp</>
                              )}
                            </Badge>
                          </div>
                          {campaign.subject && (
                            <p className="text-sm text-muted-foreground">Assunto: {campaign.subject}</p>
                          )}
                        </div>
                        {campaign.status === "draft" && (
                          <Button onClick={() => handleSend(campaign.id)} disabled={sendMutation.isPending} data-testid={`button-send-${campaign.id}`}>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar Agora
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm line-clamp-2">{campaign.message}</p>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                        <span>👥 {Array.isArray(campaign.recipients) ? campaign.recipients.length : 0} destinatários</span>
                        {campaign.scheduledFor && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-4 h-4" />
                            Agendado para {format(new Date(campaign.scheduledFor), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        {campaign.sentAt && (
                          <span>
                            ✓ Enviado em {format(new Date(campaign.sentAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground">
                    Nenhuma campanha {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label.toLowerCase()}.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6 mt-6">
          {integrationsLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold" data-testid="text-integrations-title">Integrações</h2>
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
