import { useState } from "react";
import { Bell, Check, X, CheckCheck, AlertCircle, Info, CheckCircle, AlertTriangle, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Notification } from "@shared/schema";
import { Card } from "@/components/ui/card";

export function NotificationBell() {
  const { toast } = useToast();
  const [optimisticDeletes, setOptimisticDeletes] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const { data: notifications, isLoading, isError } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      
      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) => 
        old?.map(n => n.id === id ? { ...n, isRead: true } : n) || []
      );
      
      queryClient.setQueryData<{ count: number }>(["/api/notifications/unread-count"], (old) => ({
        count: Math.max(0, (old?.count || 0) - 1)
      }));

      return { previousNotifications };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(["/api/notifications"], context?.previousNotifications);
      toast({
        title: "Erro",
        description: "Não foi possível marcar como lida",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onMutate: async (id) => {
      setOptimisticDeletes(prev => new Set(prev).add(id));
      
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      
      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) => 
        old?.filter(n => n.id !== id) || []
      );

      const wasUnread = previousNotifications?.find(n => n.id === id && !n.isRead);
      if (wasUnread) {
        queryClient.setQueryData<{ count: number }>(["/api/notifications/unread-count"], (old) => ({
          count: Math.max(0, (old?.count || 0) - 1)
        }));
      }

      return { previousNotifications };
    },
    onError: (_err, id, context) => {
      setOptimisticDeletes(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.setQueryData(["/api/notifications"], context?.previousNotifications);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a notificação",
        variant: "destructive",
      });
    },
    onSuccess: (_data, id) => {
      setOptimisticDeletes(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({
        title: "Excluída!",
        description: "Notificação removida com sucesso",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/mark-all-read");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      
      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) => 
        old?.map(n => ({ ...n, isRead: true })) || []
      );
      
      queryClient.setQueryData<{ count: number }>(["/api/notifications/unread-count"], () => ({
        count: 0
      }));

      return { previousNotifications };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["/api/notifications"], context?.previousNotifications);
      toast({
        title: "Erro",
        description: "Não foi possível marcar todas como lidas",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Sucesso!",
        description: "Todas as notificações foram marcadas como lidas",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const visibleNotifications = notifications?.filter(n => !optimisticDeletes.has(n.id)) || [];

  const getPriorityColor = (priority?: string, isRead?: boolean) => {
    const baseClasses = isRead ? "bg-muted/30" : "bg-background";
    switch (priority) {
      case "urgent":
        return `${baseClasses} border-l-red-500`;
      case "high":
        return `${baseClasses} border-l-orange-500`;
      case "normal":
        return `${baseClasses} border-l-blue-500`;
      case "low":
        return `${baseClasses} border-l-gray-400`;
      default:
        return `${baseClasses} border-l-gray-300`;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case "success":
      case "campaign_approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "campaign_rejected":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "ai_response":
        return <Bot className="h-4 w-4 text-[#40E0D0]" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "info": return "Informação";
      case "success": return "Sucesso";
      case "warning": return "Aviso";
      case "error": return "Erro";
      case "demand": return "Demanda";
      case "event": return "Evento";
      case "comment": return "Comentário";
      case "system": return "Sistema";
      case "campaign_approved": return "Pesquisa Aprovada";
      case "campaign_rejected": return "Pesquisa Rejeitada";
      case "ai_response": return "Resposta IA";
      default: return type;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative rounded-full hover:bg-[#40E0D0]/10 h-8 w-8" 
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span 
              className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 
                         flex h-[18px] w-[18px] items-center justify-center 
                         rounded-full bg-[#FF0000] text-[10px] font-bold text-white
                         pointer-events-none animate-pulse
                         shadow-[0_0_0_2px_rgba(255,255,255,1)] dark:shadow-[0_0_0_2px_rgba(0,0,0,1)]"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold">Notificações</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  className="text-xs h-7"
                  data-testid="button-mark-all-read"
                >
                  Marcar todas
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                data-testid="button-close-notifications"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <div className="animate-pulse">Carregando...</div>
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Erro ao carregar notificações
              </p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Sem notificações
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {visibleNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-l-4 transition-all hover-elevate ${
                    optimisticDeletes.has(notification.id) ? "opacity-50" : ""
                  } ${getPriorityColor(notification.priority, notification.isRead)}`}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(notification.type)}
                      <span className="text-xs font-medium text-muted-foreground">
                        {getTypeLabel(notification.type)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                          className="h-7 w-7"
                          data-testid={`button-mark-read-${notification.id}`}
                          aria-label="Marcar como lida"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(notification.id)}
                        disabled={deleteMutation.isPending || optimisticDeletes.has(notification.id)}
                        className="h-7 w-7"
                        data-testid={`button-delete-${notification.id}`}
                        aria-label="Excluir"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  
                  <h4 className={`text-sm mb-1 ${notification.isRead ? "font-normal" : "font-semibold"}`}>
                    {notification.title}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    {notification.message}
                  </p>
                  
                  <p className="text-xs text-muted-foreground/60">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}