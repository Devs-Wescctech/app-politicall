import { Bell, Check, X, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Notification } from "@shared/schema";

export function NotificationBell() {
  const { toast } = useToast();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: notifications, isLoading, isError } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível marcar a notificação como lida",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/notifications/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Sucesso",
        description: "Notificação excluída",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir a notificação",
        variant: "destructive",
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/notifications/mark-all-read", {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Sucesso",
        description: "Todas as notificações foram marcadas como lidas",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível marcar todas as notificações como lidas",
        variant: "destructive",
      });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "border-l-destructive";
      case "high":
        return "border-l-orange-500";
      case "normal":
        return "border-l-primary";
      case "low":
        return "border-l-muted-foreground";
      default:
        return "border-l-muted-foreground";
    }
  };

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
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm">Notificações</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {unreadCount} não {unreadCount === 1 ? "lida" : "lidas"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Marcar todas como lidas
                </Button>
              </>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive" data-testid="text-error-notifications">
              Erro ao carregar notificações. Tente novamente mais tarde.
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
              Nenhuma notificação
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-l-4 ${getPriorityColor(notification.priority)} ${
                    !notification.read ? "bg-muted/30" : ""
                  }`}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {notification.type === "info" && "Informação"}
                          {notification.type === "success" && "Sucesso"}
                          {notification.type === "warning" && "Aviso"}
                          {notification.type === "error" && "Erro"}
                          {notification.type === "demand" && "Demanda"}
                          {notification.type === "event" && "Evento"}
                          {notification.type === "comment" && "Comentário"}
                          {notification.type === "system" && "Sistema"}
                        </Badge>
                        {!notification.read && (
                          <Badge variant="destructive" className="text-xs">
                            Nova
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium mb-1">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                          data-testid={`button-mark-read-${notification.id}`}
                          aria-label="Marcar como lida"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(notification.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${notification.id}`}
                        aria-label="Excluir notificação"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
