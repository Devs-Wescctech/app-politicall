import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Download, AlertCircle, FileText, TrendingUp, Send,
  CheckCircle2, MessageSquare, XCircle, DollarSign, Filter, Loader2,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { UserPermissions } from "@shared/schema";
import { format } from "date-fns";

type ExportFormat = "csv" | "xlsx" | "pdf";

type RecipientCounts = {
  total: number; pending: number; sent: number; delivered: number; read: number;
  responded: number; failed: number; invalid: number; cancelled: number;
};
type RecipientMetrics = {
  counts: RecipientCounts;
  sentLike: number; deliveredLike: number; readLike: number; failedLike: number;
  deliveryRate: number; responseRate: number; failureRate: number;
};
type ChannelSummary = { channel: string; label: string; metrics: RecipientMetrics };
type ErrorGroup = { reason: string; friendly: string; count: number };
type SendTiming = {
  startedAt: string | null; finishedAt: string | null;
  durationMs: number | null; avgPerMinute: number | null;
};
type CampaignRow = {
  id: string; name: string; status: string; channels: string[];
  createdAt: string | null; sentAt: string | null; metrics: RecipientMetrics;
};
type SummaryResponse = {
  overall: RecipientMetrics;
  channels: ChannelSummary[];
  errors: ErrorGroup[];
  smsCost: number;
  totals: { campaigns: number };
  statusDistribution: Record<string, number>;
  campaigns: CampaignRow[];
};
type CampaignReport = {
  campaign: {
    id: string; name: string; status: string; channels: string[];
    createdAt: string | null; scheduledFor: string | null; sentAt: string | null;
  };
  metrics: RecipientMetrics;
  channels: ChannelSummary[];
  errors: ErrorGroup[];
  timing: SendTiming;
  smsCost: number;
  events: Array<{ id: string; action: string; fromStatus: string | null; toStatus: string | null; createdAt: string | null }>;
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", agendada: "Agendada", em_envio: "Em envio", pausada: "Pausada",
  enviada: "Enviada", parcialmente_enviada: "Parcialmente enviada", falhou: "Falhou", cancelada: "Cancelada",
};

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "whatsapp_oficial", label: "WhatsApp API Oficial" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "E-mail" },
];

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const brl = (v: number) => `R$ ${v.toFixed(2)}`;

