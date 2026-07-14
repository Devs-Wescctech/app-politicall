import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, TrendingUp, MessageSquare, CheckCheck, Clock, Users, AlertTriangle, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReportData {
  total: number;
  resolved: number;
  waiting: number;
  inProgress: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  bySector?: Record<string, number>;
  byPriority?: Record<string, number>;
  dailyVolume?: Record<string, number>;
  avgWaitSeconds?: number;
  avgServiceSeconds?: number;
  slaBreached?: number;
  resolutionRate?: number;
}

interface SupervisionData {
  summary: { backlog: number; unassigned: number; slaBreached: number; waiting: number; inProgress: number };
  agents: Array<{ userId: string; name: string; openCount: number }>;
  queues: Array<{ queueId: string | null; name: string; openCount: number }>;
  generatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  waiting: "Aguardando",
  bot: "Bot",
  assigned: "Atribuído",
  in_progress: "Em atendimento",
  transferred: "Transferido",
  resolved: "Resolvido",
  closed: "Fechado",
  reopened: "Reaberto",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  webchat: "Chat Web",
  social: "Redes sociais",
};

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/ /g, "-")}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value.toLocaleString("pt-BR")}</p>
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds = 0) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? ` ${rest}min` : ""}`;
}

export default function ReportsTab() {
  const [channel, setChannel] = useState("all");
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();

  const params = new URLSearchParams();
  if (channel !== "all") params.set("channel", channel);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, refetch } = useQuery<ReportData>({
    queryKey: ["/api/attendance/reports/summary", params.toString()],
    queryFn: async () => {
      const query = params.toString();
      const response = await apiRequest("GET", "/api/attendance/reports/summary" + (query ? "?" + query : ""));
      return response.json();
    },
  });

  const { data: supervision, isLoading: supervisionLoading } = useQuery<SupervisionData>({
    queryKey: ["/api/attendance/supervision"],
    refetchInterval: 15000,
  });

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.set("format", format);
      const response = await apiRequest("GET", `/api/attendance/reports/export?${exportParams.toString()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "xlsx" ? "relatorio-atendimentos.xlsx" : format === "pdf" ? "relatorio-atendimentos.pdf" : "relatorio-atendimentos.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6" data-testid="tab-reports">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Relatórios de atendimento</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Métricas e estatísticas dos atendimentos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-36" data-testid="select-report-channel">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-9 text-xs" data-testid="input-report-from" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 h-9 text-xs" data-testid="input-report-to" />
          </div>
          <Button size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-report">
            Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("csv")} data-testid="button-export-report-csv">
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("xlsx")} data-testid="button-export-report-xlsx">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("pdf")} data-testid="button-export-report-pdf">
            <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {supervisionLoading ? (
        <div className="mb-6 flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : supervision ? (
        <div className="mb-6 space-y-4" data-testid="supervision-dashboard">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Backlog" value={supervision.summary.backlog} icon={Inbox} color="bg-blue-500/10 text-blue-600" />
            <StatCard title="Sem responsável" value={supervision.summary.unassigned} icon={Users} color="bg-amber-500/10 text-amber-600" />
            <StatCard title="SLA vencido" value={supervision.summary.slaBreached} icon={AlertTriangle} color="bg-red-500/10 text-red-600" />
            <StatCard title="Em atendimento" value={supervision.summary.inProgress} icon={Clock} color="bg-emerald-500/10 text-emerald-600" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Carga por atendente</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {supervision.agents.length ? supervision.agents.map(agent => (
                  <div key={agent.userId} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="truncate">{agent.name}</span><span className="font-semibold">{agent.openCount}</span>
                  </div>
                )) : <p className="py-3 text-center text-xs text-muted-foreground">Nenhum atendimento atribuído.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Backlog por fila</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {supervision.queues.length ? supervision.queues.map(queue => (
                  <div key={queue.queueId ?? "none"} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="truncate">{queue.name}</span><span className="font-semibold">{queue.openCount}</span>
                  </div>
                )) : <p className="py-3 text-center text-xs text-muted-foreground">Nenhuma fila com backlog.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado disponível para o período selecionado</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total" value={data.total} icon={MessageSquare} color="bg-blue-500/10 text-blue-500" />
            <StatCard title="Resolvidos" value={data.resolved} icon={CheckCheck} color="bg-green-500/10 text-green-600" />
            <StatCard title="Em andamento" value={data.inProgress} icon={Clock} color="bg-orange-500/10 text-orange-500" />
            <StatCard title="Aguardando" value={data.waiting} icon={TrendingUp} color="bg-yellow-500/10 text-yellow-600" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">Tempo médio de espera</p>
                <p className="text-xl font-bold text-foreground">{formatDuration(data.avgWaitSeconds)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">Tempo médio total</p>
                <p className="text-xl font-bold text-foreground">{formatDuration(data.avgServiceSeconds)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">SLA violado</p>
                <p className="text-xl font-bold text-foreground">{(data.slaBreached ?? 0).toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">Taxa de resolução</p>
                <p className="text-xl font-bold text-foreground">{data.resolutionRate ?? 0}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By status */}
            <Card data-testid="card-by-status">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Por status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(data.byStatus ?? {}).map(([status, count]) => {
                    const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                    return (
                      <div key={status} data-testid={`status-row-${status}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
                          <span className="font-medium text-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(data.byStatus ?? {}).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By channel */}
            <Card data-testid="card-by-channel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Por canal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(data.byChannel ?? {}).map(([ch, count]) => {
                    const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                    return (
                      <div key={ch} data-testid={`channel-row-${ch}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{CHANNEL_LABELS[ch] ?? ch}</span>
                          <span className="font-medium text-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(data.byChannel ?? {}).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resolution rate */}
          {data.total > 0 && (
            <Card data-testid="card-resolution-rate">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">Taxa de resolução</p>
                  <p className="text-lg font-bold text-green-600">
                    {Math.round((data.resolved / data.total) * 100)}%
                  </p>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.round((data.resolved / data.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.resolved} de {data.total} conversas resolvidas
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
