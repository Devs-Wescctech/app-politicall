import { CalendarDays, FileSignature, Megaphone, MessageSquareText, MessagesSquare, Timer } from "lucide-react";
import type { Contact360Summary as Summary, Contact360Visibility } from "@shared/contact-360";

const metrics = [
  { key: "openDemands", domain: "demands", label: "Demandas abertas", icon: Timer },
  { key: "demands", domain: "demands", label: "Demandas", icon: MessageSquareText },
  { key: "conversations", domain: "conversations", label: "Atendimentos", icon: MessagesSquare },
  { key: "events", domain: "events", label: "Agenda", icon: CalendarDays },
  { key: "campaigns", domain: "campaigns", label: "Campanhas", icon: Megaphone },
  { key: "petitions", domain: "petitions", label: "Peticoes", icon: FileSignature },
] as const;

export function Contact360Summary({ summary, visibility }: { summary: Summary; visibility: Contact360Visibility }) {
  const visibleMetrics = metrics.filter((metric) => visibility[metric.domain]);
  return (
    <section aria-label="Resumo do relacionamento" className="grid grid-cols-2 overflow-hidden rounded-xl border border-card-border bg-card shadow-sm md:grid-cols-3 xl:grid-cols-6">
      {visibleMetrics.map(({ key, label, icon: Icon }, index) => (
        <div key={key} className={`min-w-0 p-4 ${index > 0 ? "border-l" : ""} ${index > 1 ? "border-t md:border-t-0" : ""} ${index > 2 ? "xl:border-t-0" : ""}`}>
          <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" /><span className="truncate text-xs font-medium">{label}</span></div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary[key]}</p>
        </div>
      ))}
    </section>
  );
}
