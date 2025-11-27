import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type Event, type InsertEvent, insertEventSchema } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar as CalendarIcon, List, Clock, Trash2, Pencil, MapPin, RefreshCw, CheckCircle2, AlertCircle, Link2, Video, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, addMonths, subMonths, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SiGooglecalendar } from "react-icons/si";
import { Link } from "wouter";

const CATEGORY_CONFIG = {
  meeting: { label: "Reunião", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", borderColor: "#3b82f6" },
  event: { label: "Evento", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", borderColor: "#9333ea" },
  deadline: { label: "Prazo", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", borderColor: "#ef4444" },
  personal: { label: "Pessoal", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", borderColor: "#22c55e" },
  imprensa: { label: "Imprensa", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", borderColor: "#f97316" },
  comicio: { label: "Comício", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200", borderColor: "#6366f1" },
  sessao: { label: "Sessão Plenária", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", borderColor: "#14b8a6" },
  audiencia: { label: "Audiência Pública", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200", borderColor: "#06b6d4" },
  votacao: { label: "Votação", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200", borderColor: "#f43f5e" },
  campanha: { label: "Campanha", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", borderColor: "#f59e0b" },
  debate: { label: "Debate", color: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200", borderColor: "#8b5cf6" },
  visita: { label: "Visita Comunitária", color: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200", borderColor: "#84cc16" },
  entrevista: { label: "Entrevista", color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200", borderColor: "#ec4899" },
  sabatina: { label: "Sabatina", color: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200", borderColor: "#d946ef" },
  carreata: { label: "Carreata", color: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200", borderColor: "#0ea5e9" },
  panfletagem: { label: "Panfletagem", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", borderColor: "#10b981" },
  comissao: { label: "Reunião de Comissão", color: "bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200", borderColor: "#78716c" },
  inauguracao: { label: "Inauguração", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", borderColor: "#eab308" },
  coletiva: { label: "Coletiva de Imprensa", color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200", borderColor: "#64748b" },
  partido: { label: "Reunião Partidária", color: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200", borderColor: "#71717a" },
  almoco: { label: "Almoço Político", color: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200", borderColor: "#737373" },
  live: { label: "Live/Transmissão", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", borderColor: "#dc2626" },
  gabinete: { label: "Atendimento Gabinete", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", borderColor: "#2563eb" },
  manifestacao: { label: "Manifestação", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", borderColor: "#ea580c" },
};

// Cores disponíveis para a borda
const BORDER_COLORS = [
  { label: "Azul", value: "#3b82f6" },
  { label: "Roxo", value: "#9333ea" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Verde", value: "#22c55e" },
  { label: "Laranja", value: "#f97316" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Ciano", value: "#06b6d4" },
  { label: "Rosa", value: "#f43f5e" },
  { label: "Âmbar", value: "#f59e0b" },
  { label: "Violeta", value: "#8b5cf6" },
  { label: "Lima", value: "#84cc16" },
  { label: "Pink", value: "#ec4899" },
  { label: "Fúcsia", value: "#d946ef" },
  { label: "Céu", value: "#0ea5e9" },
  { label: "Esmeralda", value: "#10b981" },
  { label: "Amarelo", value: "#eab308" },
  { label: "Ardósia", value: "#64748b" },
  { label: "Zinco", value: "#71717a" },
  { label: "Cinza", value: "#737373" },
];

// Configuração de recorrência
const RECURRENCE_CONFIG = {
  none: { label: "Não se repete" },
  daily: { label: "Diária" },
  weekly: { label: "Semanal" },
  monthly: { label: "Mensal" },
};

// Tipo para o formulário com campos string separados
interface EventFormData {
  title: string;
  description?: string | null;
  startDateStr: string;
  startTimeStr: string;
  endDateStr: string;
  endTimeStr: string;
  category?: string | null;
  borderColor?: string | null;
  location?: string | null;
  recurrence?: string | null;
  reminder?: boolean | null;
  reminderMinutes?: number | null;
}

// Schema de validação personalizado para o formulário
const eventFormSchema = insertEventSchema.omit({ startDate: true, endDate: true }).extend({
  startDateStr: z.string().min(10, "Data obrigatória"),
  startTimeStr: z.string().min(5, "Hora obrigatória"),
  endDateStr: z.string().min(10, "Data obrigatória"),
  endTimeStr: z.string().min(5, "Hora obrigatória"),
});

export default function Agenda() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"list" | "calendar" | "timeline">("list");
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    refetchInterval: 60000, // Atualizar a cada minuto para remover eventos passados
  });

  // Query for Google Calendar integration status
  const { data: googleCalendarStatus, refetch: refetchGoogleCalendar } = useQuery<{
    configured: boolean;
    authorized: boolean;
    email?: string;
    lastSyncAt?: string;
  }>({
    queryKey: ["/api/google-calendar"],
    refetchInterval: 60000, // Check status every minute
  });

  // Mutation for syncing Google Calendar
  const syncGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      return apiRequest("POST", "/api/google-calendar/sync");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google-calendar"] });
      toast({ 
        title: "Sincronização concluída!", 
        description: data.message || `${data.synced || 0} eventos sincronizados com o Google Calendar` 
      });
      setIsSyncing(false);
    },
    onError: (error: any) => {
      console.error("Erro ao sincronizar com Google Calendar:", error);
      toast({ 
        title: "Erro na sincronização", 
        description: error.response?.data?.error || "Falha ao sincronizar com o Google Calendar",
        variant: "destructive" 
      });
      setIsSyncing(false);
    }
  });

  // Filtrar eventos passados e ordenar por proximidade
  const now = new Date();
  const futureEvents = events?.filter(event => new Date(event.endDate) > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startDateStr: "",
      startTimeStr: "",
      endDateStr: "",
      endTimeStr: "",
      category: "meeting",
      borderColor: BORDER_COLORS[0].value,
      location: "",
      recurrence: "none",
      reminder: false,
      reminderMinutes: 30,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertEvent) => {
      // Converter as Dates para ISO strings antes de enviar
      const payload = {
        ...data,
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
        endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
      };
      return apiRequest("POST", "/api/events", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento criado com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error("Erro ao criar evento:", error);
      toast({ 
        title: "Erro ao criar evento", 
        description: "Por favor, verifique os campos e tente novamente",
        variant: "destructive" 
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertEvent }) => {
      // Converter as Dates para ISO strings antes de enviar
      const payload = {
        ...data,
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
        endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
      };
      return apiRequest("PATCH", `/api/events/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento atualizado!" });
      setIsDialogOpen(false);
      setEditingEvent(null);
      form.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento excluído!" });
    },
  });

  const handleSubmit = async (data: EventFormData) => {
    try {
      console.log("Dados do formulário:", data);
      
      // Combinar data e hora para criar objetos Date
      const [startDay, startMonth, startYear] = data.startDateStr.split('/');
      const [startHour, startMin] = data.startTimeStr.split(':');
      const startDate = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay), Number(startHour), Number(startMin));

      const [endDay, endMonth, endYear] = data.endDateStr.split('/');
      const [endHour, endMin] = data.endTimeStr.split(':');
      const endDate = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay), Number(endHour), Number(endMin));

      console.log("Datas criadas:", { startDate, endDate });

      // Verificar se as datas são válidas
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        toast({ 
          title: "Datas inválidas", 
          description: "Por favor, verifique as datas e horas informadas",
          variant: "destructive" 
        });
        return;
      }

      const eventData: InsertEvent = {
        title: data.title,
        description: data.description || null,
        startDate: startDate,  // Enviar como objeto Date
        endDate: endDate,      // Enviar como objeto Date
        category: data.category || null,
        borderColor: data.borderColor || null,
        location: data.location || null,
        recurrence: data.recurrence || null,
        reminder: data.reminder || null,
        reminderMinutes: data.reminderMinutes || null,
      };

      console.log("Dados a enviar:", eventData);

      if (editingEvent) {
        updateMutation.mutate({ id: editingEvent.id, data: eventData });
      } else {
        createMutation.mutate(eventData);
      }
    } catch (error) {
      console.error("Erro ao processar formulário:", error);
      toast({ 
        title: "Erro ao processar dados", 
        description: "Por favor, verifique os campos e tente novamente",
        variant: "destructive" 
      });
    }
  };

  const handleEdit = (event: Event) => {
    // Se é uma ocorrência de evento recorrente, extrair o ID original
    const originalId = event.id.includes('_recurrence_') 
      ? event.id.split('_recurrence_')[0]
      : event.id;
      
    // Buscar o evento original para edição
    const originalEvent = event.id.includes('_recurrence_') 
      ? events?.find(e => e.id === originalId) || event
      : event;
      
    setEditingEvent({...originalEvent, id: originalId});
    form.reset({
      title: originalEvent.title,
      description: originalEvent.description,
      startDateStr: format(new Date(originalEvent.startDate), "dd/MM/yyyy"),
      startTimeStr: format(new Date(originalEvent.startDate), "HH:mm"),
      endDateStr: format(new Date(originalEvent.endDate), "dd/MM/yyyy"),
      endTimeStr: format(new Date(originalEvent.endDate), "HH:mm"),
      category: originalEvent.category,
      borderColor: originalEvent.borderColor || BORDER_COLORS[0].value,
      location: originalEvent.location,
      recurrence: originalEvent.recurrence || "none",
      reminder: originalEvent.reminder,
      reminderMinutes: originalEvent.reminderMinutes,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este evento? Se for um evento recorrente, todas as repetições serão excluídas.")) {
      // Se é uma ocorrência de evento recorrente, usar o ID original
      const originalId = id.includes('_recurrence_') 
        ? id.split('_recurrence_')[0]
        : id;
      deleteMutation.mutate(originalId);
    }
  };

  const formatDateInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  };

  const formatTimeInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    return `${numbers.slice(0, 2)}:${numbers.slice(2, 4)}`;
  };

  const groupedEvents = futureEvents?.reduce((acc, event) => {
    const date = format(new Date(event.startDate), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  return (
    <div className="container mx-auto p-6">
      {/* Google Calendar Integration Status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <SiGooglecalendar className="h-6 w-6 text-primary" />
          {!googleCalendarStatus?.configured ? (
            <span className="text-sm text-muted-foreground">
              Google Calendar não configurado
            </span>
          ) : googleCalendarStatus?.authorized ? (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Conectado ao Google Calendar
              </Badge>
              {googleCalendarStatus?.email && (
                <span className="text-xs text-muted-foreground">
                  {googleCalendarStatus.email}
                </span>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600">
              <AlertCircle className="h-3 w-3" />
              Google Calendar não autorizado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!googleCalendarStatus?.configured ? (
            <Link href="/settings?tab=google-calendar">
              <Button variant="outline" size="sm" className="rounded-full" data-testid="button-connect-google-calendar">
                <Link2 className="h-4 w-4 mr-2" />
                Conectar Google Calendar
              </Button>
            </Link>
          ) : !googleCalendarStatus?.authorized ? (
            <Link href="/settings?tab=google-calendar">
              <Button variant="outline" size="sm" className="rounded-full" data-testid="button-authorize-google-calendar">
                Autorizar
              </Button>
            </Link>
          ) : (
            <>
              {googleCalendarStatus?.lastSyncAt && (
                <span className="text-xs text-muted-foreground">
                  Última sincronização: {format(new Date(googleCalendarStatus.lastSyncAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => syncGoogleCalendarMutation.mutate()}
                disabled={isSyncing || syncGoogleCalendarMutation.isPending}
                data-testid="button-sync-google-calendar"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <div className="flex gap-4">
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList className="rounded-full bg-muted/30">
              <TabsTrigger value="list" className="rounded-full"><List className="h-4 w-4 mr-2" />Lista</TabsTrigger>
              <TabsTrigger value="calendar" className="rounded-full"><CalendarIcon className="h-4 w-4 mr-2" />Calendário</TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-full"><Clock className="h-4 w-4 mr-2" />Timeline</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingEvent(null);
              form.reset();
            }
          }}>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-event">
              <Plus className="h-4 w-4 mr-2" />
              Novo Evento
            </Button>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4 border-b">
                <DialogTitle>{editingEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
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
                          <Input placeholder="Título do evento" data-testid="input-event-title" {...field} />
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
                          <Textarea placeholder="Detalhes do evento" data-testid="input-event-description" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Data Início e Fim */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDateStr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data Início *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="DD/MM/AAAA"
                              data-testid="input-start-date"
                              {...field}
                              onChange={(e) => {
                                const formatted = formatDateInput(e.target.value);
                                field.onChange(formatted);
                              }}
                              maxLength={10}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDateStr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data Fim *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="DD/MM/AAAA"
                              data-testid="input-end-date"
                              {...field}
                              onChange={(e) => {
                                const formatted = formatDateInput(e.target.value);
                                field.onChange(formatted);
                              }}
                              maxLength={10}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Horário Início e Fim */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startTimeStr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário Início *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="HH:MM"
                              data-testid="input-start-time"
                              {...field}
                              onChange={(e) => {
                                const formatted = formatTimeInput(e.target.value);
                                field.onChange(formatted);
                              }}
                              maxLength={5}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endTimeStr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário Fim *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="HH:MM"
                              data-testid="input-end-time"
                              {...field}
                              onChange={(e) => {
                                const formatted = formatTimeInput(e.target.value);
                                field.onChange(formatted);
                              }}
                              maxLength={5}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "meeting"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
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
                    name="borderColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor da Borda</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || BORDER_COLORS[0].value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-border-color">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BORDER_COLORS.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div className="w-4 h-4 rounded border" style={{ backgroundColor: color.value }} />
                                  {color.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Local</FormLabel>
                        <FormControl>
                          <Input placeholder="Local do evento" data-testid="input-location" {...field} value={field.value || ""} />
                        </FormControl>
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

                  {/* Google Meet Link - show only when editing an event that has a Meet link */}
                  {editingEvent && (editingEvent as any).googleMeetLink && (
                    <div className="flex items-center justify-between rounded-lg border p-4 bg-blue-50 dark:bg-blue-950">
                      <div className="space-y-0.5">
                        <div className="font-medium text-sm flex items-center gap-2">
                          <Video className="h-4 w-4 text-blue-600" />
                          Google Meet
                        </div>
                        <div className="text-sm text-muted-foreground">Videoconferência disponível</div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open((editingEvent as any).googleMeetLink, '_blank')}
                        data-testid="button-open-meet"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Abrir
                      </Button>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="reminder"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Lembrete</FormLabel>
                          <div className="text-sm text-muted-foreground">Receber notificação antes do evento</div>
                        </div>
                        <FormControl>
                          <Switch checked={field.value || false} onCheckedChange={field.onChange} data-testid="switch-reminder" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("reminder") && (
                    <FormField
                      control={form.control}
                      name="reminderMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minutos antes</FormLabel>
                          <FormControl>
                            <Input type="number" min="5" data-testid="input-reminder-minutes" {...field} value={field.value || ""} onChange={(e) => field.onChange(parseInt(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  </div>
                  <DialogFooter className="px-6 py-4 border-t grid grid-cols-1 gap-2">
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-event" className="rounded-full w-full">
                      {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "list" && (
        <div className="space-y-6">
          {isLoading ? (
            [...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : groupedEvents && Object.keys(groupedEvents).length > 0 ? (
            Object.entries(groupedEvents).sort().map(([date, dayEvents]) => (
              <div key={date}>
                <h3 className="text-lg font-semibold mb-3">{format(new Date(date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</h3>
                <div className="space-y-3">
                  {dayEvents.map((event) => (
                    <Card key={event.id} className="border-l-4" style={{ borderLeftColor: event.borderColor || CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6" }} data-testid={`event-${event.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h4 className="font-semibold">{event.title}</h4>
                              {(event as any).googleEventId && (
                                <SiGooglecalendar className="h-4 w-4 text-blue-500" title="Sincronizado com Google Calendar" />
                              )}
                              {event.category && (
                                <Badge 
                                  variant="secondary"
                                  style={{ 
                                    color: event.borderColor || CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6"
                                  }}
                                >
                                  {CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.label}
                                </Badge>
                              )}
                            </div>
                            {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(new Date(event.startDate), "dd/MM/yyyy")}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(event.startDate), "HH:mm")}hrs - {format(new Date(event.endDate), "HH:mm")}hrs
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              )}
                              {(event as any).googleMeetLink && (
                                <a 
                                  href={(event as any).googleMeetLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                  data-testid={`link-meet-${event.id}`}
                                >
                                  <Video className="h-3 w-3" />
                                  Google Meet
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {(event as any).googleMeetLink && (
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => window.open((event as any).googleMeetLink, '_blank')}
                                title="Abrir Google Meet"
                                data-testid={`button-meet-${event.id}`}
                              >
                                <Video className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(event)} data-testid={`button-edit-${event.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)} data-testid={`button-delete-${event.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Nenhum evento futuro encontrado. Eventos passados são ocultados automaticamente.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {view === "calendar" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="button-prev-month">
                ←
              </Button>
              <div className="flex items-center gap-2">
                <CardTitle>{format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentMonth(new Date())} 
                  data-testid="button-today"
                >
                  Hoje
                </Button>
              </div>
              <Button variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="button-next-month">
                →
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <div key={day} className="text-center text-sm font-semibold p-2">{day}</div>
              ))}
              {calendarDays.map((day, i) => {
                const dayEvents = futureEvents?.filter((event) => isSameDay(new Date(event.startDate), day)) || [];
                return (
                  <div key={i} className="min-h-24 p-2 border rounded-lg">
                    <div className="text-sm font-medium mb-1">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="text-xs p-1 rounded truncate cursor-pointer hover-elevate border-l-4 flex items-center gap-1"
                          style={{ 
                            backgroundColor: (event.borderColor || CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6") + "20",
                            borderLeftColor: event.borderColor || CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6"
                          }}
                          onClick={() => handleEdit(event)}
                        >
                          {(event as any).googleEventId && (
                            <SiGooglecalendar className="h-3 w-3 text-blue-500 flex-shrink-0" />
                          )}
                          <span className="truncate">{event.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground">+{dayEvents.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "timeline" && (
        <div className="space-y-4">
          {isLoading ? (
            [...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : futureEvents && futureEvents.length > 0 ? (
            <div className="relative border-l-2 border-primary ml-6 space-y-8">
              {futureEvents.map((event, index) => (
                <div key={event.id} className="relative pl-8">
                  <div className="absolute -left-3 w-6 h-6 rounded-full bg-primary border-4 border-background" />
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h4 className="font-semibold">{event.title}</h4>
                            {(event as any).googleEventId && (
                              <SiGooglecalendar className="h-4 w-4 text-blue-500" title="Sincronizado com Google Calendar" />
                            )}
                            {event.category && (
                              <Badge 
                                variant="secondary"
                                style={{ 
                                  color: event.borderColor || CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6"
                                }}
                              >
                                {CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.label}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(event.startDate), "dd/MM/yyyy HH:mm")}hrs - {format(new Date(event.endDate), "HH:mm")}hrs
                          </p>
                          {event.description && <p className="text-sm">{event.description}</p>}
                          {event.location && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(event)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                Nenhum evento futuro encontrado. Eventos passados são ocultados automaticamente.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}