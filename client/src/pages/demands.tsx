import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Demand, type InsertDemand, insertDemandSchema, type DemandComment, type InsertDemandComment } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar as CalendarIcon, MessageSquare, Clock, User, CalendarDays, RefreshCw, Play, Check, X, Trash2 } from "lucide-react";
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
};

const PRIORITY_CONFIG = {
  low: { label: "Baixa", color: "text-slate-600 dark:text-slate-400" },
  medium: { label: "Média", color: "text-yellow-600 dark:text-yellow-400" },
  high: { label: "Alta", color: "text-orange-600 dark:text-orange-400" },
  urgent: { label: "Urgente", color: "text-red-600 dark:text-red-400" },
};

const RECURRENCE_CONFIG = {
  none: { label: "Não se repete" },
  daily: { label: "Diária" },
  weekly: { label: "Semanal" },
  monthly: { label: "Mensal" },
};

function getDueDateStatus(dueDate: string | null | undefined, status: string) {
  if (!dueDate || status === "completed") {
    return null;
  }

  const now = new Date();
  const due = new Date(dueDate);
  const diffInHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 0) {
    return { status: "overdue", label: "Atrasado", color: "text-destructive" };
  } else if (diffInHours <= 24) {
    return { status: "warning", label: "Prestes a vencer", color: "text-orange-600 dark:text-orange-400" };
  } else {
    return { status: "ok", label: "Em dia", color: "text-green-600 dark:text-green-400" };
  }
}

