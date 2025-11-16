import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Event, type InsertEvent, insertEventSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Calendar as CalendarIcon, List, Clock, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CATEGORY_CONFIG = {
  meeting: { label: "Reunião", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", borderColor: "#3b82f6" },
  event: { label: "Evento", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", borderColor: "#9333ea" },
  deadline: { label: "Prazo", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", borderColor: "#ef4444" },
  personal: { label: "Pessoal", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", borderColor: "#22c55e" },
};

export default function Agenda() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"list" | "calendar" | "timeline">("list");
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const form = useForm<InsertEvent>({
    resolver: zodResolver(insertEventSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      category: "meeting",
      location: "",
      reminder: false,
      reminderMinutes: 30,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertEvent) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento criado com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InsertEvent }) =>
      apiRequest("PATCH", `/api/events/${id}`, data),
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

  const handleSubmit = (data: InsertEvent) => {
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    form.reset({
      title: event.title,
      description: event.description || "",
      startDate: event.startDate,
      endDate: event.endDate,
      category: event.category || "meeting",
      location: event.location || "",
      reminder: event.reminder || false,
      reminderMinutes: event.reminderMinutes || 30,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este evento?")) {
      deleteMutation.mutate(id);
    }
  };

  const groupedEvents = events?.reduce((acc, event) => {
    const dateKey = format(new Date(event.startDate), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { locale: ptBR }),
    end: endOfWeek(endOfMonth(currentMonth), { locale: ptBR }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Agenda</h1>
          <p className="text-muted-foreground mt-2">Gerencie seus eventos e compromissos</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="list" data-testid="tab-list">
                <List className="h-4 w-4 mr-2" />
                Lista
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Calendário
              </TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-timeline">
                <Clock className="h-4 w-4 mr-2" />
                Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingEvent(null);
              form.reset();
            }
          }}>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-event">
              <Plus className="w-4 h-4 mr-2" />
              Novo Evento
            </Button>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                          <Textarea placeholder="Detalhes do evento" data-testid="input-event-description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data/Hora Início *</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" data-testid="input-start-date" {...field} value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""} onChange={(e) => field.onChange(new Date(e.target.value).toISOString())} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data/Hora Fim *</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" data-testid="input-end-date" {...field} value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""} onChange={(e) => field.onChange(new Date(e.target.value).toISOString())} />
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
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Local</FormLabel>
                        <FormControl>
                          <Input placeholder="Local do evento" data-testid="input-location" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-reminder" />
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
                            <Input type="number" min="5" data-testid="input-reminder-minutes" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-event">
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
                    <Card key={event.id} className="border-l-4" style={{ borderLeftColor: CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor || "#3b82f6" }} data-testid={`event-${event.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h4 className="font-semibold">{event.title}</h4>
                              {event.category && (
                                <Badge className={CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.color}>
                                  {CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.label}
                                </Badge>
                              )}
                            </div>
                            {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              <span>🕐 {format(new Date(event.startDate), "HH:mm")} - {format(new Date(event.endDate), "HH:mm")}</span>
                              {event.location && <span>📍 {event.location}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
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
                Nenhum evento cadastrado. Clique em "Novo Evento" para começar.
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
              <CardTitle>{format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}</CardTitle>
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
                const dayEvents = events?.filter((event) => isSameDay(new Date(event.startDate), day)) || [];
                return (
                  <div key={i} className="min-h-24 p-2 border rounded-lg">
                    <div className="text-sm font-medium mb-1">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="text-xs p-1 rounded truncate cursor-pointer hover-elevate"
                          style={{ backgroundColor: CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.borderColor + "20" }}
                          onClick={() => handleEdit(event)}
                        >
                          {event.title}
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
          ) : events && events.length > 0 ? (
            <div className="relative border-l-2 border-primary ml-6 space-y-8">
              {events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).map((event, index) => (
                <div key={event.id} className="relative pl-8">
                  <div className="absolute -left-3 w-6 h-6 rounded-full bg-primary border-4 border-background" />
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h4 className="font-semibold">{event.title}</h4>
                            {event.category && (
                              <Badge className={CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.color}>
                                {CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]?.label}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(event.startDate), "dd/MM/yyyy HH:mm")} - {format(new Date(event.endDate), "HH:mm")}
                          </p>
                          {event.description && <p className="text-sm">{event.description}</p>}
                          {event.location && <p className="text-sm text-muted-foreground">📍 {event.location}</p>}
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
                Nenhum evento cadastrado.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
