import { useState } from "react";
import { Bell, Check, X, CheckCheck, AlertCircle, Info, CheckCircle, AlertTriangle } from "lucide-react";
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

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "urgent":
        return "border-red-500 bg-red-50 dark:bg-red-950/20";
      case "high":
        return "border-orange-500 bg-orange-50 dark:bg-orange-950/20";
      case "normal":
        return "border-[#40E0D0] bg-[#40E0D0]/5";
      case "low":
        return "border-gray-300 bg-gray-50 dark:bg-gray-950/20";
      default:
        return "border-gray-200";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "success":
      case "campaign_approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "campaign_rejected":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-[#40E0D0]" />;
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
      
      <PopoverContent className="w-[450px] p-0" align="end">
        <div className="border-b bg-gradient-to-r from-[#40E0D0]/10 to-[#48D1CC]/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Badge className="bg-[#40E0D0] text-white rounded-full">
                  {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-[#40E0D0]/10"
                data-testid="button-close-notifications"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="w-full rounded-full border-[#40E0D0] text-[#40E0D0] hover:bg-[#40E0D0]/10"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <ScrollArea className="h-[450px]">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <div className="animate-pulse">Carregando notificações...</div>
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
              <p className="text-sm text-destructive">
                Erro ao carregar notificações
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Tente novamente mais tarde
              </p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-12 w-12 text-[#40E0D0] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">
                Nenhuma notificação no momento
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {visibleNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`border-2 transition-all duration-200 ${
                    optimisticDeletes.has(notification.id) ? "opacity-50 scale-95" : ""
                  } ${getPriorityColor(notification.priority)}`}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(notification.type)}
                        <Badge 
                          variant="secondary" 
                          className="text-xs rounded-full"
                        >
                          {getTypeLabel(notification.type)}
                        </Badge>
                        {!notification.isRead && (
                          <Badge 
                            className="bg-[#40E0D0] text-white text-xs rounded-full animate-pulse"
                          >
                            Nova
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsReadMutation.mutate(notification.id)}
                            disabled={markAsReadMutation.isPending}
                            className="rounded-full h-8 w-8 p-0 hover:bg-[#40E0D0]/10"
                            data-testid={`button-mark-read-${notification.id}`}
                            aria-label="Marcar como lida"
                          >
                            <Check className="h-4 w-4 text-[#40E0D0]" />
                          </Button>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(notification.id)}
                          disabled={deleteMutation.isPending || optimisticDeletes.has(notification.id)}
                          className="rounded-full h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                          data-testid={`button-delete-${notification.id}`}
                          aria-label="Excluir notificação"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <h4 className="font-semibold text-sm mb-1">
                      {notification.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    
                    <p className="text-xs text-muted-foreground/70">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}