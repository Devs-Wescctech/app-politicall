import { useEffect, useRef, useState } from "react";
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
import { Plus, Calendar as CalendarIcon, MessageSquare, User, CalendarDays, RefreshCw, Play, Check, X, Trash2, Edit, Save, Search, ContactRound, Tag, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DemandSummary } from "@/components/demands/demand-summary";
import { getDemandSlaState, matchesDemandSearch } from "@/components/demands/demand-utils";
import { DemandAttachments, type DemandAttachmentView } from "@/components/demands/demand-attachments";
import { DemandForwardings } from "@/components/demands/demand-forwardings";
import { DemandOperationsCenter } from "@/components/demands/demand-operations-center";

type DemandCategory = { id: string; name: string; slaHours: number; color: string };
type DemandAssignee = { id: string; name: string; role: string };
type DemandContact = { id: string; name: string; phone?: string | null; city?: string | null };
type EnrichedDemand = Demand & { category?: DemandCategory | null; contact?: DemandContact | null; assigneeUser?: DemandAssignee | null };
type DemandSummaryData = { total: number; active: number; overdue: number; completed: number; urgent: number; averageResolutionHours: number | null };
type DemandHistoryItem = { id: string; eventType: string; fromValue?: string | null; toValue?: string | null; metadata?: Record<string, unknown> | null; createdAt: string; userName?: string | null };

