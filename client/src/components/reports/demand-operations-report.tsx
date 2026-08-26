import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Clock3, ListChecks, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { DemandOperationsReport } from "@/components/demands/demand-operations-types";

const dateInput = (date: Date) => date.toISOString().slice(0, 10);
const initialFrom = () => { const date = new Date(); date.setDate(date.getDate() - 30); return dateInput(date); };
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const hours = (value: number | null) => value == null ? "Sem dados" : `${value.toFixed(1)}h`;

function Ranking({ title, rows }: { title: string; rows: DemandOperationsReport["breakdowns"]["categories"] }) {
  return <section className="rounded-lg border bg-card p-4"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.slice(0, 8).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><span className="tabular-nums text-muted-foreground">{row.total}<span className="ml-2 text-destructive">{row.overdue ? `${row.overdue} atrasadas` : ""}</span></span></div>)}{rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no periodo.</p>}</div></section>;
}

export function DemandOperationsReport() {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(() => dateInput(new Date()));
  const requestUrl = useMemo(() => `/api/demand-operations?${new URLSearchParams({ from, to, page: "1", pageSize: "10" })}`, [from, to]);
  const { data, isLoading, isError, refetch } = useQuery<DemandOperationsReport>({ queryKey: [requestUrl] });

  if (isError) return <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Nao foi possivel carregar o relatorio de demandas.</p><Button variant="outline" className="mt-4" onClick={() => refetch()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div>;

  return <div className="space-y-5" data-testid="demand-operations-report">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4"><div className="flex gap-3"><label className="space-y-1"><span className="block text-xs text-muted-foreground">De</span><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="space-y-1"><span className="block text-xs text-muted-foreground">Ate</span><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><Button asChild variant="outline"><Link href="/demands?view=operations">Abrir Central<ArrowRight className="h-4 w-4" /></Link></Button></div>
    {isLoading || !data ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-64" /></div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[
        ["Taxa de conclusao", pct(data.summary.completionRate)], ["Taxa de atraso", pct(data.summary.overdueRate)], ["Taxa de resposta", pct(data.summary.responseRate)],
        ["Tempo ate o primeiro movimento", hours(data.summary.averageFirstMovementHours)], ["Tempo medio de resposta", hours(data.summary.averageResponseHours)], ["Tempo medio de resolucao", hours(data.summary.averageResolutionHours)],
      ].map(([label, value], index) => <div key={label} className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{index < 3 ? <BarChart3 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</div><div><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>)}</div>
      <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><ListChecks className="h-5 w-5" /><p className="text-sm"><strong>{data.summary.active}</strong> ativas, <strong>{data.summary.overdue}</strong> com SLA vencido e <strong>{data.summary.forwardingOverdue}</strong> com encaminhamento vencido.</p></div>
      <div className="grid gap-3 lg:grid-cols-3"><Ranking title="Por categoria" rows={data.breakdowns.categories} /><Ranking title="Por destino" rows={data.breakdowns.destinations} /><Ranking title="Por responsavel" rows={data.breakdowns.assignees} /></div>
    </>}
  </div>;
}
