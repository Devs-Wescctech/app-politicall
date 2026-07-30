import { useState } from "react";
import { CircleAlert, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AttendanceConnectionMode } from "@/lib/attendance-connection-state";
import { cn } from "@/lib/utils";

export interface ConnectionStatusProps {
  mode: AttendanceConnectionMode;
  httpRefreshFailed?: boolean;
  retryInProgress?: boolean;
  onRetry?: () => void | Promise<unknown>;
  className?: string;
}

const modeContent = {
  connected: { label: "Conectado", icon: Wifi, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  reconnecting: { label: "Reconectando", icon: RefreshCw, className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  fallback: { label: "Sincronização automática", icon: WifiOff, className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
} satisfies Record<AttendanceConnectionMode, { label: string; icon: typeof Wifi; className: string }>;

export function ConnectionStatus({
  mode,
  httpRefreshFailed = false,
  retryInProgress = false,
  onRetry,
  className,
}: ConnectionStatusProps) {
  const [retryRequested, setRetryRequested] = useState(false);
  const isBusy = retryInProgress || retryRequested;
  const content = httpRefreshFailed
    ? { label: "Falha ao atualizar", icon: CircleAlert, className: "border-destructive/30 bg-destructive/10 text-destructive" }
    : modeContent[mode];
  const StatusIcon = content.icon;
  const showRetry = httpRefreshFailed || mode !== "connected";

  const handleRetry = async () => {
    if (isBusy || !onRetry) return;

    setRetryRequested(true);
    try {
      await onRetry();
    } finally {
      setRetryRequested(false);
    }
  };

  return (
    <div className={cn("flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 py-1 text-xs", className)}>
      <Badge
        role="status"
        aria-live="polite"
        aria-atomic="true"
        variant="outline"
        className={cn("min-h-6 gap-1.5 rounded-md px-2 py-0.5", content.className)}
      >
        <StatusIcon aria-hidden="true" className={cn("h-3.5 w-3.5", mode === "reconnecting" && !httpRefreshFailed && "animate-spin motion-reduce:animate-none")} />
        <span>{content.label}</span>
      </Badge>
      {showRetry ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-6 min-w-6 px-2 py-0.5 text-xs focus-visible:ring-2"
          onClick={handleRetry}
          disabled={isBusy || !onRetry}
          aria-busy={isBusy}
        >
          <RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5", isBusy && "animate-spin motion-reduce:animate-none")} />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
