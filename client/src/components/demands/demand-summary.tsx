import { AlertTriangle, CheckCircle2, Clock3, ListTodo } from "lucide-react";

type Summary = { total: number; active: number; overdue: number; completed: number; urgent: number; averageResolutionHours: number | null };

export function DemandSummary({ summary }: { summary?: Summary }) {
  const items = [
    { label: "Ativas", value: summary?.active ?? 0, icon: ListTodo, tone: "text-slate-700 dark:text-slate-200" },
    { label: "SLA vencido", value: summary?.overdue ?? 0, icon: AlertTriangle, tone: "text-red-700 dark:text-red-300" },
    { label: "Urgentes", value: summary?.urgent ?? 0, icon: Clock3, tone: "text-orange-700 dark:text-orange-300" },
    { label: "Concluidas", value: summary?.completed ?? 0, icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-300" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo das demandas">
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="flex min-h-20 items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
          </div>
          <div className="min-w-0"><div className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</div><div className="truncate text-xs text-muted-foreground">{label}</div></div>
        </div>
      ))}
    </div>
  );
}