function MetricCard({ icon: Icon, label, value, hint, testId }: { icon: any; label: string; value: string; hint?: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold" data-testid={`${testId}-value`}>{value}</div>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

async function downloadExport(url: string, fallbackName: string, fmt: ExportFormat, onError: (msg: string) => void) {
  try {
    const res = await apiRequest("GET", url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${fallbackName}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err: any) {
    onError(err?.message ?? "Falha ao exportar");
  }
}

function ExportButton({ label, baseUrl, extraParams, fileBase, disabled }: { label: string; baseUrl: string; extraParams?: Record<string, string>; fileBase: string; disabled?: boolean }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const buildUrl = (fmt: ExportFormat) => {
    const params = new URLSearchParams({ ...(extraParams ?? {}), format: fmt });
    return `${baseUrl}?${params.toString()}`;
  };
  const handleExport = async (fmt: ExportFormat) => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadExport(buildUrl(fmt), fileBase, fmt, (m) => toast({ title: "Erro ao exportar", description: m, variant: "destructive" }));
    } finally {
      setExporting(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || exporting} data-testid={`button-export-${fileBase}`}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Exportando..." : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["csv", "xlsx", "pdf"] as ExportFormat[]).map((fmt) => (
          <DropdownMenuItem
            key={fmt}
            data-testid={`menu-export-${fileBase}-${fmt}`}
            disabled={exporting}
            onClick={() => handleExport(fmt)}
          >
            {fmt.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CampaignDetailModal({ campaignId, open, onClose }: { campaignId: string | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<CampaignReport>({
    queryKey: ["/api/campaigns", campaignId, "report"],
    enabled: open && !!campaignId,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-campaign-report">
        <DialogHeader>
          <DialogTitle>{data?.campaign.name ?? "Relatório da campanha"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{STATUS_LABELS[data.campaign.status] ?? data.campaign.status}</Badge>
              {data.campaign.channels.map((ch) => (
                <Badge key={ch} variant="outline">{CHANNEL_OPTIONS.find((c) => c.value === ch)?.label ?? ch}</Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Send} label="Total" value={String(data.metrics.counts.total)} testId="detail-total" />
              <MetricCard icon={CheckCircle2} label="Entrega" value={pct(data.metrics.deliveryRate)} testId="detail-delivery" />
              <MetricCard icon={MessageSquare} label="Resposta" value={pct(data.metrics.responseRate)} testId="detail-response" />
              <MetricCard icon={XCircle} label="Falha" value={pct(data.metrics.failureRate)} testId="detail-failure" />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Tempo de envio</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Início: {data.timing.startedAt ? format(new Date(data.timing.startedAt), "dd/MM/yyyy HH:mm") : "—"}</div>
                <div>Fim: {data.timing.finishedAt ? format(new Date(data.timing.finishedAt), "dd/MM/yyyy HH:mm") : "—"}</div>
                <div>Duração: {data.timing.durationMs != null ? `${(data.timing.durationMs / 60000).toFixed(1)} min` : "—"}</div>
                <div>Média/min: {data.timing.avgPerMinute ?? "—"}</div>
                {data.smsCost > 0 ? <div>Custo SMS estimado: {brl(data.smsCost)}</div> : null}
              </div>
            </div>

            {data.channels.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Por canal</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Entrega</TableHead>
                      <TableHead className="text-right">Falha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.channels.map((ch) => (
                      <TableRow key={ch.channel} data-testid={`detail-channel-${ch.channel}`}>
                        <TableCell>{ch.label}</TableCell>
                        <TableCell className="text-right">{ch.metrics.counts.total}</TableCell>
                        <TableCell className="text-right">{ch.metrics.sentLike}</TableCell>
                        <TableCell className="text-right">{pct(ch.metrics.deliveryRate)}</TableCell>
                        <TableCell className="text-right">{pct(ch.metrics.failureRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Erros por motivo</h4>
              {data.errors.length > 0 && (
                <ExportButton
                  label="Exportar falhas"
                  baseUrl={`/api/campaigns/${data.campaign.id}/failures/export`}
                  fileBase={`falhas_${data.campaign.id}`}
                />
              )}
            </div>
            {data.errors.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Erro técnico</TableHead>
                    <TableHead className="text-right">Ocorrências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.errors.map((e, i) => (
                    <TableRow key={i} data-testid={`detail-error-${i}`}>
                      <TableCell>{e.friendly}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{e.reason}</TableCell>
                      <TableCell className="text-right">{e.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma falha registrada.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <ExportButton
                label="Relatório completo"
                baseUrl={`/api/campaigns/${data.campaign.id}/report/export`}
                fileBase={`relatorio_${data.campaign.id}`}
              />
              <ExportButton
                label="Destinatários"
                baseUrl={`/api/campaigns/${data.campaign.id}/recipients/export`}
                fileBase={`destinatarios_${data.campaign.id}`}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Reports() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const permissions = user?.permissions as UserPermissions | undefined;
  const hasAny =
    permissions?.marketing === true ||
    permissions?.reports === true ||
    permissions?.campaignReports === true ||
    permissions?.whatsappBroadcast === true ||
    permissions?.emailBroadcast === true ||
    permissions?.smsBroadcast === true ||
    user?.role === "admin";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(`${to}T23:59:59`).toISOString());
    if (channel !== "all") p.set("channel", channel);
    if (status !== "all") p.set("status", status);
    return p.toString();
  }, [from, to, channel, status]);

  const summaryUrl = `/api/campaigns/reports/summary${queryParams ? `?${queryParams}` : ""}`;
  const { data, isLoading } = useQuery<SummaryResponse>({
    queryKey: ["/api/campaigns/reports/summary", queryParams],
    queryFn: async () => {
      const response = await apiRequest("GET", summaryUrl);
      return response.json();
    },
    enabled: hasAny,
  });

  useEffect(() => {
    if (!userLoading && user && !hasAny) setLocation("/dashboard");
  }, [userLoading, user, hasAny, setLocation]);

  const statusChartData = useMemo(
    () => Object.entries(data?.statusDistribution ?? {}).map(([k, v]) => ({ name: STATUS_LABELS[k] ?? k, value: v })),
    [data],
  );
  const channelChartData = useMemo(
    () => (data?.channels ?? []).map((ch) => ({
      name: ch.label,
      Enviados: ch.metrics.sentLike,
      Entregues: ch.metrics.deliveredLike,
      Falhas: ch.metrics.failedLike,
    })),
    [data],
  );

  if (userLoading) {
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
  if (!hasAny) return null;

  const exportParams: Record<string, string> = {};
  if (from) exportParams.from = new Date(from).toISOString();
  if (to) exportParams.to = new Date(`${to}T23:59:59`).toISOString();
  if (channel !== "all") exportParams.channel = channel;
  if (status !== "all") exportParams.status = status;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-reports-title">Relatórios de Campanhas</h1>
            <p className="text-sm text-muted-foreground">Métricas, canais e erros das suas campanhas</p>
          </div>
        </div>
        <ExportButton
          label="Exportar resumo"
          baseUrl="/api/campaigns/reports/summary/export"
          extraParams={exportParams}
          fileBase="relatorio_campanhas"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-filter-from" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-filter-to" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Canal</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-44" data-testid="select-filter-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {CHANNEL_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" data-testid="select-filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(from || to || channel !== "all" || status !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); setChannel("all"); setStatus("all"); }} data-testid="button-clear-filters">
              Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard icon={FileText} label="Campanhas" value={String(data.totals.campaigns)} testId="card-total-campaigns" />
            <MetricCard icon={Send} label="Enviados" value={String(data.overall.sentLike)} hint={`de ${data.overall.counts.total} destinatários`} testId="card-sent" />
            <MetricCard icon={CheckCircle2} label="Taxa de entrega" value={pct(data.overall.deliveryRate)} testId="card-delivery-rate" />
            <MetricCard icon={MessageSquare} label="Taxa de resposta" value={pct(data.overall.responseRate)} testId="card-response-rate" />
            <MetricCard icon={XCircle} label="Taxa de falha" value={pct(data.overall.failureRate)} testId="card-failure-rate" />
            <MetricCard icon={DollarSign} label="Custo SMS" value={brl(data.smsCost)} testId="card-sms-cost" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Campanhas por status</CardTitle></CardHeader>
              <CardContent>
                {statusChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {statusChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Desempenho por canal</CardTitle></CardHeader>
              <CardContent>
                {channelChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={channelChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Enviados" fill={CHART_COLORS[0]} />
                      <Bar dataKey="Entregues" fill={CHART_COLORS[1]} />
                      <Bar dataKey="Falhas" fill={CHART_COLORS[3]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {data.errors.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="w-4 h-4" /> Erros por motivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Erro técnico</TableHead>
                      <TableHead className="text-right">Ocorrências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.errors.map((e, i) => (
                      <TableRow key={i} data-testid={`row-error-${i}`}>
                        <TableCell>{e.friendly}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">{e.reason}</TableCell>
                        <TableCell className="text-right">{e.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Campanhas</CardTitle></CardHeader>
            <CardContent>
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-campaigns">Nenhuma campanha encontrada com os filtros atuais.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Entrega</TableHead>
                      <TableHead className="text-right">Falha</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.campaigns.map((c) => (
                      <TableRow key={c.id} className="hover-elevate cursor-pointer" onClick={() => setDetailId(c.id)} data-testid={`row-campaign-${c.id}`}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="secondary">{STATUS_LABELS[c.status] ?? c.status}</Badge></TableCell>
                        <TableCell className="text-right">{c.metrics.counts.total}</TableCell>
                        <TableCell className="text-right">{c.metrics.sentLike}</TableCell>
                        <TableCell className="text-right">{pct(c.metrics.deliveryRate)}</TableCell>
                        <TableCell className="text-right">{pct(c.metrics.failureRate)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }} data-testid={`button-view-report-${c.id}`}>
                            <TrendingUp className="w-4 h-4" /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <CampaignDetailModal campaignId={detailId} open={!!detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
