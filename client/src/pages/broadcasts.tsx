import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Send, Plus, Trash2, Play, Mail, Phone, MessageSquare,
  Clock, CheckCircle2, XCircle, FileText, Users, AlertCircle
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { UserPermissions } from "@shared/schema";

type Campaign = {
  id: string;
  name: string;
  type: string;
  subject?: string | null;
  message: string;
  recipients: string[];
  status: string;
  sentAt?: string | null;
  createdAt: string;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  scheduled: { label: "Agendada", variant: "outline" },
  sent: { label: "Enviada", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant} data-testid={`badge-status-${status}`}>{s.label}</Badge>;
}

function TypeIcon({ type }: { type: string }) {
  if (type === "whatsapp") return <SiWhatsapp className="w-4 h-4 text-green-600" />;
  if (type === "email") return <Mail className="w-4 h-4 text-blue-500" />;
  return <Phone className="w-4 h-4 text-purple-500" />;
}

function StatsRow({ campaigns }: { campaigns: Campaign[] }) {
  const total = campaigns.length;
  const sent = campaigns.filter((c) => c.status === "sent").length;
  const draft = campaigns.filter((c) => c.status === "draft").length;
  const failed = campaigns.filter((c) => c.status === "failed").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total", value: total, icon: FileText, color: "text-foreground" },
        { label: "Enviadas", value: sent, icon: CheckCircle2, color: "text-green-600" },
        { label: "Rascunhos", value: draft, icon: Clock, color: "text-muted-foreground" },
        { label: "Falhas", value: failed, icon: XCircle, color: "text-destructive" },
      ].map(({ label, value, icon: Icon, color }) => (
        <Card key={label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-semibold mt-1" data-testid={`stat-${label.toLowerCase()}`}>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CampaignTable({
  campaigns,
  isLoading,
  onSend,
  onDelete,
  isSending,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  onSend: (id: string) => void;
  onDelete: (id: string) => void;
  isSending: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Send className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium mb-1">Nenhuma campanha neste canal</p>
        <p className="text-xs text-muted-foreground">Crie uma nova campanha para começar</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {campaigns.map((c) => (
        <Card key={c.id} data-testid={`card-campaign-${c.id}`}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3 flex-wrap">
              <TypeIcon type={c.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate" data-testid={`text-campaign-name-${c.id}`}>{c.name}</p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {Array.isArray(c.recipients) ? c.recipients.length : 0} destinatários
                  </span>
                  <span>
                    {c.sentAt
                      ? `Enviada em ${format(new Date(c.sentAt), "dd/MM/yyyy", { locale: ptBR })}`
                      : `Criada em ${format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full h-8 text-xs"
                    disabled={isSending}
                    onClick={() => onSend(c.id)}
                    data-testid={`button-send-${c.id}`}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Disparar
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(c.id)}
                  data-testid={`button-delete-${c.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const campaignSchema = z.object({
  name: z.string().min(3, "Nome deve ter ao menos 3 caracteres"),
  type: z.enum(["whatsapp", "email", "sms"]),
  subject: z.string().optional(),
  message: z.string().min(5, "Mensagem deve ter ao menos 5 caracteres"),
  recipients: z.string().min(1, "Adicione ao menos um destinatário"),
});
type CampaignForm = z.infer<typeof campaignSchema>;

function CreateCampaignDialog({
  open,
  onClose,
  defaultType,
  allowedTypes,
}: {
  open: boolean;
  onClose: () => void;
  defaultType: string;
  allowedTypes: string[];
}) {
  const { toast } = useToast();
  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: "", type: defaultType as any, subject: "", message: "", recipients: "" },
  });

  const watchType = form.watch("type");

  const mutation = useMutation({
    mutationFn: async (data: CampaignForm) => {
      const recipientsList = data.recipients
        .split(/[\n,;]+/)
        .map((r) => r.trim())
        .filter(Boolean);

      return apiRequest("POST", "/api/campaigns", {
        name: data.name,
        type: data.type,
        subject: data.subject || null,
        message: data.message,
        recipients: recipientsList,
        status: "draft",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha criada", description: "Rascunho salvo. Revise e dispare quando estiver pronto." });
      form.reset();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar campanha", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0" data-testid="dialog-create-campaign">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto px-6 py-4 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da campanha</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Campanha de junho" {...field} data-testid="input-campaign-name" />
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
                    <FormLabel>Canal</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-campaign-type">
                          <SelectValue placeholder="Selecione o canal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allowedTypes.includes("whatsapp") && (
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        )}
                        {allowedTypes.includes("email") && (
                          <SelectItem value="email">E-mail</SelectItem>
                        )}
                        {allowedTypes.includes("sms") && (
                          <SelectItem value="sms">SMS</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchType === "email" && (
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assunto do e-mail</FormLabel>
                      <FormControl>
                        <Input placeholder="Assunto" {...field} data-testid="input-campaign-subject" />
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
                    <FormLabel>Mensagem</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Escreva a mensagem da campanha..."
                        rows={5}
                        {...field}
                        data-testid="textarea-campaign-message"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipients"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Destinatários
                      <span className="text-muted-foreground font-normal ml-1 text-xs">
                        (um por linha, vírgula ou ponto e vírgula)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          watchType === "email"
                            ? "email@exemplo.com\nemail2@exemplo.com"
                            : "+5511999999999\n+5511988888888"
                        }
                        rows={4}
                        {...field}
                        data-testid="textarea-campaign-recipients"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="px-6 py-4 border-t">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={mutation.isPending} data-testid="button-save-campaign">
                {mutation.isPending ? "Salvando..." : "Salvar rascunho"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Broadcasts() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { toast } = useToast();
  const permissions = user?.permissions as UserPermissions | undefined;

  const hasWhatsApp = permissions?.whatsappBroadcast === true;
  const hasEmail = permissions?.emailBroadcast === true;
  const hasSms = permissions?.smsBroadcast === true;
  const hasAny = hasWhatsApp || hasEmail || hasSms;

  const allowedTypes = [
    ...(hasWhatsApp ? ["whatsapp"] : []),
    ...(hasEmail ? ["email"] : []),
    ...(hasSms ? ["sms"] : []),
  ];

  const defaultType = hasWhatsApp ? "whatsapp" : hasEmail ? "email" : "sms";
  const defaultTab = defaultType;

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
    enabled: hasAny,
  });

  const { data: moduleStatus = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/modules/status"],
    enabled: hasAny,
  });

  const pendingChannels = allowedTypes.filter(t => {
    const key = t === "whatsapp" ? "whatsappBroadcast" : t === "email" ? "emailBroadcast" : "smsBroadcast";
    return moduleStatus[key] === "pending_configuration";
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/campaigns/${id}/send`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha enviada", description: "O disparo foi realizado com sucesso." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha removida" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!userLoading && user && !hasAny) {
      setLocation("/dashboard");
    }
  }, [userLoading, user, hasAny, setLocation]);

  if (userLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!hasAny) return null;

  const filtered = (type: string) => campaigns.filter((c) => c.type === type);

  return (
    <div className="p-6 space-y-6" data-testid="page-broadcasts">
      {pendingChannels.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300" data-testid="alert-pending-configuration">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Configuração pendente:</strong> Os canais{" "}
            <strong>{pendingChannels.join(", ")}</strong> estão habilitados mas ainda não possuem integração configurada.{" "}
            Acesse <strong>Admin Master &gt; Vendas &gt; Integracoes</strong> para configurar por empresa.
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Send className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-broadcasts-title">Disparos</h1>
            <p className="text-xs text-muted-foreground">Campanhas de mensagens em massa</p>
          </div>
        </div>
        <Button
          className="rounded-full"
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-campaign"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova campanha
        </Button>
      </div>

      <StatsRow campaigns={campaigns} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-full p-1">
          {hasWhatsApp && (
            <TabsTrigger value="whatsapp" className="rounded-full gap-2" data-testid="tab-whatsapp-broadcasts">
              <SiWhatsapp className="w-3.5 h-3.5" />
              WhatsApp
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {filtered("whatsapp").length}
              </Badge>
            </TabsTrigger>
          )}
          {hasEmail && (
            <TabsTrigger value="email" className="rounded-full gap-2" data-testid="tab-email-broadcasts">
              <Mail className="w-3.5 h-3.5" />
              E-mail
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {filtered("email").length}
              </Badge>
            </TabsTrigger>
          )}
          {hasSms && (
            <TabsTrigger value="sms" className="rounded-full gap-2" data-testid="tab-sms-broadcasts">
              <MessageSquare className="w-3.5 h-3.5" />
              SMS
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {filtered("sms").length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {hasWhatsApp && (
          <TabsContent value="whatsapp" className="mt-4">
            <CampaignTable
              campaigns={filtered("whatsapp")}
              isLoading={isLoading}
              onSend={(id) => sendMutation.mutate(id)}
              onDelete={(id) => setDeleteId(id)}
              isSending={sendMutation.isPending}
            />
          </TabsContent>
        )}
        {hasEmail && (
          <TabsContent value="email" className="mt-4">
            <CampaignTable
              campaigns={filtered("email")}
              isLoading={isLoading}
              onSend={(id) => sendMutation.mutate(id)}
              onDelete={(id) => setDeleteId(id)}
              isSending={sendMutation.isPending}
            />
          </TabsContent>
        )}
        {hasSms && (
          <TabsContent value="sms" className="mt-4">
            <CampaignTable
              campaigns={filtered("sms")}
              isLoading={isLoading}
              onSend={(id) => sendMutation.mutate(id)}
              onDelete={(id) => setDeleteId(id)}
              isSending={sendMutation.isPending}
            />
          </TabsContent>
        )}
      </Tabs>

      <CreateCampaignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultType={defaultType}
        allowedTypes={allowedTypes}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A campanha será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
