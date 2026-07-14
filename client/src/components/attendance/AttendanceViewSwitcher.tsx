import { Archive, BarChart2, FileClock, MessageSquare, Settings, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AttendanceView = "inbox" | "reports" | "contacts" | "archived" | "history" | "settings";

const VIEWS: Array<{ value: AttendanceView; label: string; icon: typeof MessageSquare }> = [
  { value: "inbox", label: "Caixa", icon: MessageSquare },
  { value: "reports", label: "Relatórios", icon: BarChart2 },
  { value: "contacts", label: "Contatos", icon: Users },
  { value: "archived", label: "Arquivados", icon: Archive },
  { value: "history", label: "Histórico", icon: FileClock },
  { value: "settings", label: "Configurações", icon: Settings },
];

export function AttendanceViewSwitcher({
  value,
  onValueChange,
  compact = false,
}: {
  value: AttendanceView;
  onValueChange: (value: AttendanceView) => void;
  compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={next => onValueChange(next as AttendanceView)}>
      <SelectTrigger
        className={cn(
          "bg-background text-xs font-medium",
          compact ? "h-7 w-[132px] border-0 px-1.5 shadow-none" : "h-9 w-[170px]",
        )}
        data-testid="select-attendance-view"
        aria-label="Visualização de atendimentos"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VIEWS.map(item => {
          const Icon = item.icon;
          return (
            <SelectItem key={item.value} value={item.value}>
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
