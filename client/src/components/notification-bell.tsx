import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

export function NotificationBell() {
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = unreadData?.count || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
          aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Notificações</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unreadCount} não {unreadCount === 1 ? "lida" : "lidas"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Clique para ver todas as notificações
        </p>
      </PopoverContent>
    </Popover>
  );
}