const STATUS_CONFIG = {
  open: { label: "Aberta", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  triage: { label: "Triagem", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200" },
  in_progress: { label: "Em Andamento", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  waiting_requester: { label: "Aguardando solicitante", color: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  waiting_third_party: { label: "Aguardando terceiro", color: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  cancelled: { label: "Cancelada", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
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

function demandHistoryLabel(eventType: string): string {
  const labels: Record<string, string> = {
    created: "Demanda criada",
    status_changed: "Status alterado",
    priority_changed: "Prioridade alterada",
    categoryId_changed: "Categoria alterada",
    assigneeUserId_changed: "Responsavel alterado",
    contactId_changed: "Eleitor alterado",
    dueDate_changed: "Prazo alterado",
    follow_up_created: "Retorno agendado",
    attachment_uploaded: "Anexo adicionado",
    attachment_deleted: "Anexo excluido",
    sla_due_soon: "Alerta: SLA vence em breve",
    sla_overdue: "Alerta: SLA vencido",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function demandHistoryDetail(item: DemandHistoryItem): string | null {
  if (item.eventType === "attachment_uploaded" || item.eventType === "attachment_deleted") {
    return typeof item.metadata?.originalName === "string" ? item.metadata.originalName : null;
  }
  if (!item.fromValue && !item.toValue) return null;
  return `${item.fromValue || "-"} → ${item.toValue || "-"}`;
}

export default function Demands() {
  const sourceParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [pageView, setPageView] = useState(sourceParams.get("view") === "operations" ? "operations" : "board");
  const linkedDemandId = sourceParams.get("demandId");
  const linkedDemandHandled = useRef(false);
  const [isDialogOpen, setIsDialogOpen] = useState(sourceParams.get("origin") === "attendance" || sourceParams.get("new") === "1");
  const [selectedDemand, setSelectedDemand] = useState<EnrichedDemand | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [commentText, setCommentText] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [demandToDelete, setDemandToDelete] = useState<string | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<DemandAttachmentView | null>(null);
  const [isEditingDemand, setIsEditingDemand] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(undefined);
  const [editRecurrence, setEditRecurrence] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({
    open: 5,
    triage: 5,
    in_progress: 5,
    waiting_requester: 5,
    waiting_third_party: 5,
    completed: 5,
    cancelled: 5,
  });
  const { toast } = useToast();

  const { data: demands, isLoading } = useQuery<EnrichedDemand[]>({
    queryKey: ["/api/demands"],
  });

  useEffect(() => {
    if (!linkedDemandId || linkedDemandHandled.current || !demands) return;
    const linked = demands.find((demand) => demand.id === linkedDemandId);
    if (linked) setSelectedDemand(linked);
    linkedDemandHandled.current = true;
  }, [demands, linkedDemandId]);

  const { data: summary } = useQuery<DemandSummaryData>({ queryKey: ["/api/demands/summary"] });
  const { data: categories = [] } = useQuery<DemandCategory[]>({ queryKey: ["/api/demand-categories"] });
  const { data: assignees = [] } = useQuery<DemandAssignee[]>({ queryKey: ["/api/demand-assignees"] });
  const { data: contacts = [] } = useQuery<DemandContact[]>({ queryKey: ["/api/demand-contacts"] });

  const { data: comments } = useQuery<DemandComment[]>({
    queryKey: ["/api/demands", selectedDemand?.id, "comments"],
    enabled: !!selectedDemand,
  });

  const { data: history = [] } = useQuery<DemandHistoryItem[]>({
    queryKey: ["/api/demands", selectedDemand?.id, "history"],
    enabled: !!selectedDemand,
  });

  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<DemandAttachmentView[]>({
    queryKey: ["/api/demands", selectedDemand?.id, "attachments"],
    enabled: !!selectedDemand,
  });

  const form = useForm<InsertDemand>({
    resolver: zodResolver(insertDemandSchema),
    defaultValues: {
      title: sourceParams.get("title") || "",
      description: "",
      kind: sourceParams.get("contactId") ? "external" : "internal",
      origin: (sourceParams.get("origin") as InsertDemand["origin"]) || "manual",
      status: "open",
      priority: "medium",
      contactId: sourceParams.get("contactId"),
      categoryId: null,
      assigneeUserId: null,
      sourceType: sourceParams.get("sourceType"),
      sourceId: sourceParams.get("sourceId"),
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
      queryClient.invalidateQueries({ queryKey: ["/api/demands/summary"] });
      toast({ title: "Demanda criada com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel criar a demanda", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertDemand> }) =>
      apiRequest("PATCH", `/api/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demands/summary"] });
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

  const followUpMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDemand || !followUpDate) throw new Error("Selecione a data do retorno");
      const startDate = new Date(followUpDate);
      startDate.setHours(9, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
      return apiRequest("POST", `/api/demands/${selectedDemand.id}/follow-up`, { startDate: startDate.toISOString(), endDate: endDate.toISOString(), reminderMinutes: 60 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "history"] });
      setFollowUpDate(undefined);
      toast({ title: "Retorno adicionado a agenda" });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel agendar", description: error.message, variant: "destructive" }),
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedDemand) throw new Error("Selecione uma demanda");
      const data = new FormData();
      data.append("file", file);
      return apiRequest("POST", `/api/demands/${selectedDemand.id}/attachments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "history"] });
      toast({ title: "Anexo adicionado" });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel anexar", description: error.message, variant: "destructive" }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachment: DemandAttachmentView) => {
      if (!selectedDemand) throw new Error("Selecione uma demanda");
      return apiRequest("DELETE", `/api/demands/${selectedDemand.id}/attachments/${attachment.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demands", selectedDemand?.id, "history"] });
      setAttachmentToDelete(null);
      toast({ title: "Anexo excluido" });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel excluir o anexo", description: error.message, variant: "destructive" }),
  });

  const downloadAttachment = async (attachment: DemandAttachmentView) => {
    if (!selectedDemand) return;
    try {
      const response = await apiRequest("GET", `/api/demands/${selectedDemand.id}/attachments/${attachment.id}/download`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Nao foi possivel baixar o anexo", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const handleSubmit = (data: InsertDemand) => {
    if (data.kind === "external" && !data.contactId) {
      form.setError("contactId", { message: "Selecione o eleitor da demanda externa" });
      return;
    }
    if (!data.categoryId || !data.assigneeUserId) {
      if (!data.categoryId) form.setError("categoryId", { message: "Selecione uma categoria" });
      if (!data.assigneeUserId) form.setError("assigneeUserId", { message: "Selecione um responsavel" });
      return;
    }
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

  const handleStartEdit = () => {
    if (selectedDemand) {
      setEditTitle(selectedDemand.title);
      setEditDescription(selectedDemand.description || "");
      setEditPriority(selectedDemand.priority);
      setEditAssignee(selectedDemand.assignee || "");
      setEditDueDate(selectedDemand.dueDate ? new Date(selectedDemand.dueDate) : undefined);
      setEditRecurrence(selectedDemand.recurrence || "none");
      setIsEditingDemand(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingDemand(false);
  };

  const handleSaveEdit = () => {
    if (selectedDemand && editTitle.trim()) {
      updateMutation.mutate(
        { 
          id: selectedDemand.id, 
          data: {
            title: editTitle,
            description: editDescription,
            priority: editPriority,
            assignee: editAssignee,
            dueDate: editDueDate ? editDueDate.toISOString() : null,
            recurrence: editRecurrence,
          }
        },
        {
          onSuccess: () => {
            setIsEditingDemand(false);
            // Atualizar a demanda selecionada com os novos dados
            setSelectedDemand({
              ...selectedDemand,
              title: editTitle,
              description: editDescription,
              priority: editPriority,
              assignee: editAssignee,
              dueDate: editDueDate ?? null,
              recurrence: editRecurrence,
            });
          }
        }
      );
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
      const previousDemands = queryClient.getQueryData<EnrichedDemand[]>(["/api/demands"]);
      
      // Optimistic update
      queryClient.setQueryData(["/api/demands"], (old: EnrichedDemand[] | undefined) => {
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
    if (!matchesDemandSearch(demand, search)) return false;
    if (categoryFilter !== "all" && demand.categoryId !== categoryFilter) return false;
    if (assigneeFilter !== "all" && demand.assigneeUserId !== assigneeFilter) return false;
    // Filtro de prioridade
    if (priorityFilter !== "all" && demand.priority !== priorityFilter) {
      return false;
    }

    // Filtro de status de vencimento
    if (dueDateFilter !== "all") {
      const dueDateStatus = getDemandSlaState(demand);
      
      if (dueDateFilter === "overdue" && dueDateStatus !== "overdue") {
        return false;
      }
      if (dueDateFilter === "warning" && dueDateStatus !== "due_soon") {
        return false;
      }
      if (dueDateFilter === "ontime" && dueDateStatus !== "on_track") {
        return false;
      }
    }

    return true;
  });

  const groupedDemands = {
    open: filteredDemands?.filter((d) => d.status === "open" || d.status === "pending") || [],
    triage: filteredDemands?.filter((d) => d.status === "triage") || [],
    in_progress: filteredDemands?.filter((d) => d.status === "in_progress") || [],
    waiting_requester: filteredDemands?.filter((d) => d.status === "waiting_requester") || [],
    waiting_third_party: filteredDemands?.filter((d) => d.status === "waiting_third_party") || [],
    completed: filteredDemands?.filter((d) => d.status === "completed") || [],
    cancelled: filteredDemands?.filter((d) => d.status === "cancelled") || [],
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
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-3 sm:gap-6 sm:p-6 md:p-8">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-3xl">Demandas do Gabinete</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe cada solicitação do registro até a entrega.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button className="shrink-0" onClick={() => setIsDialogOpen(true)} data-testid="button-add-demand">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Demanda</span>
            <span className="sm:hidden">Nova</span>
          </Button>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Nova Demanda</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de demanda</FormLabel>
                      <Select value={field.value || "internal"} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="external">Externa, solicitada por eleitor</SelectItem><SelectItem value="internal">Interna, atividade do gabinete</SelectItem></SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("kind") === "external" && (
                  <FormField
                    control={form.control}
                    name="contactId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Eleitor *</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecione o eleitor" /></SelectTrigger></FormControl>
                          <SelectContent>{contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}{contact.city ? ` - ${contact.city}` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria *</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger data-testid="select-demand-category"><SelectValue placeholder="Categoria" /></SelectTrigger></FormControl>
                          <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} ({category.slaHours}h)</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="assigneeUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsavel *</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger data-testid="select-demand-assignee"><SelectValue placeholder="Selecione o responsavel" /></SelectTrigger></FormControl>
                        <SelectContent>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

      <Tabs value={pageView} onValueChange={setPageView} className="shrink-0">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="board">Quadro</TabsTrigger>
          <TabsTrigger value="operations">Central</TabsTrigger>
        </TabsList>
      </Tabs>

      {pageView === "board" ? <>
      <div className="shrink-0 rounded-xl border border-card-border bg-card p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.35fr)_repeat(4,minmax(0,1fr))]">
          <label className="space-y-1.5 sm:col-span-2 xl:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">Pesquisar</span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Protocolo, título ou eleitor" className="pl-9" aria-label="Pesquisar demandas" />
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full" data-testid="filter-priority" aria-label="Filtrar por prioridade">
                <SelectValue placeholder="Todas as prioridades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as prioridades</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Prazo</span>
            <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
              <SelectTrigger className="w-full" data-testid="filter-duedate" aria-label="Filtrar por prazo">
                <SelectValue placeholder="Todos os prazos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os prazos</SelectItem>
                <SelectItem value="ontime">Em dia</SelectItem>
                <SelectItem value="warning">Vencendo hoje</SelectItem>
                <SelectItem value="overdue">Atrasadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Categoria</span>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full" aria-label="Filtrar por categoria"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Responsável</span>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-full" aria-label="Filtrar por responsável"><SelectValue placeholder="Todos os responsáveis" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos os responsáveis</SelectItem>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="shrink-0"><DemandSummary summary={summary} /></div>

      <div className="min-h-0 flex-1 overflow-x-auto rounded-xl">
        <div className="flex min-h-full gap-4 pb-4">
          {Object.entries(groupedDemands).map(([status, statusDemands]) => (
            <section
              key={status} 
              className={`flex w-[320px] flex-shrink-0 flex-col overflow-hidden rounded-xl border border-card-border bg-muted/20 transition-colors sm:w-[350px] ${dragOverColumn === status ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="sticky top-0 z-10 border-b bg-card px-4 py-3">
              <div className="flex flex-row items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">
                  {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label}
                </h2>
                <Badge variant="secondary" className="min-w-7 justify-center px-2 py-1">
                  {statusDemands.length}
                </Badge>
              </div>
            </div>
            <div className="flex-1 space-y-3 p-3">
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
                      className={`cursor-move rounded-lg border-card-border shadow-none transition-colors hover:border-primary/40 ${draggedDemand === demand.id ? 'opacity-50' : ''}`}
                      onClick={() => setSelectedDemand(demand)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, demand)}
                      onDragEnd={handleDragEnd}
                      data-testid={`card-demand-${demand.id}`}
                    >
                      <div className="p-3 space-y-3">
                        {/* Header - Título e Prioridade */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-muted-foreground">{demand.protocol || "Sem protocolo"}</p>
                            <h4 className="font-medium text-sm leading-tight">{demand.title}</h4>
                          </div>
                          <span 
                            className={`${PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].color} text-xs font-medium shrink-0`}
                          >
                            {PRIORITY_CONFIG[demand.priority as keyof typeof PRIORITY_CONFIG].label}
                          </span>
                        </div>


                        {/* Metadados - Layout em Grid */}
                        <div className="space-y-2">
                          {/* Responsável */}
                          {demand.assigneeUser && (
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{demand.assigneeUser.name}</span>
                            </div>
                          )}

                          {demand.contact && (
                            <div className="flex items-center gap-2">
                              <ContactRound className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate text-xs text-muted-foreground">{demand.contact.name}</span>
                            </div>
                          )}

                          {demand.category && (
                            <div className="flex items-center gap-2">
                              <Tag className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{demand.category.name}</span>
                            </div>
                          )}

                          {demand.slaDueAt && (() => {
                            const slaState = getDemandSlaState(demand);
                            const slaLabel = slaState === "overdue" ? "SLA vencido" : slaState === "due_soon" ? "SLA vence em breve" : slaState === "completed" ? "SLA encerrado" : "SLA em dia";
                            const slaColor = slaState === "overdue" ? "text-red-600" : slaState === "due_soon" ? "text-orange-600" : "text-emerald-700 dark:text-emerald-300";
                            return <div className="flex items-center gap-2"><Timer className={`h-3 w-3 ${slaColor}`} /><span className={`text-xs ${slaColor}`}>{slaLabel}</span></div>;
                          })()}

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
                        {(demand.status === "open" || demand.status === "pending" || demand.status === "triage") && (
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
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed bg-background/60 px-4 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma demanda</p>
                </div>
              )}
            </div>
          </section>
          ))}
        </div>
      </div>
      </> : <DemandOperationsCenter categories={categories} assignees={assignees} onOpenDemand={(id) => {
        const demand = demands?.find((item) => item.id === id);
        if (demand) setSelectedDemand(demand);
      }} />}

      <Sheet open={!!selectedDemand} onOpenChange={(open) => {
        if (!open) {
          setSelectedDemand(null);
          setIsEditingDemand(false);
        }
      }}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col [&>button]:hidden">
          {selectedDemand && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <div className="flex items-center justify-between gap-4">
                  {isEditingDemand ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-lg font-semibold"
                      data-testid="input-edit-title"
                    />
                  ) : (
                    <SheetTitle>{selectedDemand.title}</SheetTitle>
                  )}
                  <div className="flex items-center gap-2">
                    {isEditingDemand ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="default"
                          onClick={handleSaveEdit}
                          disabled={!editTitle.trim() || updateMutation.isPending}
                          data-testid="button-save-edit"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={handleStartEdit}
                        data-testid="button-start-edit"
                        className="border-primary/50 hover:border-primary hover:bg-primary/10"
                      >
                        <Edit className="h-5 w-5 text-primary" />
                      </Button>
                    )}
                  </div>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
              <Tabs defaultValue="details">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
                  <TabsTrigger value="details" className="rounded-full">Detalhes</TabsTrigger>
                  <TabsTrigger value="comments" className="rounded-full">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Comentários
                  </TabsTrigger>
                  <TabsTrigger value="attachments">Anexos{attachments.length > 0 && <Badge variant="secondary" className="ml-1">{attachments.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="forwardings">Encaminhamentos</TabsTrigger>
                  <TabsTrigger value="history">Historico</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3 border-b pb-4">
                    <div><p className="text-xs text-muted-foreground">Protocolo</p><p className="text-sm font-medium">{selectedDemand.protocol || "Sem protocolo"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Origem</p><p className="text-sm font-medium capitalize">{selectedDemand.origin?.replace("_", " ") || "Manual"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Categoria</p><p className="text-sm font-medium">{selectedDemand.category?.name || "Nao definida"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Eleitor</p><p className="text-sm font-medium">{selectedDemand.contact?.name || "Demanda interna"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Responsavel</p><p className="text-sm font-medium">{selectedDemand.assigneeUser?.name || selectedDemand.assignee || "Nao definido"}</p></div>
                    <div><p className="text-xs text-muted-foreground">SLA</p><p className="text-sm font-medium">{selectedDemand.slaDueAt ? format(new Date(selectedDemand.slaDueAt), "dd/MM/yyyy HH:mm") : "Nao definido"}</p></div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Select value={selectedDemand.status} onValueChange={(value) => handleStatusChange(selectedDemand, value)} disabled={isEditingDemand}>
                      <SelectTrigger className="mt-2 rounded-full">
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
                    {isEditingDemand ? (
                      <Select value={editPriority} onValueChange={setEditPriority}>
                        <SelectTrigger className="mt-2 rounded-full" data-testid="select-edit-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className={`${PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].color} text-sm font-medium mt-2`}>
                        {PRIORITY_CONFIG[selectedDemand.priority as keyof typeof PRIORITY_CONFIG].label}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Descrição</label>
                    {isEditingDemand ? (
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="mt-2"
                        placeholder="Descrição da demanda"
                        data-testid="input-edit-description"
                      />
                    ) : (
                      selectedDemand.description && (
                        <p className="text-sm text-muted-foreground mt-2">{selectedDemand.description}</p>
                      )
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Responsável</label>
                    {isEditingDemand ? (
                      <Input
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                        className="mt-2"
                        placeholder="Nome do responsável"
                        data-testid="input-edit-assignee"
                      />
                    ) : (
                      selectedDemand.assignee && (
                        <p className="text-sm mt-2">{selectedDemand.assignee}</p>
                      )
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Recorrência</label>
                    {isEditingDemand ? (
                      <Select value={editRecurrence} onValueChange={setEditRecurrence}>
                        <SelectTrigger className="mt-2 rounded-full" data-testid="select-edit-recurrence">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RECURRENCE_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      selectedDemand.recurrence && selectedDemand.recurrence !== "none" && (
                        <p className="text-sm mt-2">{RECURRENCE_CONFIG[selectedDemand.recurrence as keyof typeof RECURRENCE_CONFIG].label}</p>
                      )
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Data de vencimento</label>
                    {isEditingDemand ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full mt-2 justify-start text-left font-normal"
                            data-testid="button-edit-due-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editDueDate ? format(editDueDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione uma data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={editDueDate}
                            onSelect={setEditDueDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      selectedDemand.dueDate && (
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
                      )
                    )}
                  </div>
                  <div className="border-t pt-4">
                    <label className="text-sm font-medium">Retorno na agenda</label>
                    <div className="mt-2 flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild><Button variant="outline" className="flex-1 justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{followUpDate ? format(followUpDate, "dd/MM/yyyy") : "Selecionar data"}</Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={followUpDate} onSelect={setFollowUpDate} /></PopoverContent>
                      </Popover>
                      <Button onClick={() => followUpMutation.mutate()} disabled={!followUpDate || followUpMutation.isPending}>Agendar</Button>
                    </div>
                  </div>
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
                <TabsContent value="attachments" className="mt-4">
                  <DemandAttachments
                    attachments={attachments}
                    loading={attachmentsLoading}
                    uploading={uploadAttachmentMutation.isPending}
                    onUpload={(file) => uploadAttachmentMutation.mutate(file)}
                    onDownload={downloadAttachment}
                    onDelete={setAttachmentToDelete}
                  />
                </TabsContent>
                <TabsContent value="forwardings" className="mt-4"><DemandForwardings demandId={selectedDemand.id} /></TabsContent>
                <TabsContent value="history" className="mt-4 space-y-3">
                  {history.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma alteracao registrada.</p> : history.map((item) => {
                    const detail = demandHistoryDetail(item);
                    return (
                      <div key={item.id} className="border-l-2 border-primary/40 pl-3">
                        <p className="text-sm font-medium">{demandHistoryLabel(item.eventType)}</p>
                        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
                        <p className="text-xs text-muted-foreground">{item.userName || "Sistema"} · {format(new Date(item.createdAt), "dd/MM/yyyy HH:mm")}</p>
                      </div>
                    );
                  })}
                </TabsContent>
              </Tabs>
              </div>
              <div className="px-6 py-4 border-t">
                <Button
                  onClick={() => setSelectedDemand(null)}
                  className="w-full"
                  data-testid="button-close-demand"
                >
                  Fechar
                </Button>
              </div>
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

      <AlertDialog open={!!attachmentToDelete} onOpenChange={(open) => { if (!open) setAttachmentToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo {attachmentToDelete?.originalName} sera removido da demanda. A exclusao continuara registrada no historico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAttachmentMutation.isPending}
              onClick={() => attachmentToDelete && deleteAttachmentMutation.mutate(attachmentToDelete)}
            >Excluir anexo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
