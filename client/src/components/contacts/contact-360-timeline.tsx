import { CalendarDays, FileSignature, Megaphone, MessageSquareText, MessagesSquare } from "lucide-react";
import { Link } from "wouter";
import type { Contact360ActivityType, Contact360TimelineItem } from "@shared/contact-360";
import { Badge } from "@/components/ui/badge";

const typeConfig: Record<Contact360ActivityType, { label: string; icon: typeof CalendarDays; className: string }> = {
  demand: { label: "Demanda", icon: MessageSquareText, className: "border-amber-200 bg-amber-50 text-amber-700" },
  attendance: { label: "Atendimento", icon: MessagesSquare, className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  event: { label: "Agenda", icon: CalendarDays, className: "border-blue-200 bg-blue-50 text-blue-700" },
  campaign: { label: "Campanha", icon: Megaphone, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  petition: { label: "Peticao", icon: FileSignature, className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function Contact360Timeline({ items }: { items: Contact360TimelineItem[] }) {
  if (items.length === 0) {
    return <EmptyState text="Nenhuma interacao registrada para este eleitor." />;
  }
  return (
    <ol className="divide-y rounded-lg border bg-card">
      {items.map((item) => {
        const config = typeConfig[item.type];
        const Icon = config.icon;
        const row = (
          <div className="flex gap-3 p-4 transition-colors hover:bg-muted/40">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${config.className}`}><Icon className="h-4 w-4" aria-hidden="true" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-foreground">{item.title}</p><Badge variant="outline">{config.label}</Badge>{item.status && <Badge variant="secondary">{item.status}</Badge>}</div>
              {item.description && <p className="mt-1 truncate text-sm text-muted-foreground">{item.description}</p>}
              <time className="mt-1 block text-xs text-muted-foreground">{formatDate(item.occurredAt)}</time>
            </div>
          </div>
        );
        return <li key={item.id}>{item.href ? <Link href={item.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row}</Link> : row}</li>;
      })}
    </ol>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center"><MessagesSquare className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-medium">{text}</p></div>;
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