export default function Demands() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [commentText, setCommentText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [demandToDelete, setDemandToDelete] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({
    pending: 5,
    in_progress: 5,
    completed: 5,
  });
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/demands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands"] });
      toast({ title: "Demanda excluída com sucesso!" });
      setDeleteConfirmOpen(false);
      setDemandToDelete(null);
    },
    onError: () => {
      toast({ 
        title: "Erro ao excluir demanda",
        variant: "destructive"
      });
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

  // Filtragem das demandas
  const filteredDemands = demands?.filter((demand) => {
    // Filtro de prioridade
    if (priorityFilter !== "all" && demand.priority !== priorityFilter) {
      return false;
    }

    // Filtro de status de vencimento
    if (dueDateFilter !== "all") {
      const dueDateStr = typeof demand.dueDate === 'string' ? demand.dueDate : demand.dueDate?.toISOString();
      const dueDateStatus = getDueDateStatus(dueDateStr, demand.status);
      
      if (dueDateFilter === "overdue" && dueDateStatus?.status !== "overdue") {
        return false;
      }
      if (dueDateFilter === "warning" && dueDateStatus?.status !== "warning") {
        return false;
      }
      if (dueDateFilter === "ontime" && (!dueDateStatus || dueDateStatus.status === "overdue" || dueDateStatus.status === "warning")) {
        return false;
      }
    }

    return true;
  });

  const groupedDemands = {
    pending: filteredDemands?.filter((d) => d.status === "pending") || [],
    in_progress: filteredDemands?.filter((d) => d.status === "in_progress") || [],
    completed: filteredDemands?.filter((d) => d.status === "completed") || [],
  };

  const handleShowMore = (status: string) => {
    setVisibleCounts(prev => ({
      ...prev,
      [status]: prev[status] + 5
    }));
  };

  const handleStartDemand = (e: React.MouseEvent, demandId: string) => {
    e.stopPropagation(); // Previne abrir o sheet ao clicar no botão
    updateMutation.mutate(
      { id: demandId, data: { status: "in_progress" } },
      {
        onSuccess: () => {
          toast({ title: "Demanda iniciada!" });
        }
      }
    );
  };

  const handleCompleteDemand = (e: React.MouseEvent, demandId: string) => {
    e.stopPropagation(); // Previne abrir o sheet ao clicar no botão
    updateMutation.mutate(
      { id: demandId, data: { status: "completed" } },
      {
        onSuccess: () => {
          toast({ title: "Demanda concluída!" });
        }
      }
    );
  };

  const handleDeleteClick = (e: React.MouseEvent, demandId: string) => {
    e.stopPropagation(); // Previne abrir o sheet ao clicar no botão
    setDemandToDelete(demandId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (demandToDelete) {
      deleteMutation.mutate(demandToDelete);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 md:p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold">Demandas do Gabinete</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Filtro de Prioridade */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px] rounded-full" data-testid="filter-priority">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Status de Vencimento */}
          <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
            <SelectTrigger className="w-[150px] rounded-full" data-testid="filter-duedate">
              <SelectValue placeholder="Vencimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="ontime">Em dia</SelectItem>
              <SelectItem value="warning">Vencendo hoje</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
            </SelectContent>
          </Select>

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
                <DialogFooter className="px-6 py-4 border-t grid grid-cols-1 gap-2">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-demand" className="rounded-full w-full">
                    {createMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 pb-6 min-h-full">
          {Object.entries(groupedDemands).map(([status, statusDemands]) => (
            <Card 
              key={status} 
              className={`flex-shrink-0 w-[350px] transition-colors ${dragOverColumn === status ? 'ring-2 ring-primary' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <CardHeader className="p-4 sticky top-0 bg-card z-10 border-b">
              <div className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base font-medium">
                  {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label}
                </CardTitle>
                <Badge variant="secondary" className="px-2 py-1">
                  {statusDemands.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 pb-6 space-y-3">
              {isLoading ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
              ) : statusDemands.length > 0 ? (
                <>
                  {statusDemands.slice(0, visibleCounts[status] || 5).map((demand) => {
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
                          <span 
                            className={`${PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].color} text-xs font-medium shrink-0`}
                          >
                            {PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].label}
                          </span>
                        </div>


                        {/* Metadados - Layout em Grid */}
                        <div className="space-y-2">
                          {/* Responsável */}
                          {demand.assignee && (
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{demand.assignee}</span>
                            </div>
                          )}

                          {/* Data de Vencimento e Status */}
                          {demand.dueDate && (
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(demand.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                                {dueDateStatus && (
                                  <>
                                    {" - "}
                                    <span 
                                      className={dueDateStatus.color}
                                      data-testid={`badge-due-status-${dueDateStatus.status}`}
                                    >
                                      {dueDateStatus.label}
                                    </span>
                                  </>
                                )}
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

                        {/* Botão Iniciar para demandas pendentes */}
                        {demand.status === "pending" && (
                          <div className="pt-2">
                            <Button
                              size="sm"
                              className="w-full rounded-full"
                              onClick={(e) => handleStartDemand(e, demand.id)}
                              data-testid={`button-start-${demand.id}`}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Iniciar
                            </Button>
                          </div>
                        )}

                        {/* Botão Concluir para demandas em andamento */}
                        {demand.status === "in_progress" && (
                          <div className="pt-2">
                            <Button
                              size="sm"
                              className="w-full rounded-full"
                              variant="default"
                              onClick={(e) => handleCompleteDemand(e, demand.id)}
                              data-testid={`button-complete-${demand.id}`}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Concluir
                            </Button>
                          </div>
                        )}

                        {/* Botão Excluir para demandas concluídas */}
                        {demand.status === "completed" && (
                          <div className="pt-2">
                            <Button
                              size="sm"
                              className="w-full rounded-full"
                              variant="destructive"
                              onClick={(e) => handleDeleteClick(e, demand.id)}
                              data-testid={`button-delete-${demand.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                  })}
                  {statusDemands.length > (visibleCounts[status] || 5) && (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => handleShowMore(status)}
                    >
                      Ver mais ({statusDemands.length - (visibleCounts[status] || 5)} restantes)
                    </Button>
                  )}
                </>
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
                    <p className={`${PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].color} text-sm font-medium mt-2`}>
                      {PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].label}
                    </p>
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
                      <p className="text-sm mt-2">
                        {format(new Date(selectedDemand.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                        {(() => {
                          const dueDateStr = typeof selectedDemand.dueDate === 'string' ? selectedDemand.dueDate : selectedDemand.dueDate?.toISOString();
                          const dueDateStatus = getDueDateStatus(dueDateStr, selectedDemand.status);
                          return dueDateStatus ? (
                            <>
                              {" - "}
                              <span className={dueDateStatus.color}>
                                {dueDateStatus.label}
                              </span>
                            </>
                          ) : null;
                        })()}
                      </p>
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

      {/* Modal de confirmação de exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta demanda? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
