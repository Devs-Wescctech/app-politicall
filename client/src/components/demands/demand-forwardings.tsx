import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, Clock, Plus, Send, MessageSquareText, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Destination = { id: string; name: string; kind: string; responseDeadlineHours: number; active: boolean };
type Assignee = { id: string; name: string };
type Forwarding = { id: string; status: string; priority: string; externalProtocol?: string | null; dueAt?: string | null; response?: string | null; deadlineState?: string | null; destination: Destination; assigneeUser?: Assignee | null };
const labels: Record<string, string> = { draft: "Rascunho", forwarded: "Encaminhado", waiting: "Aguardando", answered: "Respondido", completed: "Concluido", cancelled: "Cancelado" };

export function DemandForwardings({ demandId }: { demandId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [destinationId, setDestinationId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [status, setStatus] = useState("forwarded");
  const [notes, setNotes] = useState("");
  const [externalProtocol, setExternalProtocol] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [followUp, setFollowUp] = useState<Forwarding | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const { data: items = [], isLoading } = useQuery<Forwarding[]>({ queryKey: ["/api/demands", demandId, "forwardings"] });
  const { data: destinations = [] } = useQuery<Destination[]>({ queryKey: ["/api/demand-destinations?active=true"] });
  const { data: assignees = [] } = useQuery<Assignee[]>({ queryKey: ["/api/demand-assignees"] });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["/api/demands", demandId, "forwardings"] }); queryClient.invalidateQueries({ queryKey: ["/api/demands", demandId, "history"] }); };
  const create = useMutation({ mutationFn: () => apiRequest("POST", `/api/demands/${demandId}/forwardings`, { destinationId, assigneeUserId: assigneeUserId || null, status, priority, externalProtocol: externalProtocol || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null, notes: notes || null }), onSuccess: () => { refresh(); setOpen(false); setDestinationId(""); setAssigneeUserId(""); setExternalProtocol(""); setDueAt(""); setNotes(""); toast({ title: "Encaminhamento registrado" }); }, onError: (e: Error) => toast({ title: "Nao foi possivel encaminhar", description: e.message, variant: "destructive" }) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiRequest("PATCH", `/api/demands/${demandId}/forwardings/${id}`, body), onSuccess: refresh, onError: (error: Error) => toast({ title: "Nao foi possivel atualizar", description: error.message, variant: "destructive" }) });
  const draft = useMutation({ mutationFn: async (id: string) => (await apiRequest("POST", `/api/demands/${demandId}/forwardings/${id}/message-draft`)).json(), onSuccess: async (data) => { await navigator.clipboard.writeText(data.text); toast({ title: "Atualizacao copiada", description: "Revise o texto antes de enviar ao eleitor." }); } });
  const schedule = useMutation({
    mutationFn: () => {
      if (!followUp || !followUpDate) throw new Error("Informe a data do retorno");
      const startDate = new Date(followUpDate);
      const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
      return apiRequest("POST", `/api/demands/${demandId}/follow-up`, {
        forwardingId: followUp.id,
        title: `Cobrar retorno de ${followUp.destination.name}`,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        reminderMinutes: 60,
      });
    },
    onSuccess: () => { setFollowUp(null); setFollowUpDate(""); refresh(); toast({ title: "Retorno agendado" }); },
    onError: (error: Error) => toast({ title: "Nao foi possivel agendar", description: error.message, variant: "destructive" }),
  });
  const active = items.filter(i => ["forwarded", "waiting"].includes(i.status)).length;
  const overdue = items.filter(i => i.deadlineState === "overdue").length;
  const completed = items.filter(i => i.status === "completed").length;
  return <section className="space-y-4" aria-label="Encaminhamentos da demanda">
    <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-md border p-2"><b>{active}</b><p className="text-xs text-muted-foreground">Ativos</p></div><div className="rounded-md border p-2"><b className="text-destructive">{overdue}</b><p className="text-xs text-muted-foreground">Vencidos</p></div><div className="rounded-md border p-2"><b>{completed}</b><p className="text-xs text-muted-foreground">Concluidos</p></div></div>
    <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4" />Novo encaminhamento</Button>
    {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando encaminhamentos...</p> : items.length === 0 ? <div className="py-8 text-center"><Building2 className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Nenhum encaminhamento</p></div> : <ul className="divide-y rounded-md border">{items.map(item => {
      const terminal = ["completed", "cancelled"].includes(item.status);
      return <li key={item.id} className="space-y-2 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{item.destination.name}</p><p className="text-xs text-muted-foreground">{item.assigneeUser?.name || "Sem responsavel"}{item.externalProtocol ? ` · ${item.externalProtocol}` : ""}</p></div><Badge variant={item.deadlineState === "overdue" ? "destructive" : "secondary"}>{labels[item.status]}</Badge></div>{item.dueAt && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" />Prazo {new Date(item.dueAt).toLocaleString("pt-BR")}</p>}{item.response && <p className="rounded-md bg-muted p-2 text-sm">{item.response}</p>}<div className="flex flex-wrap gap-2">{item.status === "draft" && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, body: { status: "forwarded" } })}><Send className="mr-2 size-4" />Encaminhar</Button>}{["forwarded", "answered"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, body: { status: "waiting" } })}>Aguardando</Button>}{["forwarded", "waiting"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => { const response = window.prompt("Resposta recebida"); if (response) update.mutate({ id: item.id, body: { status: "answered", response } }); }}>Registrar resposta</Button>}{["forwarded", "waiting", "answered"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, body: { status: "completed" } })}>Concluir</Button>}{!terminal && <Button size="sm" variant="outline" onClick={() => setFollowUp(item)}><CalendarClock className="mr-2 size-4" />Agendar retorno</Button>}{!terminal && <Button size="icon" variant="ghost" aria-label={`Cancelar encaminhamento para ${item.destination.name}`} onClick={() => update.mutate({ id: item.id, body: { status: "cancelled" } })}><XCircle className="size-4" /></Button>}<Button size="icon" variant="ghost" aria-label={`Preparar atualizacao sobre ${item.destination.name}`} onClick={() => draft.mutate(item.id)}><MessageSquareText className="size-4" /></Button></div></li>;
    })}</ul>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Novo encaminhamento</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Orgao ou setor</Label><Select value={destinationId} onValueChange={setDestinationId}><SelectTrigger aria-label="Orgao ou setor"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{destinations.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Responsavel interno</Label><Select value={assigneeUserId} onValueChange={setAssigneeUserId}><SelectTrigger aria-label="Responsavel interno"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{assignees.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Situacao inicial</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Situacao inicial"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Salvar rascunho</SelectItem><SelectItem value="forwarded">Marcar como encaminhado</SelectItem></SelectContent></Select></div><div><Label>Prioridade</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger aria-label="Prioridade do encaminhamento"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Media</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></div><div><Label htmlFor="forwarding-due-at">Prazo especifico</Label><Input id="forwarding-due-at" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="forwarding-external-protocol">Protocolo externo</Label><Input id="forwarding-external-protocol" value={externalProtocol} onChange={(event) => setExternalProtocol(event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="forwarding-notes">Observacoes</Label><Textarea id="forwarding-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!destinationId || create.isPending} onClick={() => create.mutate()}><Send className="mr-2 size-4" />Registrar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(followUp)} onOpenChange={(next) => { if (!next) { setFollowUp(null); setFollowUpDate(""); } }}><DialogContent><DialogHeader><DialogTitle>Agendar retorno</DialogTitle></DialogHeader><div className="space-y-2"><p className="text-sm text-muted-foreground">{followUp?.destination.name}</p><Label htmlFor="forwarding-follow-up-date">Data e hora</Label><Input id="forwarding-follow-up-date" type="datetime-local" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setFollowUp(null)}>Cancelar</Button><Button disabled={!followUpDate || schedule.isPending} onClick={() => schedule.mutate()}><CalendarClock className="mr-2 size-4" />Agendar</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
