import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, FileText, ListTodo, RefreshCw, Search, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DemandOperationItem, DemandOperationReason, DemandOperationsReport } from "./demand-operations-types";
import { exportDemandOperationsPdf, exportDemandOperationsXlsx, fetchDemandOperationsExport } from "@/lib/demand-operations-export";
import { useToast } from "@/hooks/use-toast";

type Option = { id: string; name: string };
type Destination = Option & { active: boolean };

type Props = {
  categories: Option[];
  assignees: Option[];
  onOpenDemand: (id: string) => void;
};

const REASON: Record<DemandOperationReason, { label: string; className: string }> = {
  forwarding_overdue: { label: "Encaminhamento vencido", className: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
  demand_overdue: { label: "SLA vencido", className: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
  due_soon: { label: "Vence em ate 4h", className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  stale: { label: "Sem atualizacao", className: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200" },
  active: { label: "Em acompanhamento", className: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" },
};

const STATUS: Record<string, string> = {
  open: "Aberta", triage: "Triagem", in_progress: "Em andamento",
  waiting_requester: "Aguardando solicitante", waiting_third_party: "Aguardando terceiro",
  completed: "Concluida", cancelled: "Cancelada",
};

const dateInput = (date: Date) => date.toISOString().slice(0, 10);
const initialFrom = () => { const date = new Date(); date.setDate(date.getDate() - 30); return dateInput(date); };
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sem prazo";
const formatHours = (value: number | null) => value == null ? "Sem dados" : `${value.toFixed(1)}h`;
const formatRate = (value: number) => `${(value * 100).toFixed(1)}%`;

function QueueItem({ item, onOpenDemand, mobile = false }: { item: DemandOperationItem; onOpenDemand: (id: string) => void; mobile?: boolean }) {
  if (mobile) return (
    <button type="button" onClick={() => onOpenDemand(item.id)} className="w-full space-y-3 border-b p-4 text-left last:border-b-0 hover:bg-muted/50">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{item.protocol ?? "Sem protocolo"}</p><p className="font-medium">{item.title}</p></div><Badge variant="outline" className={REASON[item.reason].className}>{REASON[item.reason].label}</Badge></div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>{item.assigneeName ?? "Sem responsavel"}</span><span>{item.destinationName ?? item.categoryName ?? "Sem destino"}</span><span>{STATUS[item.status] ?? item.status}</span><span>{formatDate(item.deadlineAt)}</span></div>
    </button>
  );
  return (
    <TableRow className="cursor-pointer" onClick={() => onOpenDemand(item.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpenDemand(item.id); }}>
      <TableCell><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.protocol ?? "Sem protocolo"}</p></TableCell>
      <TableCell><Badge variant="outline" className={REASON[item.reason].className}>{REASON[item.reason].label}</Badge></TableCell>
      <TableCell>{item.assigneeName ?? "Sem responsavel"}</TableCell>
      <TableCell>{item.destinationName ?? item.categoryName ?? "Sem destino"}</TableCell>
      <TableCell>{STATUS[item.status] ?? item.status}</TableCell>
      <TableCell className="whitespace-nowrap">{formatDate(item.deadlineAt)}</TableCell>
    </TableRow>
  );
}

function Ranking({ title, rows }: { title: string; rows: DemandOperationsReport["breakdowns"]["categories"] }) {
  return <section className="min-w-0 rounded-lg border bg-card p-4"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.slice(0, 5).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{row.total}{row.overdue ? ` / ${row.overdue} atrasadas` : ""}</span></div>)}{rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no periodo</p>}</div></section>;
}

export function DemandOperationsCenter({ categories, assignees, onOpenDemand }: Props) {
  const { toast } = useToast();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [destinationId, setDestinationId] = useState("all");
  const [assigneeUserId, setAssigneeUserId] = useState("all");
  const [deadlineState, setDeadlineState] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const { data: destinations = [] } = useQuery<Destination[]>({ queryKey: ["/api/demand-destinations?active=true"] });
  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to, page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (categoryId !== "all") params.set("categoryId", categoryId);
    if (destinationId !== "all") params.set("destinationId", destinationId);
    if (assigneeUserId !== "all") params.set("assigneeUserId", assigneeUserId);
    if (deadlineState !== "all") params.set("deadlineState", deadlineState);
    return `/api/demand-operations?${params}`;
  }, [from, to, page, search, categoryId, destinationId, assigneeUserId, deadlineState]);
  const { data, isLoading, isError, refetch } = useQuery<DemandOperationsReport>({ queryKey: [requestUrl] });

  const resetFilters = () => {
    setFrom(initialFrom()); setTo(dateInput(new Date())); setSearch(""); setCategoryId("all");
    setDestinationId("all"); setAssigneeUserId("all"); setDeadlineState("all"); setPage(1);
  };
  const handleExport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    try {
      const report = await fetchDemandOperationsExport(requestUrl);
      if (!report.items.length) throw new Error("Nenhuma pendencia encontrada para exportar");
      if (format === "xlsx") await exportDemandOperationsXlsx(report); else await exportDemandOperationsPdf(report);
      toast({ title: `Relatorio ${format.toUpperCase()} gerado`, description: `${report.items.length} demandas exportadas.` });
    } catch (error) {
      toast({ title: "Nao foi possivel exportar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setExporting(null); }
  };

  if (isLoading) return <div className="space-y-4" data-testid="demand-operations-center"><p className="sr-only">Carregando central operacional</p><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-80" /></div>;
  if (isError || !data) return <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center" data-testid="demand-operations-center"><AlertCircle className="h-8 w-8 text-destructive" /><h2 className="mt-3 font-semibold">Nao foi possivel carregar a central</h2><p className="mt-1 text-sm text-muted-foreground">Verifique sua conexao e tente novamente.</p><Button className="mt-4" variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div>;

  const metrics = [
    { label: "Demandas ativas", value: String(data.summary.active), icon: ListTodo },
    { label: "SLA vencido", value: String(data.summary.overdue), icon: AlertTriangle },
    { label: "Encaminhamentos vencidos", value: String(data.summary.forwardingOverdue), icon: Clock3 },
    { label: "Taxa de conclusao", value: formatRate(data.summary.completionRate), icon: TimerReset },
  ];

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4" data-testid="demand-operations-center">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-h-20 items-center gap-3 rounded-lg border bg-card px-4 py-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>)}</div>

      <section className="rounded-lg border bg-card p-4" aria-label="Filtros da central operacional">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Periodo inicial</span><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Periodo final</span><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
          <label className="space-y-1 sm:col-span-2 xl:col-span-2"><span className="text-xs font-medium text-muted-foreground">Pesquisar</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Protocolo, titulo ou eleitor" /></span></label>
          <div className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Categoria</span><Select value={categoryId} onValueChange={(value) => { setCategoryId(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Destino</span><Select value={destinationId} onValueChange={(value) => { setDestinationId(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{destinations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Responsavel</span><Select value={assigneeUserId} onValueChange={(value) => { setAssigneeUserId(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{assignees.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Estado do prazo</span><Select value={deadlineState} onValueChange={(value) => { setDeadlineState(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="forwarding_overdue">Encaminhamento vencido</SelectItem><SelectItem value="demand_overdue">SLA vencido</SelectItem><SelectItem value="due_soon">Vence em ate 4h</SelectItem><SelectItem value="stale">Sem atualizacao</SelectItem><SelectItem value="active">Em acompanhamento</SelectItem></SelectContent></Select></div>
          <div className="flex items-end sm:col-span-2 xl:col-span-1"><Button className="w-full" variant="outline" onClick={resetFilters}>Limpar filtros</Button></div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3"><Ranking title="Ranking por categoria" rows={data.breakdowns.categories} /><Ranking title="Ranking por destino" rows={data.breakdowns.destinations} /><Ranking title="Ranking por responsavel" rows={data.breakdowns.assignees} /></div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h2 className="font-semibold">Fila de pendencias</h2><p className="text-xs text-muted-foreground">{data.pagination.total} demandas no filtro atual</p></div><div className="flex items-center gap-2"><div className="mr-2 hidden text-right text-xs text-muted-foreground lg:block"><p>Primeiro movimento: {formatHours(data.summary.averageFirstMovementHours)}</p><p>Resolucao: {formatHours(data.summary.averageResolutionHours)}</p></div><Button size="sm" variant="outline" disabled={!!exporting} onClick={() => handleExport("xlsx")}><FileSpreadsheet className="h-4 w-4" />{exporting === "xlsx" ? "Gerando..." : "Excel"}</Button><Button size="sm" variant="outline" disabled={!!exporting} onClick={() => handleExport("pdf")}><FileText className="h-4 w-4" />{exporting === "pdf" ? "Gerando..." : "PDF"}</Button></div></div>
        {data.items.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center"><ListTodo className="h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">Nenhuma pendencia encontrada</p><p className="text-sm text-muted-foreground">Ajuste os filtros ou consulte outro periodo.</p></div> : <><div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>Demanda</TableHead><TableHead>Motivo</TableHead><TableHead>Responsavel</TableHead><TableHead>Destino</TableHead><TableHead>Status</TableHead><TableHead>Prazo</TableHead></TableRow></TableHeader><TableBody>{data.items.map((item) => <QueueItem key={item.id} item={item} onOpenDemand={onOpenDemand} />)}</TableBody></Table></div><div className="md:hidden">{data.items.map((item) => <QueueItem key={item.id} item={item} onOpenDemand={onOpenDemand} mobile />)}</div></>}
        <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Pagina {data.pagination.page} de {Math.max(1, data.pagination.totalPages)}</p><div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Pagina anterior" disabled={data.pagination.page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Proxima pagina" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </section>
    </div>
  );
}
