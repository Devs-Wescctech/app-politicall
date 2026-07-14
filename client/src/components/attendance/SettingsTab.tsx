import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Plug, CheckCircle2, XCircle, Loader2, Zap, Users, Tags
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChannelConnection, AttSector, AttQueue, AttQueueMember, QuickReply } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isOfficialAttendanceChannel } from "@shared/attendance-meta-window";

type AttendanceLabel = { id: string; name: string; color: string };
type ConnectionForm = {
  name: string;
  channel: string;
  provider: "wescctech" | "wescctech_cloud" | "meta_cloud";
  token: string;
  baseUrl: string;
  businessAccountId: string;
  phoneNumberId: string;
};

const EMPTY_CONNECTION: ConnectionForm = {
  name: "",
  channel: "whatsapp",
  provider: "wescctech",
  token: "",
  baseUrl: "https://api.wescctech.com.br",
  businessAccountId: "",
  phoneNumberId: "",
};

// ─── Connection Status Badge ────────────────────────────────────────────────

function ConnStatus({ status }: { status: string }) {
  const map: Record<string, { icon: JSX.Element; label: string; cls: string }> = {
    connected: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Conectado", cls: "text-green-600 dark:text-green-400" },
    error: { icon: <XCircle className="w-3.5 h-3.5" />, label: "Erro", cls: "text-red-500" },
    pending: { icon: <Loader2 className="w-3.5 h-3.5" />, label: "Pendente", cls: "text-yellow-500" },
    configured: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Configurado", cls: "text-blue-500" },
    disabled: { icon: <XCircle className="w-3.5 h-3.5" />, label: "Desativado", cls: "text-muted-foreground" },
  };
  const v = map[status] ?? map.pending;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  );
}

// ─── Connections ─────────────────────────────────────────────────────────────

