import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttendanceLabel = { id: string; name: string; color: string };

export function useAttendanceLabels() {
  return useQuery<AttendanceLabel[]>({
    queryKey: ["/api/attendance/labels"],
  });
}

export function labelColor(labels: AttendanceLabel[], name: string) {
  return labels.find(label => label.name === name)?.color ?? "#64748b";
}

export function TagSelector({
  selected,
  onChange,
  className,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}) {
  const { data: labels = [], isLoading } = useAttendanceLabels();

  const toggle = (name: string) => {
    onChange(selected.includes(name)
      ? selected.filter(tag => tag !== name)
      : [...selected, name]);
  };

  if (isLoading) {
    return <div className="h-8 rounded-md bg-muted animate-pulse" />;
  }

  if (labels.length === 0) {
    return <p className="text-xs text-muted-foreground">Crie etiquetas em Configuracoes para selecionar aqui.</p>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map(label => {
        const active = selected.includes(label.name);
        return (
          <Button
            key={label.id}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 rounded px-2 text-xs"
            onClick={() => toggle(label.name)}
            data-testid={`button-select-label-${label.id}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
            {active ? <Check className="h-3 w-3" /> : null}
          </Button>
        );
      })}
    </div>
  );
}
