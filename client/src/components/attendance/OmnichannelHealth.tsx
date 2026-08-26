import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Mail, MessageCircle, RefreshCw, Send, Settings } from "lucide-react";
import type { AttendanceChannelHealth, AttendanceChannelHealthResponse } from "@shared/attendance-channel-health";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const statusStyles = {
  operational: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  inactive: "border-border bg-muted/50 text-muted-foreground",
} as const;

function ChannelIcon({ channel }: { channel: AttendanceChannelHealth }) {
  if (channel.id === "email") return <Mail className="h-3.5 w-3.5" />;
  if (channel.id === "sms") return <Send className="h-3.5 w-3.5" />;
  return <MessageCircle className="h-3.5 w-3.5" />;
}

export default function OmnichannelHealth({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<AttendanceChannelHealthResponse>({
    queryKey: ["/api/attendance/channels/health"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="h-8 w-64 animate-pulse rounded bg-muted" aria-label="Carregando saúde dos canais" />;

  if (isError || !data) {
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()} data-testid="button-retry-channel-health">
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        Canais indisponíveis
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto" data-testid="attendance-channel-health">
      {data.channels.map(channel => (
        <Popover key={channel.id}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 shrink-0 gap-1.5 px-2 text-xs", statusStyles[channel.status])} data-testid={`channel-health-${channel.id}`}>
              <ChannelIcon channel={channel} />
              <span>{channel.label}</span>
              {channel.status === "operational" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-3">
            <div>
              <p className="text-sm font-semibold">{channel.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{channel.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border p-2"><p className="text-muted-foreground">Envio</p><p className="mt-0.5 font-semibold">{channel.canSend ? "Disponível" : "Indisponível"}</p></div>
              <div className="rounded border p-2"><p className="text-muted-foreground">Recebimento</p><p className="mt-0.5 font-semibold">{channel.canReceive ? "Disponível" : "Indisponível"}</p></div>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onOpenSettings}>
              <Settings className="h-3.5 w-3.5" /> Configurar canal
            </Button>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