function ConnectionsSection() {
  const [open, setOpen] = useState(false);
  const [editConn, setEditConn] = useState<ChannelConnection | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectionForm>(EMPTY_CONNECTION);
  const { toast } = useToast();

  const { data: connections = [], isLoading } = useQuery<ChannelConnection[]>({
    queryKey: ["/api/attendance/connections"],
  });
  const attendanceConnections = connections.filter(c => c.channel !== "sms");

  const openNew = () => {
    setForm(EMPTY_CONNECTION);
    setEditConn(null);
    setOpen(true);
  };

  const openEdit = (c: ChannelConnection) => {
    const metadata = (c.metadata as any) ?? {};
    const official = isOfficialAttendanceChannel({ connection: c });
    setForm({
      name: c.name,
      channel: c.channel,
      provider: c.provider === "wescctech_cloud" ? "wescctech_cloud" : official ? "meta_cloud" : "wescctech",
      token: "",
      baseUrl: c.baseUrl ?? (official ? "https://graph.facebook.com" : "https://api.wescctech.com.br"),
      businessAccountId: metadata.businessAccountId ?? metadata.whatsappBusinessAccountId ?? metadata.wabaId ?? "",
      phoneNumberId: metadata.phoneNumberId ?? metadata.whatsappPhoneNumberId ?? "",
    });
    setEditConn(c);
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const official = form.provider !== "wescctech";
      const directMeta = form.provider === "meta_cloud";
      const payload = {
        name: form.name,
        channel: "whatsapp",
        provider: form.provider,
        token: form.token,
        baseUrl: directMeta ? "https://graph.facebook.com" : "https://api.wescctech.com.br",
        metadata: {
          apiType: official ? "official" : "whu",
          official,
          whatsappOfficial: official,
          directMeta,
          businessAccountId: directMeta ? form.businessAccountId : null,
          phoneNumberId: directMeta ? form.phoneNumberId : null,
        },
      };
      return editConn
        ? apiRequest("PATCH", `/api/attendance/connections/${editConn.id}`, payload)
        : apiRequest("POST", "/api/attendance/connections", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/connections"] });
      setOpen(false);
      toast({ title: editConn ? "Conexão atualizada" : "Conexão criada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/attendance/connections/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/connections"] });
      toast({ title: "Conexão removida" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/attendance/connections/${id}/test`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/connections"] });
      toast({ title: data.status === "connected" ? "Conexão OK" : "Falha na conexão", description: data.lastError ?? undefined });
    },
    onError: (e: any) => toast({ title: "Erro no teste", description: e.message, variant: "destructive" }),
  });

  return (
    <div data-testid="section-connections">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Conexões de canal</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure os canais de atendimento conversacional. SMS fica apenas em Disparos.</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-new-connection">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nova conexão
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />)}</div>
      ) : attendanceConnections.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-md" data-testid="empty-connections">
          <Plug className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma conexão configurada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attendanceConnections.map(c => (
            <div key={c.id} data-testid={`item-connection-${c.id}`} className="flex items-center gap-3 p-3 rounded-md border border-border bg-background">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${isOfficialAttendanceChannel({ connection: c }) ? "bg-sky-600/10" : "bg-green-600/10"}`}>
                <SiWhatsapp className={`w-4 h-4 ${isOfficialAttendanceChannel({ connection: c }) ? "text-sky-600" : "text-green-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.channel} · {c.provider}</p>
              </div>
              <ConnStatus status={c.status} />
              <div className="flex items-center gap-1">                <Button size="sm" variant="outline" onClick={() => testMutation.mutate(c.id)} disabled={testMutation.isPending} data-testid={`button-test-connection-${c.id}`}>
                  Testar
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(c)} data-testid={`button-edit-connection-${c.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(c.id)} data-testid={`button-delete-connection-${c.id}`}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent data-testid="dialog-connection">
          <DialogHeader>
            <DialogTitle>{editConn ? "Editar conexão" : "Nova conexão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { key: "name", label: "Nome da conexão", placeholder: "Ex: WhatsApp Gabinete" },
              { key: "token", label: editConn ? "Novo token (deixe vazio para manter)" : "Token de acesso", placeholder: "access-token do provedor" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-sm font-medium mb-1.5 block">{label}</label>
                <Input
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  type={key === "token" ? "password" : "text"}
                  data-testid={`input-connection-${key}`}
                />
              </div>
            ))}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tipo de conexão</label>
              <Select value={form.provider} onValueChange={(provider: "wescctech" | "wescctech_cloud" | "meta_cloud") => setForm(f => ({
                ...f,
                provider,
                baseUrl: provider === "meta_cloud" ? "https://graph.facebook.com" : "https://api.wescctech.com.br",
              }))}>
                <SelectTrigger data-testid="select-connection-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wescctech">WhatsApp / WHU</SelectItem>
                  <SelectItem value="wescctech_cloud">WhatsApp Cloud via WHU</SelectItem>
                  <SelectItem value="meta_cloud">WhatsApp Cloud direto / Meta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.provider === "meta_cloud" ? (
              <div className="grid gap-4 sm:grid-cols-2" data-testid="fields-meta-cloud">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Business Account ID (WABA)</label>
                  <Input value={form.businessAccountId} onChange={e => setForm(f => ({ ...f, businessAccountId: e.target.value }))} data-testid="input-connection-business-account-id" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Phone Number ID</label>
                  <Input value={form.phoneNumberId} onChange={e => setForm(f => ({ ...f, phoneNumberId: e.target.value }))} data-testid="input-connection-phone-number-id" />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || (form.provider === "meta_cloud" && (!form.businessAccountId || !form.phoneNumberId))} data-testid="button-save-connection">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação é irreversível. Conversas vinculadas permanecerão mas ficarão sem canal.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sectors ─────────────────────────────────────────────────────────────────

function SectorsSection() {
  const [open, setOpen] = useState(false);
  const [editSector, setEditSector] = useState<AttSector | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", channel: "all" });
  const { toast } = useToast();

  const { data: sectors = [], isLoading } = useQuery<AttSector[]>({
    queryKey: ["/api/attendance/sectors"],
  });

  const openNew = () => { setForm({ name: "", description: "", channel: "all" }); setEditSector(null); setOpen(true); };
  const openEdit = (s: AttSector) => { setForm({ name: s.name, description: s.description ?? "", channel: s.channel ?? "all" }); setEditSector(s); setOpen(true); };

  const saveMutation = useMutation({
    mutationFn: () => editSector
      ? apiRequest("PATCH", `/api/attendance/sectors/${editSector.id}`, form)
      : apiRequest("POST", "/api/attendance/sectors", form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/sectors"] }); setOpen(false); toast({ title: "Setor salvo" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/attendance/sectors/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/sectors"] }); toast({ title: "Setor removido" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div data-testid="section-sectors">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Setores / Filas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Organize atendentes por área ou especialidade</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-new-sector">
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo setor
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}</div>
      ) : sectors.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-md" data-testid="empty-sectors">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum setor criado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sectors.map(s => (
            <div key={s.id} data-testid={`item-sector-${s.id}`} className="flex items-center gap-3 p-3 rounded-md border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              </div>
              {s.isDefault && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)} data-testid={`button-edit-sector-${s.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)} data-testid={`button-delete-sector-${s.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent data-testid="dialog-sector">
          <DialogHeader><DialogTitle>{editSector ? "Editar setor" : "Novo setor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nome</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do setor" data-testid="input-sector-name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descrição</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" data-testid="input-sector-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name} data-testid="button-save-sector">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover setor?</AlertDialogTitle>
            <AlertDialogDescription>As conversas nesse setor não serão removidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Queues ───────────────────────────────────────────────────────────────────

function QueuesSection() {
  const [open, setOpen] = useState(false);
  const [editQueue, setEditQueue] = useState<AttQueue | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [membersQueue, setMembersQueue] = useState<AttQueue | null>(null);
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    channel: "whatsapp",
    strategy: "manual",
    maxWaitMinutes: 30,
    priority: 0,
    capacity: 3,
  });
  const { toast } = useToast();

  const { data: queues = [], isLoading } = useQuery<AttQueue[]>({
    queryKey: ["/api/attendance/queues"],
  });
  const { data: operators = [] } = useQuery<Array<{ id: string; name: string; email: string; role: string }>>({
    queryKey: ["/api/attendance/operators"],
  });
  const { data: queueMembers = [] } = useQuery<AttQueueMember[]>({
    queryKey: ["/api/attendance/queues", membersQueue?.id, "members"],
    enabled: Boolean(membersQueue),
  });

  const openNew = () => {
    setForm({ name: "", description: "", channel: "whatsapp", strategy: "manual", maxWaitMinutes: 30, priority: 0, capacity: 3 });
    setEditQueue(null);
    setOpen(true);
  };

  const openEdit = (queue: AttQueue) => {
    setForm({
      name: queue.name,
      description: queue.description ?? "",
      channel: queue.channel ?? "whatsapp",
      strategy: queue.strategy ?? "manual",
      maxWaitMinutes: queue.maxWaitMinutes ?? 30,
      priority: queue.priority ?? 0,
      capacity: Number((queue.metadata as any)?.maxConcurrentPerAgent) || 3,
    });
    setEditQueue(queue);
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const { capacity, ...base } = form;
      const payload = { ...base, metadata: { ...((editQueue?.metadata as any) ?? {}), maxConcurrentPerAgent: capacity } };
      return editQueue ? apiRequest("PATCH", "/api/attendance/queues/" + editQueue.id, payload) : apiRequest("POST", "/api/attendance/queues", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/queues"] });
      setOpen(false);
      toast({ title: "Fila salva" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/attendance/queues/" + membersQueue!.id + "/members", { userId: selectedOperatorId, active: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/queues", membersQueue?.id, "members"] }); setSelectedOperatorId(""); toast({ title: "Atendente adicionado à fila" }); },
    onError: (error: any) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => apiRequest("DELETE", "/api/attendance/queues/" + membersQueue!.id + "/members/" + memberId, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/queues", membersQueue?.id, "members"] }); toast({ title: "Atendente removido da fila" }); },
    onError: (error: any) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/attendance/queues/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/queues"] });
      toast({ title: "Fila removida" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div data-testid="section-queues">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Filas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Defina filas operacionais e prioridades de distribuição</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-new-queue">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nova fila
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}</div>
      ) : queues.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-md" data-testid="empty-queues">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma fila criada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queues.map(queue => (
            <div key={queue.id} data-testid={`item-queue-${queue.id}`} className="flex items-center gap-3 p-3 rounded-md border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{queue.name}</p>
                <p className="text-xs text-muted-foreground">
                  {queue.description || "Sem descrição"} · SLA {queue.maxWaitMinutes ?? 30}min · prioridade {queue.priority ?? 0}
                </p>
              </div>
              {queue.isDefault && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMembersQueue(queue)} data-testid={"button-members-queue-" + queue.id}><Users className="h-3.5 w-3.5" /> Membros</Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(queue)} data-testid={`button-edit-queue-${queue.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(queue.id)} data-testid={`button-delete-queue-${queue.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(membersQueue)} onOpenChange={value => { if (!value) { setMembersQueue(null); setSelectedOperatorId(""); } }}>
        <DialogContent data-testid="dialog-queue-members">
          <DialogHeader><DialogTitle>Membros da fila {membersQueue?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedOperatorId || "__none"} onValueChange={value => setSelectedOperatorId(value === "__none" ? "" : value)}>
                <SelectTrigger className="flex-1" data-testid="select-queue-operator"><SelectValue placeholder="Selecionar atendente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Selecionar atendente</SelectItem>
                  {operators.filter(operator => !queueMembers.some(member => member.userId === operator.id)).map(operator => (
                    <SelectItem key={operator.id} value={operator.id}>{operator.name} · {operator.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addMemberMutation.mutate()} disabled={!selectedOperatorId || addMemberMutation.isPending}>Adicionar</Button>
            </div>
            <div className="space-y-2">
              {queueMembers.length ? queueMembers.map(member => {
                const operator = operators.find(item => item.id === member.userId);
                return (
                  <div key={member.id} className="flex items-center justify-between rounded-md border p-3">
                    <div><p className="text-sm font-medium">{operator?.name ?? "Usuário indisponível"}</p><p className="text-xs text-muted-foreground">{operator?.email ?? member.userId}</p></div>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeMemberMutation.mutate(member.id)} disabled={removeMemberMutation.isPending}>Remover</Button>
                  </div>
                );
              }) : <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendente nesta fila.</p>}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMembersQueue(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent data-testid="dialog-queue">
          <DialogHeader><DialogTitle>{editQueue ? "Editar fila" : "Nova fila"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nome</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da fila" data-testid="input-queue-name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descrição</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" data-testid="input-queue-description" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Distribuição</label>
              <Select value={form.strategy} onValueChange={strategy => setForm(current => ({ ...current, strategy }))}>
                <SelectTrigger data-testid="select-queue-strategy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="round_robin">Rodízio (round-robin)</SelectItem>
                  <SelectItem value="least_loaded">Menor carga</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Usa somente membros ativos com permissão de resposta.</p>
            </div>
            {form.strategy !== "manual" ? (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Capacidade por atendente</label>
                <Input type="number" min={1} max={100} value={form.capacity} onChange={event => setForm(current => ({ ...current, capacity: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }))} data-testid="input-queue-capacity" />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Espera máxima</label>
                <Input type="number" value={form.maxWaitMinutes} onChange={e => setForm(f => ({ ...f, maxWaitMinutes: Number(e.target.value) }))} data-testid="input-queue-max-wait" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Prioridade</label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} data-testid="input-queue-priority" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name} data-testid="button-save-queue">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fila?</AlertDialogTitle>
            <AlertDialogDescription>A fila será desativada e deixará de aparecer para novos atendimentos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Quick Replies ────────────────────────────────────────────────────────────

function QuickRepliesSection() {
  const [open, setOpen] = useState(false);
  const [editQR, setEditQR] = useState<QuickReply | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", message: "" });
  const { toast } = useToast();

  const { data: quickReplies = [], isLoading } = useQuery<QuickReply[]>({
    queryKey: ["/api/attendance/quick-replies"],
  });

  const openNew = () => { setForm({ title: "", message: "" }); setEditQR(null); setOpen(true); };
  const openEdit = (qr: QuickReply) => { setForm({ title: qr.title, message: qr.message }); setEditQR(qr); setOpen(true); };

  const saveMutation = useMutation({
    mutationFn: () => editQR
      ? apiRequest("PATCH", `/api/attendance/quick-replies/${editQR.id}`, form)
      : apiRequest("POST", "/api/attendance/quick-replies", form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/quick-replies"] }); setOpen(false); toast({ title: "Resposta rápida salva" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/attendance/quick-replies/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/quick-replies"] }); toast({ title: "Resposta removida" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div data-testid="section-quick-replies">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Respostas rápidas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Mensagens predefinidas acessadas com o botão <Zap className="w-3 h-3 inline" /></p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-new-quick-reply">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nova resposta
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />)}</div>
      ) : quickReplies.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-md" data-testid="empty-quick-replies">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma resposta rápida criada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quickReplies.map(qr => (
            <div key={qr.id} data-testid={`item-quick-reply-${qr.id}`} className="flex items-start gap-3 p-3 rounded-md border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{qr.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{qr.message}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(qr)} data-testid={`button-edit-quick-reply-${qr.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(qr.id)} data-testid={`button-delete-quick-reply-${qr.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent data-testid="dialog-quick-reply">
          <DialogHeader><DialogTitle>{editQR ? "Editar resposta rápida" : "Nova resposta rápida"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Título</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Saudação inicial" data-testid="input-qr-title" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Mensagem</label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Texto da mensagem..."
                data-testid="input-qr-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.message} data-testid="button-save-quick-reply">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover resposta rápida?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function LabelsSection() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#14b8a6");
  const { toast } = useToast();

  const { data: labels = [], isLoading } = useQuery<AttendanceLabel[]>({
    queryKey: ["/api/attendance/labels"],
  });

  const saveLabelsMutation = useMutation({
    mutationFn: (nextLabels: AttendanceLabel[]) => apiRequest("PUT", "/api/attendance/labels", { labels: nextLabels }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/labels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/automation-settings"] });
      toast({ title: "Etiquetas salvas" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const addLabel = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (labels.some(label => label.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Etiqueta ja existe", variant: "destructive" });
      return;
    }
    const id = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    saveLabelsMutation.mutate([...labels, { id, name: trimmed, color }]);
    setName("");
    setColor("#14b8a6");
  };

  const updateLabel = (id: string, patch: Partial<AttendanceLabel>) => {
    saveLabelsMutation.mutate(labels.map(label => label.id === id ? { ...label, ...patch } : label));
  };

  const removeLabel = (id: string) => {
    saveLabelsMutation.mutate(labels.filter(label => label.id !== id));
  };

  return (
    <div data-testid="section-attendance-labels">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Etiquetas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Crie etiquetas com cor para classificar contatos e atendimentos.</p>
        </div>
        <Tags className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_72px_auto]">
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Nome da etiqueta" data-testid="input-label-name" />
        <Input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-10 p-1" data-testid="input-label-color" />
        <Button onClick={addLabel} disabled={!name.trim() || saveLabelsMutation.isPending} data-testid="button-add-label">
          <Plus className="mr-1 h-3.5 w-3.5" /> Criar
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="h-14 animate-pulse rounded-md bg-muted" />
        ) : labels.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nenhuma etiqueta criada
          </div>
        ) : labels.map(label => (
          <div key={label.id} className="flex items-center gap-2 rounded-md border border-border p-2" data-testid={`item-label-${label.id}`}>
            <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: label.color }} />
            <Input
              value={label.name}
              onChange={event => updateLabel(label.id, { name: event.target.value })}
              className="h-8 text-sm"
              data-testid={`input-label-name-${label.id}`}
            />
            <Input
              type="color"
              value={label.color}
              onChange={event => updateLabel(label.id, { color: event.target.value })}
              className="h-8 w-14 p-1"
              data-testid={`input-label-color-${label.id}`}
            />
            <Button size="icon" variant="ghost" onClick={() => removeLabel(label.id)} data-testid={`button-remove-label-${label.id}`}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsTab() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8" data-testid="tab-settings">
      <SectorsSection />
      <Separator />
      <QueuesSection />
      <Separator />
      <LabelsSection />
      <Separator />
      <QuickRepliesSection />
    </div>
  );
}
