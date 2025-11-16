import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type MarketingCampaign, type InsertMarketingCampaign, insertMarketingCampaignSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Mail, MessageCircle, Send, Calendar as CalendarIcon } from "lucide-react";
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

export default function Marketing() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/campaigns"],
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

  const createMutation = useMutation({
    mutationFn: (data: InsertMarketingCampaign) => apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha criada com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
      setRecipientsText("");
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Campanha</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                  <FormLabel>Destinatários *</FormLabel>
                  <Textarea
                    placeholder={campaignType === "email" ? "email1@exemplo.com, email2@exemplo.com" : "+5511999999999, +5511888888888"}
                    rows={4}
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    className="mt-2"
                    data-testid="input-recipients"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Separe múltiplos {campaignType === "email" ? "emails" : "telefones"} com vírgula, ponto e vírgula ou quebra de linha
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="scheduledFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agendar Envio (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          data-testid="input-schedule"
                          {...field}
                          value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
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
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="draft">Rascunhos</TabsTrigger>
          <TabsTrigger value="scheduled">Agendadas</TabsTrigger>
          <TabsTrigger value="sent">Enviadas</TabsTrigger>
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

        {["draft", "scheduled", "sent"].map((status) => (
          <TabsContent key={status} value={status} className="mt-6">
            <div className="text-center py-8 text-muted-foreground">
              Mostrando campanhas com status: {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
