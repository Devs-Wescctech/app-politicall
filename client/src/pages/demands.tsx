import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Demand, type InsertDemand, insertDemandSchema, type DemandComment, type InsertDemandComment } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar as CalendarIcon, MessageSquare, Clock, User, CalendarDays, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  in_progress: { label: "Em Andamento", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const PRIORITY_CONFIG = {
  low: { label: "Baixa", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  medium: { label: "Média", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  high: { label: "Alta", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  urgent: { label: "Urgente", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const RECURRENCE_CONFIG = {
  none: { label: "Não se repete" },
  daily: { label: "Diária" },
  weekly: { label: "Semanal" },
  monthly: { label: "Mensal" },
};

function getDueDateStatus(dueDate: string | null | undefined, status: string) {
  if (!dueDate || status === "completed" || status === "cancelled") {
    return null;
  }

  const now = new Date();
  const due = new Date(dueDate);
  const diffInHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 0) {
    return { status: "overdue", label: "Atrasado", color: "bg-destructive text-destructive-foreground" };
  } else if (diffInHours <= 24) {
    return { status: "warning", label: "Prestes a vencer", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" };
  } else {
    return { status: "ok", label: "Em dia", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
  }
}

export default function Demands() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [commentText, setCommentText] = useState("");
  const { toast } = useToast();

  const { data: demands, isLoading } = useQuery<Demand[]>({
    queryKey: ["/api/demands"],
  });

  const { data: comments } = useQuery<DemandComment[]>({
    queryKey: ["/api/demands", selectedDemand?.id, "comments"],
    enabled: !!selectedDemand,
  });

  const form = useForm<InsertDemand>({
    resolver: zodResolver(insertDemandSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
      assignee: "",
      collaborators: [],
      dueDate: undefined,
      recurrence: "none",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertDemand) => apiRequest("POST", "/api/demands", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands"] });
      toast({ title: "Demanda criada com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertDemand> }) =>
      apiRequest("PATCH", `/api/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands"] });
      toast({ title: "Demanda atualizada!" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: InsertDemandComment) => apiRequest("POST", `/api/demands/${selectedDemand?.id}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "comments"] });
      setCommentText("");
    },
  });

  const handleSubmit = (data: InsertDemand) => {
    createMutation.mutate(data);
  };

  const handleStatusChange = (demand: Demand, newStatus: string) => {
    updateMutation.mutate({ id: demand.id, data: { status: newStatus } });
  };

  const handleAddComment = () => {
    if (commentText.trim() && selectedDemand) {
      addCommentMutation.mutate({ demandId: selectedDemand.id, comment: commentText });
    }
  };

  const [draggedDemand, setDraggedDemand] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, demand: Demand) => {
    e.dataTransfer.setData("demandId", demand.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedDemand(demand.id);
  };

  const handleDragEnd = () => {
    setDraggedDemand(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (status: string) => {
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const demandId = e.dataTransfer.getData("demandId");
    const demand = demands?.find(d => d.id === demandId);
    
    if (demand && demand.status !== newStatus) {
      // Save previous state
      const previousDemands = queryClient.getQueryData<Demand[]>(["/api/demands"]);
      
      // Optimistic update
      queryClient.setQueryData(["/api/demands"], (old: Demand[] | undefined) => {
        if (!old) return old;
        return old.map(d => 
          d.id === demandId ? { ...d, status: newStatus } : d
        );
      });

      updateMutation.mutate(
        { id: demandId, data: { status: newStatus } },
        {
          onError: () => {
            // Restore exact previous state
            queryClient.setQueryData(["/api/demands"], previousDemands);
          }
        }
      );
    }
    setDraggedDemand(null);
    setDragOverColumn(null);
  };

  const groupedDemands = {
    pending: demands?.filter((d) => d.status === "pending") || [],
    in_progress: demands?.filter((d) => d.status === "in_progress") || [],
    completed: demands?.filter((d) => d.status === "completed") || [],
    cancelled: demands?.filter((d) => d.status === "cancelled") || [],
  };

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 md:p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold">Demandas do Gabinete</h1>
          <p className="text-muted-foreground mt-2">Gerencie as demandas com pipeline visual</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-demand">
            <Plus className="w-4 h-4 mr-2" />
            Nova Demanda
          </Button>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Nova Demanda</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input placeholder="Título da demanda" data-testid="input-demand-title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Detalhes da demanda" data-testid="input-demand-description" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prioridade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                              <SelectItem key={key} value={key}>{config.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="assignee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsável</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome" data-testid="input-assignee" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="recurrence"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recorrência</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-recurrence">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(RECURRENCE_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de vencimento</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-due-date">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(new Date(field.value), "PPP", { locale: ptBR }) : "Selecione a data"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date?.toISOString())}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="collaborators"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Colaboradores Envolvidos (Opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Digite os nomes separados por vírgula" 
                          data-testid="input-collaborators"
                          value={field.value?.join(", ") || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            const collaborators = value.split(",").map(c => c.trim()).filter(c => c.length > 0);
                            field.onChange(collaborators);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
                <DialogFooter className="px-6 py-4 border-t">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-demand">
                    {createMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 pb-4 min-h-full">
          {Object.entries(groupedDemands).map(([status, statusDemands]) => (
            <Card 
              key={status} 
              className={`flex-shrink-0 w-[350px] transition-colors ${dragOverColumn === status ? 'ring-2 ring-primary' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <CardHeader className="p-4">
              <div className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base font-medium">
                  {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label}
                </CardTitle>
                <Badge variant="secondary" className="px-2 py-1">
                  {statusDemands.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3 min-h-[300px]">
              {isLoading ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
              ) : statusDemands.length > 0 ? (
                statusDemands.map((demand) => {
                  const dueDateStr = typeof demand.dueDate === 'string' ? demand.dueDate : demand.dueDate?.toISOString();
                  const dueDateStatus = getDueDateStatus(dueDateStr, demand.status);
                  return (
                    <Card
                      key={demand.id}
                      className={`hover-elevate active-elevate-2 cursor-move ${draggedDemand === demand.id ? 'opacity-50' : ''}`}
                      onClick={() => setSelectedDemand(demand)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, demand)}
                      onDragEnd={handleDragEnd}
                      data-testid={`card-demand-${demand.id}`}
                    >
                      <div className="p-3 space-y-3">
                        {/* Header - Título e Prioridade */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm leading-tight flex-1">{demand.title}</h4>
                          <Badge 
                            className={`${PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].color} shrink-0`}
                            variant="secondary"
                          >
                            {PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].label}
                          </Badge>
                        </div>

                        {/* Descrição */}
                        {demand.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {demand.description}
                          </p>
                        )}

                        {/* Metadados - Layout em Grid */}
                        <div className="space-y-2">
                          {/* Responsável */}
                          {demand.assignee && (
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{demand.assignee}</span>
                            </div>
                          )}

                          {/* Data de Vencimento */}
                          {demand.dueDate && (
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(demand.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                          )}

                          {/* Recorrência */}
                          {demand.recurrence && demand.recurrence !== "none" && (
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {RECURRENCE_CONFIG[demand.recurrence as keyof typeof RECURRENCE_CONFIG].label}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Status do Vencimento - Badge destacado */}
                        {dueDateStatus && (
                          <div className="pt-2 border-t">
                            <Badge 
                              className={`${dueDateStatus.color} text-xs w-full justify-center`} 
                              data-testid={`badge-due-status-${dueDateStatus.status}`}
                            >
                              {dueDateStatus.label}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma demanda</p>
              )}
            </CardContent>
          </Card>
          ))}
        </div>
      </div>

      <Sheet open={!!selectedDemand} onOpenChange={(open) => !open && setSelectedDemand(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedDemand && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedDemand.title}</SheetTitle>
              </SheetHeader>
              <Tabs defaultValue="details" className="mt-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Detalhes</TabsTrigger>
                  <TabsTrigger value="comments">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Comentários
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Select value={selectedDemand.status} onValueChange={(value) => handleStatusChange(selectedDemand, value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Prioridade</label>
                    <Badge className={`${PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].color} mt-2`}>
                      {PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].label}
                    </Badge>
                  </div>
                  {selectedDemand.description && (
                    <div>
                      <label className="text-sm font-medium">Descrição</label>
                      <p className="text-sm text-muted-foreground mt-2">{selectedDemand.description}</p>
                    </div>
                  )}
                  {selectedDemand.assignee && (
                    <div>
                      <label className="text-sm font-medium">Responsável</label>
                      <p className="text-sm mt-2">{selectedDemand.assignee}</p>
                    </div>
                  )}
                  {selectedDemand.recurrence && selectedDemand.recurrence !== "none" && (
                    <div>
                      <label className="text-sm font-medium">Recorrência</label>
                      <p className="text-sm mt-2">{RECURRENCE_CONFIG[selectedDemand.recurrence as keyof typeof RECURRENCE_CONFIG].label}</p>
                    </div>
                  )}
                  {selectedDemand.dueDate && (
                    <div>
                      <label className="text-sm font-medium">Data de vencimento</label>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="text-sm">{format(new Date(selectedDemand.dueDate), "PPP", { locale: ptBR })}</p>
                        {(() => {
                          const dueDateStr = typeof selectedDemand.dueDate === 'string' ? selectedDemand.dueDate : selectedDemand.dueDate?.toISOString();
                          const dueDateStatus = getDueDateStatus(dueDateStr, selectedDemand.status);
                          return dueDateStatus ? (
                            <Badge className={dueDateStatus.color}>
                              {dueDateStatus.label}
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="comments" className="space-y-4 mt-4">
                  <div className="space-y-3">
                    {comments?.map((comment: any) => (
                      <Card key={comment.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{comment.userName}</p>
                        </div>
                        <p className="text-sm mt-1">{comment.comment}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(comment.createdAt), "PPP 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </Card>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Adicionar comentário..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      data-testid="input-comment"
                    />
                    <Button onClick={handleAddComment} disabled={!commentText.trim() || addCommentMutation.isPending} data-testid="button-add-comment">
                      Adicionar Comentário
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
