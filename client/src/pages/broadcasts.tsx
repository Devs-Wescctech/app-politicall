import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Send, Plus, Trash2, Play, Pause, Ban, Mail, Phone, MessageSquare,
  Clock, CheckCircle2, XCircle, FileText, Users, AlertCircle, Download,
  Copy, BarChart3, Pencil,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormLabel } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/ui/data-pagination";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { UserPermissions } from "@shared/schema";
import { BROADCAST_PERMISSION_KEYS } from "@shared/schema";
import { CampaignWizard } from "@/components/campaign-wizard";
import type { PaginatedResult } from "@shared/pagination";

// ─── Types ────────────────────────────────────────────────────────────────────
type CampaignSendConfig = {
  ratePerMinute?: number; ratePerHour?: number; intervalMs?: number;
  batchSize?: number; maxRetries?: number;
  window?: { start?: string; end?: string; businessHoursOnly?: boolean; timezoneOffsetMinutes?: number };
};
type Campaign = {
  id: string; name: string; type: string; subject?: string | null;
  message: string; recipients: string[]; status: string;
  sentAt?: string | null; scheduledFor?: string | null;
  sendConfig?: CampaignSendConfig | null; cancelReason?: string | null; createdAt: string;
};
type CampaignProgress = Record<string, { total: number; sent: number; failed: number; pending: number; cancelled: number }>;
type CampaignStatusCounts = { total: number; sent: number; draft: number; failed: number };
// Backend returns a paginated object; keep a defensive union for a legacy flat array.
type CampaignsResponse = (PaginatedResult<Campaign> & { statusCounts?: CampaignStatusCounts }) | Campaign[];

function extractCampaigns(r: CampaignsResponse | undefined): Campaign[] {
  if (!r) return [];
  return Array.isArray(r) ? r : r.data ?? [];
}

const ACTIVE_STATUSES = ["em_envio", "agendada", "pausada"];
const DEFAULT_PAGE_SIZE = 20;

const LEGACY_STATUS_MAP: Record<string, string> = {
  draft: "rascunho", scheduled: "agendada", sending: "em_envio", paused: "pausada",
  sent: "enviada", partially_sent: "parcialmente_enviada", failed: "falhou",
  cancelled: "cancelada", canceled: "cancelada",
};

function normalizeStatus(s: string): string { return LEGACY_STATUS_MAP[s] ?? s; }

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  agendada: { label: "Agendada", variant: "outline" },
  em_envio: { label: "Em envio", variant: "outline" },
  pausada: { label: "Pausada", variant: "outline" },
  enviada: { label: "Enviada", variant: "default" },
  parcialmente_enviada: { label: "Parcialmente enviada", variant: "outline" },
  falhou: { label: "Falhou", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const key = normalizeStatus(status);
  const s = STATUS_MAP[key] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant} data-testid={`badge-status-${key}`}>{s.label}</Badge>;
}

function TypeIcon({ type }: { type: string }) {
  if (type === "whatsapp") return <SiWhatsapp className="w-4 h-4 text-green-600" />;
  if (type === "whatsapp_oficial") return <SiWhatsapp className="w-4 h-4 text-sky-600" />;
  if (type === "email") return <Mail className="w-4 h-4 text-blue-500" />;
  return <Phone className="w-4 h-4 text-purple-500" />;
}

