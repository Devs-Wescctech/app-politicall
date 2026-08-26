import { AlertCircle, Loader2, MessageCircle, Settings2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type WhatsappConnectionSummary = {
  id: string;
  name: string;
  phoneNumber: string | null;
  provider: string;
  status: string;
  lastTestedAt: string | null;
  lastError: string | null;
  type: "official" | "whu";
};

type SummaryState = "loading" | "empty" | "forbidden" | "error" | "success";

const statusLabels: Record<string, string> = {
  connected: "Conectado",
  configured: "Configurado",
  pending: "Pendente",
  error: "Com erro",
  disabled: "Desativado",
};

export function WhatsappConnectionsSummary({
  state,
  connections,
  onOpenManager,
}: {
  state: SummaryState;
  connections: WhatsappConnectionSummary[];
  onOpenManager: () => void;
}) {
  if (state === "loading") {
    return <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conexões</div>;
  }

  if (state === "forbidden") {
    return <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><ShieldAlert className="h-4 w-4" />Sem permissão para visualizar as conexões</div>;
  }

  if (state === "error") {
    return <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />Não foi possível carregar as conexões</div>;
  }

  return (
    <div className="space-y-4">
      {state === "empty" ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="h-4 w-4" />Nenhum número configurado
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {connections.map(connection => (
            <div key={connection.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{connection.name}</p>
                <p className="text-xs text-muted-foreground">{connection.phoneNumber || "Número não informado"}</p>
                {connection.lastError ? <p className="mt-1 text-xs text-destructive">{connection.lastError}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{connection.type === "official" ? "Meta oficial" : "WHU"}</Badge>
                <Badge variant={connection.status === "connected" ? "default" : "secondary"}>
                  {statusLabels[connection.status] || connection.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onOpenManager}>
        <Settings2 className="mr-2 h-4 w-4" />
        Gerenciar números
      </Button>
    </div>
  );
}
