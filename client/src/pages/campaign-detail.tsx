import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Download, Users, Send, CheckCheck, Eye, XCircle, MessageSquare,
  Mail, Phone, Clock, AlertTriangle,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataPagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PaginatedResult } from "@shared/pagination";

// ─── Status / channel helpers (mirror broadcasts) ─────────────────────────────
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

const RECIPIENT_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  sent: { label: "Enviado", variant: "outline" },
  delivered: { label: "Entregue", variant: "default" },
  read: { label: "Lido", variant: "default" },
  responded: { label: "Respondeu", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  invalid: { label: "Inválido", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

function channelIcon(channel: string) {
  if (channel === "whatsapp") return <SiWhatsapp className="w-3.5 h-3.5 text-green-600" />;
  if (channel === "whatsapp_oficial") return <SiWhatsapp className="w-3.5 h-3.5 text-sky-600" />;
  if (channel === "email") return <Mail className="w-3.5 h-3.5 text-blue-500" />;
  return <Phone className="w-3.5 h-3.5 text-purple-500" />;
}

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

// ─── Types (subset of server report response) ─────────────────────────────────
type RecipientMetrics = {
  counts: { total: number; pending: number; sent: number; delivered: number; read: number; responded: number; failed: number; invalid: number; cancelled: number };
  sentLike: number; deliveredLike: number; readLike: number; failedLike: number;
  deliveryRate: number; responseRate: number; failureRate: number;
};
type Report = {
  campaign: { id: string; name: string; status: string; channels: string[]; createdAt: string; scheduledFor: string | null; sentAt: string | null };
  metrics: RecipientMetrics;
  channels: { channel: string; label: string; metrics: RecipientMetrics }[];
  errors: { reason: string; friendly: string; count: number }[];
  timing: { startedAt: string | null; finishedAt: string | null; durationMs: number | null; avgPerMinute: number | null };
  smsCost: number;
};
type Recipient = {
  id: string; channel: string; recipient: string; name: string | null; status: string;
  errorReason: string | null; friendlyError?: string | null; failureKind?: "temporary" | "permanent" | null;
  sentAt: string | null; deliveredAt: string | null;
};

// Grouped filter options for the recipients table
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendentes" },
  { value: "sent", label: "Enviados" },
  { value: "delivered", label: "Entregues" },
  { value: "read", label: "Lidos" },
  { value: "responded", label: "Responderam" },
  { value: "group:failures", label: "Todas as falhas" },
  { value: "group:temporary", label: "Falhas temporárias" },
  { value: "group:permanent", label: "Falhas definitivas" },
];

// ─── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string | number; sub?: string; tone?: string;
}) {
  return (
    <Card data-testid={`kpi-${label}`}>
      <CardContent className="py-4 px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={`w-4 h-4 ${tone ?? ""}`} />
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-2xl font-semibold mt-1 ${tone ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function CampaignDetail() {
  const [, params] = useRoute("/broadcasts/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [statusFilter]);

  const { data: report, isLoading: reportLoading } = useQuery<Report>({
    queryKey: ["/api/campaigns", id, "report"],
    enabled: !!id,
    refetchInterval: (q) => {
      const st = (q.state.data as Report | undefined)?.campaign.status;
      return st === "em_envio" || st === "pausada" ? 4000 : false;
    },
  });

  const { data: recipientsPage, isLoading: recipientsLoading } = useQuery<PaginatedResult<Recipient>>({
    queryKey: ["/api/campaigns", id, "recipients", page, pageSize, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: statusFilter });
      const res = await apiRequest("GET", `/api/campaigns/${id}/recipients?${params}`);
      return res.json();
    },
    enabled: !!id,
  });

  const recipients = recipientsPage?.data ?? [];
  const totalRecipients = recipientsPage?.total ?? 0;

  const handleExport = async () => {
    if (!id) return;
    try {
      const res = await apiRequest("GET", `/api/campaigns/${id}/report/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (report?.campaign.name || "campanha").replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 60);
      a.download = `relatorio_${safeName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    }
  };

  if (reportLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 space-y-4" data-testid="campaign-detail-notfound">
        <Button variant="ghost" onClick={() => setLocation("/broadcasts")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
        </Button>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 opacity-20" />
          <p className="font-medium">Campanha não encontrada</p>
        </div>
      </div>
    );
  }

  const m = report.metrics;
  const st = STATUS_MAP[report.campaign.status] ?? { label: report.campaign.status, variant: "secondary" as const };

  const chartData = [
    { name: "Enviados", value: m.sentLike, fill: "hsl(var(--primary))" },
    { name: "Entregues", value: m.deliveredLike, fill: "hsl(142 71% 45%)" },
    { name: "Lidos", value: m.readLike, fill: "hsl(199 89% 48%)" },
    { name: "Falhas", value: m.failedLike, fill: "hsl(var(--destructive))" },
    { name: "Pendentes", value: m.counts.pending, fill: "hsl(var(--muted-foreground))" },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="page-campaign-detail">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setLocation("/broadcasts")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar para Campanhas
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" data-testid="text-campaign-title">{report.campaign.name}</h1>
            <Badge variant={st.variant} data-testid="badge-campaign-status">{st.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              {report.campaign.channels.map((ch) => <span key={ch}>{channelIcon(ch)}</span>)}
            </span>
            <span>Criada em {fmtDate(report.campaign.createdAt)}</span>
            {report.campaign.scheduledFor && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Agendada para {fmtDate(report.campaign.scheduledFor)}</span>
            )}
            {report.campaign.sentAt && <span>Enviada em {fmtDate(report.campaign.sentAt)}</span>}
          </div>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export-report">
          <Download className="w-4 h-4 mr-1.5" /> Exportar relatório
        </Button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Users} label="Destinatários" value={m.counts.total.toLocaleString("pt-BR")} />
        <Kpi icon={Send} label="Enviados" value={m.sentLike.toLocaleString("pt-BR")} />
        <Kpi icon={CheckCheck} label="Entregues" value={m.deliveredLike.toLocaleString("pt-BR")} sub={pct(m.deliveryRate) + " de entrega"} tone="text-green-600" />
        <Kpi icon={Eye} label="Lidos" value={m.readLike.toLocaleString("pt-BR")} tone="text-sky-600" />
        <Kpi icon={XCircle} label="Falhas" value={m.failedLike.toLocaleString("pt-BR")} sub={pct(m.failureRate) + " de falha"} tone="text-destructive" />
        <Kpi icon={MessageSquare} label="Respostas" value={m.counts.responded.toLocaleString("pt-BR")} sub={pct(m.responseRate)} />
      </div>

      {report.smsCost > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="text-sms-cost">
          Custo estimado de SMS: <span className="font-medium text-foreground">R$ {report.smsCost.toFixed(2)}</span>
        </p>
      )}

      {/* Chart */}
      <Card>
        <CardContent className="py-4 px-4">
          <p className="text-sm font-medium mb-3">Distribuição de status</p>
          <div className="h-64 w-full" data-testid="chart-status">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.375rem", fontSize: "0.75rem" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Errors */}
      {report.errors.length > 0 && (
        <Card>
          <CardContent className="py-4 px-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> Principais erros</p>
            <div className="space-y-1.5">
              {report.errors.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm" data-testid={`error-row-${i}`}>
                  <span className="text-muted-foreground truncate">{e.friendly}</span>
                  <Badge variant="destructive">{e.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipients table */}
      <Card>
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">Destinatários ({totalRecipients.toLocaleString("pt-BR")})</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value} data-testid={`filter-status-${f.value}`}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recipientsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground" data-testid="empty-recipients">
              <Users className="w-8 h-8 opacity-20" />
              <p className="text-sm">Nenhum destinatário para este filtro.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado</TableHead>
                      <TableHead>Entregue</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((r) => {
                      const rs = RECIPIENT_STATUS_MAP[r.status] ?? { label: r.status, variant: "secondary" as const };
                      return (
                        <TableRow key={r.id} data-testid={`row-recipient-${r.id}`}>
                          <TableCell>{channelIcon(r.channel)}</TableCell>
                          <TableCell className="font-mono text-xs" data-testid={`text-recipient-${r.id}`}>{r.recipient}</TableCell>
                          <TableCell className="text-sm">{r.name || "—"}</TableCell>
                          <TableCell><Badge variant={rs.variant}>{rs.label}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(r.sentAt)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.deliveredAt
                              ? fmtDate(r.deliveredAt)
                              : (r.channel === "sms" || r.channel === "whatsapp")
                                ? <span className="text-muted-foreground">Status de entrega indisponível para este canal</span>
                                : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-48 truncate" title={r.errorReason || undefined}>
                            {r.friendlyError || r.errorReason || "—"}
                            {r.status === "failed" && r.failureKind === "temporary" && (
                              <span className="text-muted-foreground"> (temporária)</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <DataPagination
                page={page} pageSize={pageSize} total={totalRecipients}
                onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                pageSizeOptions={[25, 50, 100, 200]}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