// ─── Stats row ────────────────────────────────────────────────────────────────
function StatsRow({ counts }: { counts: { total: number; sent: number; draft: number; failed: number } }) {
  const { total, sent, draft, failed } = counts;
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

// ─── Campaign table ───────────────────────────────────────────────────────────
function CampaignTable({
  campaigns, isLoading, onSend, onDelete, onExport, onPause, onResume,
  onCancel, onDuplicate, onEdit, onView, isSending, progress, busyId, isFiltered,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  onSend: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (c: Campaign) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (c: Campaign) => void;
  onDuplicate: (id: string) => void;
  onEdit: (c: Campaign) => void;
  onView: (id: string) => void;
  isSending: boolean;
  progress: CampaignProgress;
  busyId: string | null | false;
  isFiltered: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground" data-testid="empty-state-campaigns">
        <Send className="w-10 h-10 opacity-20" />
        <div className="text-center">
          {isFiltered ? (
            <>
              <p className="font-medium">Nenhum resultado encontrado para este filtro.</p>
              <p className="text-sm mt-0.5">Ajuste a busca ou o canal para ver mais campanhas.</p>
            </>
          ) : (
            <>
              <p className="font-medium">Nenhuma campanha criada ainda.</p>
              <p className="text-sm mt-0.5">Crie uma nova campanha para começar a disparar mensagens.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {campaigns.map((c) => {
        const status = normalizeStatus(c.status);
        const prog = progress[c.id];
        const processed = prog ? prog.sent + prog.failed + prog.cancelled : 0;
        const pct = prog && prog.total > 0 ? Math.round((processed / prog.total) * 100) : 0;
        const showProgress = !!prog && prog.total > 0 && ["em_envio", "pausada", "enviada", "parcialmente_enviada", "cancelada"].includes(status);
        const isBusy = busyId === c.id;
        const recipientCount = Array.isArray(c.recipients) ? c.recipients.length : 0;
        return (
          <Card key={c.id} data-testid={`card-campaign-${c.id}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3 flex-wrap">
                <TypeIcon type={c.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate" data-testid={`text-campaign-name-${c.id}`}>{c.name}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {recipientCount.toLocaleString("pt-BR")} destinatários
                    </span>
                    {status === "agendada" && c.scheduledFor ? (
                      <span className="flex items-center gap-1" data-testid={`text-scheduled-${c.id}`}>
                        <Clock className="w-3 h-3" />
                        Agendada para {format(new Date(c.scheduledFor), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    ) : (
                      <span>
                        {c.sentAt
                          ? `Enviada em ${format(new Date(c.sentAt), "dd/MM/yyyy", { locale: ptBR })}`
                          : `Criada em ${format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap">
                  {["rascunho", "agendada", "falhou", "parcialmente_enviada"].includes(status) && (
                    <Button size="sm" variant="outline" className="rounded-full h-8 text-xs"
                      disabled={isSending || isBusy} onClick={() => onSend(c.id)}
                      data-testid={`button-send-${c.id}`}>
                      <Play className="w-3 h-3 mr-1" />
                      {recipientCount > 100 ? `Disparar (${recipientCount.toLocaleString("pt-BR")})` : "Disparar"}
                    </Button>
                  )}
                  {status === "em_envio" && (
                    <Button size="sm" variant="outline" className="rounded-full h-8 text-xs"
                      disabled={isBusy} onClick={() => onPause(c.id)}
                      data-testid={`button-pause-${c.id}`}>
                      <Pause className="w-3 h-3 mr-1" /> Pausar
                    </Button>
                  )}
                  {status === "pausada" && (
                    <Button size="sm" variant="outline" className="rounded-full h-8 text-xs"
                      disabled={isBusy} onClick={() => onResume(c.id)}
                      data-testid={`button-resume-${c.id}`}>
                      <Play className="w-3 h-3 mr-1" /> Retomar
                    </Button>
                  )}
                  {["rascunho", "agendada", "em_envio", "pausada"].includes(status) && (
                    <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs"
                      disabled={isBusy} onClick={() => onCancel(c)}
                      data-testid={`button-cancel-${c.id}`}>
                      <Ban className="w-3 h-3 mr-1" /> Cancelar
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => onView(c.id)}
                    title="Ver detalhes e relatório" data-testid={`button-view-${c.id}`}>
                    <BarChart3 className="w-3.5 h-3.5" />
                  </Button>
                  {["rascunho", "agendada", "falhou"].includes(status) && (
                    <Button size="icon" variant="ghost" onClick={() => onEdit(c)}
                      title="Editar campanha" data-testid={`button-edit-${c.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => onDuplicate(c.id)}
                    title="Duplicar campanha" data-testid={`button-duplicate-${c.id}`}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onExport(c)}
                    title="Exportar destinatários (CSV)" data-testid={`button-export-${c.id}`}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}
                    data-testid={`button-delete-${c.id}`}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              {showProgress && (
                <div className="mt-3 space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }}
                      data-testid={`progress-bar-${c.id}`} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap" data-testid={`text-progress-${c.id}`}>
                    <span>{processed}/{prog!.total} processados ({pct}%)</span>
                    <span className="text-green-600">{prog!.sent} enviados</span>
                    {prog!.failed > 0 && <span className="text-destructive">{prog!.failed} falhas</span>}
                    {prog!.pending > 0 && <span>{prog!.pending} pendentes</span>}
                    {prog!.cancelled > 0 && <span>{prog!.cancelled} cancelados</span>}
                  </div>
                </div>
              )}

              {status === "cancelada" && c.cancelReason && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-cancel-reason-${c.id}`}>
                  Motivo: {c.cancelReason}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Broadcasts() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { toast } = useToast();
  const permissions = user?.permissions as UserPermissions | undefined;

  const hasWhatsApp = permissions?.whatsappBroadcast === true;
  const hasEmail = permissions?.emailBroadcast === true;
  const hasSms = permissions?.smsBroadcast === true;
  const hasAny = hasWhatsApp || hasEmail || hasSms;

  const allowedTypes = [
    ...(hasWhatsApp ? ["whatsapp", "whatsapp_oficial"] : []),
    ...(hasEmail ? ["email"] : []),
    ...(hasSms ? ["sms"] : []),
  ];
  const defaultType = hasWhatsApp ? "whatsapp" : hasEmail ? "email" : "sms";

  const [activeTab, setActiveTab] = useState(defaultType);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [, setLocation] = useLocation();

  // Reset page when tab or search changes
  useEffect(() => { setPage(1); }, [activeTab, search]);

  const { data: pageResult, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ["/api/campaigns", page, pageSize, search, activeTab],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        type: activeTab,
      });
      if (search) params.set("search", search);
      const res = await apiRequest("GET", `/api/campaigns?${params}`);
      return res.json();
    },
    enabled: hasAny,
    refetchInterval: (query) => {
      const list = extractCampaigns(query.state.data as CampaignsResponse | undefined);
      return list.some((c) => ACTIVE_STATUSES.includes(normalizeStatus(c.status))) ? 4000 : false;
    },
  });

  // Accept both the new paginated object and a legacy flat array defensively.
  const campaigns = extractCampaigns(pageResult);
  const totalCampaigns = Array.isArray(pageResult)
    ? pageResult.length
    : pageResult?.total ?? 0;
  const statusCounts = (!Array.isArray(pageResult) && pageResult?.statusCounts)
    ? pageResult.statusCounts
    : {
        total: totalCampaigns,
        sent: campaigns.filter((c) => ["enviada", "parcialmente_enviada"].includes(normalizeStatus(c.status))).length,
        draft: campaigns.filter((c) => normalizeStatus(c.status) === "rascunho").length,
        failed: campaigns.filter((c) => normalizeStatus(c.status) === "falhou").length,
      };
  const hasActive = campaigns.some((c) => ACTIVE_STATUSES.includes(normalizeStatus(c.status)));

  const { data: progress = {} } = useQuery<CampaignProgress>({
    queryKey: ["/api/campaigns/progress"],
    enabled: hasAny,
    refetchInterval: hasActive ? 4000 : false,
  });

  const { data: moduleStatus = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/modules/status"],
    enabled: hasAny,
  });

  const pendingChannels = allowedTypes.filter((t) => {
    const key = t === "whatsapp" || t === "whatsapp_oficial"
      ? "whatsappBroadcast"
      : t === "email"
        ? "emailBroadcast"
        : "smsBroadcast";
    return moduleStatus[key] === "pending_configuration";
  });

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
  };

  const sendMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/campaigns/${id}/send`, {}),
    onSuccess: () => {
      invalidateList();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/progress"] });
      setSendTarget(null);
      toast({ title: "Disparo iniciado", description: "Acompanhe o progresso na lista de campanhas." });
    },
    onError: (err: any) => {
      setSendTarget(null);
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/campaigns/${id}/pause`, {}),
    onSuccess: () => { invalidateList(); toast({ title: "Campanha pausada" }); },
    onError: (err: any) => toast({ title: "Erro ao pausar", description: err.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/campaigns/${id}/resume`, {}),
    onSuccess: () => { invalidateList(); toast({ title: "Campanha retomada" }); },
    onError: (err: any) => toast({ title: "Erro ao retomar", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/campaigns/${id}/cancel`, reason ? { reason } : {}),
    onSuccess: () => {
      invalidateList();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/progress"] });
      toast({ title: "Campanha cancelada" });
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: (err: any) => toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/campaigns/${id}`),
    onSuccess: () => {
      invalidateList();
      toast({ title: "Campanha removida" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Erro ao remover", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/campaigns/${id}/duplicate`, {}),
    onSuccess: () => {
      invalidateList();
      toast({ title: "Campanha duplicada", description: "O rascunho foi criado com sucesso." });
    },
    onError: (err: any) => toast({ title: "Erro ao duplicar", description: err.message, variant: "destructive" }),
  });

  const busyId =
    (pauseMutation.isPending && (pauseMutation.variables as string)) ||
    (resumeMutation.isPending && (resumeMutation.variables as string)) ||
    (cancelMutation.isPending && (cancelMutation.variables as { id: string })?.id) ||
    null;

  const handleExport = async (c: Campaign) => {
    try {
      const res = await apiRequest("GET", `/api/campaigns/${c.id}/recipients/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (c.name || "campanha").replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 60);
      a.download = `destinatarios_${safeName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    }
  };

  const handleSendRequest = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    if (!c) return;
    const count = Array.isArray(c.recipients) ? c.recipients.length : 0;
    if (count > 100) {
      setSendTarget(c);
    } else {
      sendMutation.mutate(id);
    }
  };

  useEffect(() => {
    if (!userLoading && user && !hasAny) setLocation("/dashboard");
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

  const tableProps = {
    campaigns,
    isLoading,
    onSend: handleSendRequest,
    onDelete: (id: string) => setDeleteId(id),
    onExport: handleExport,
    onPause: (id: string) => pauseMutation.mutate(id),
    onResume: (id: string) => resumeMutation.mutate(id),
    onCancel: (c: Campaign) => setCancelTarget(c),
    onDuplicate: (id: string) => duplicateMutation.mutate(id),
    onEdit: (c: Campaign) => setEditTarget(c),
    onView: (id: string) => setLocation(`/broadcasts/${id}`),
    isSending: sendMutation.isPending,
    progress,
    busyId,
    isFiltered: !!search,
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-broadcasts">
      {pendingChannels.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300" data-testid="alert-pending-configuration">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Configuração pendente:</strong> Os canais{" "}
            <strong>{pendingChannels.join(", ")}</strong> estão habilitados mas ainda não possuem integração configurada.
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
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar campanha..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
            data-testid="input-search-campaigns"
          />
          <Button className="rounded-full" onClick={() => setCreateOpen(true)} data-testid="button-new-campaign">
            <Plus className="w-4 h-4 mr-2" /> Nova campanha
          </Button>
        </div>
      </div>

      <StatsRow counts={statusCounts} />

      <Tabs value={activeTab} onValueChange={(t) => { setActiveTab(t); }}>
        <TabsList className="rounded-full p-1">
          {hasWhatsApp && (
            <TabsTrigger value="whatsapp" className="rounded-full gap-2" data-testid="tab-whatsapp-broadcasts">
              <SiWhatsapp className="w-3.5 h-3.5" /> WhatsApp
              {activeTab === "whatsapp" && totalCampaigns > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalCampaigns}</Badge>
              )}
            </TabsTrigger>
          )}
          {hasEmail && (
            <TabsTrigger value="email" className="rounded-full gap-2" data-testid="tab-email-broadcasts">
              <Mail className="w-3.5 h-3.5" /> E-mail
              {activeTab === "email" && totalCampaigns > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalCampaigns}</Badge>
              )}
            </TabsTrigger>
          )}
          {hasSms && (
            <TabsTrigger value="sms" className="rounded-full gap-2" data-testid="tab-sms-broadcasts">
              <MessageSquare className="w-3.5 h-3.5" /> SMS
              {activeTab === "sms" && totalCampaigns > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalCampaigns}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {hasWhatsApp && (
          <TabsContent value="whatsapp" className="mt-4 space-y-3">
            <CampaignTable {...tableProps} />
            <DataPagination
              page={page} pageSize={pageSize} total={totalCampaigns}
              onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </TabsContent>
        )}
        {hasEmail && (
          <TabsContent value="email" className="mt-4 space-y-3">
            <CampaignTable {...tableProps} />
            <DataPagination
              page={page} pageSize={pageSize} total={totalCampaigns}
              onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </TabsContent>
        )}
        {hasSms && (
          <TabsContent value="sms" className="mt-4 space-y-3">
            <CampaignTable {...tableProps} />
            <DataPagination
              page={page} pageSize={pageSize} total={totalCampaigns}
              onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </TabsContent>
        )}
      </Tabs>

      <CampaignWizard
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        defaultType={defaultType}
        allowedTypes={allowedTypes}
        campaigns={campaigns}
        moduleStatus={moduleStatus}
        editCampaign={editTarget as any}
      />

      {/* Confirm send (large campaigns) */}
      <AlertDialog open={!!sendTarget} onOpenChange={(o) => { if (!o) setSendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar disparo?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>{sendTarget?.name}</strong> tem{" "}
              <strong>{(Array.isArray(sendTarget?.recipients) ? sendTarget.recipients.length : 0).toLocaleString("pt-BR")} destinatários</strong>.{" "}
              O envio será iniciado e não pode ser desfeito facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendMutation.isPending}
              onClick={() => sendTarget && sendMutation.mutate(sendTarget.id)}
              data-testid="button-confirm-send">
              {sendMutation.isPending ? "Iniciando..." : "Confirmar disparo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
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
              data-testid="button-confirm-delete">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Os destinatários ainda não enviados não receberão a mensagem. Mensagens já enviadas não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-1">
            <FormLabel>Motivo (opcional)</FormLabel>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: conteúdo incorreto" data-testid="input-cancel-reason" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-cancel">
              Cancelar campanha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
