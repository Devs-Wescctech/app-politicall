import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Archive,
  BarChart2,
  Bot,
  Download,
  FileClock,
  Pencil,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings,
  StickyNote,
  Tags,
  Trash2,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiWhatsapp } from "react-icons/si";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { AttConversation, AttConversationEvent, AttMessage, AttNote, AttSector, AttTransfer, ChannelConnection, Contact } from "@shared/schema";
import ConversationList from "@/components/attendance/ConversationList";
import ChatPanel from "@/components/attendance/ChatPanel";
import ContactPanel from "@/components/attendance/ContactPanel";
import SettingsTab from "@/components/attendance/SettingsTab";
import AutomationTab from "@/components/attendance/AutomationTab";
import ReportsTab from "@/components/attendance/ReportsTab";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useAttendanceRealtime } from "@/hooks/use-attendance-realtime";
import { TagSelector, labelColor, useAttendanceLabels } from "@/components/attendance/TagSelector";

type AttendanceTemplate = {
  id: string;
  name: string;
  title?: string;
  preview?: string;
  language?: string;
  source?: string;
  status?: string;
  category?: string;
};

function isOfficialConnection(connection?: ChannelConnection | null) {
  const provider = String(connection?.provider ?? "").toLowerCase();
  const metadata = (connection?.metadata as any) ?? {};
  return provider.includes("official") || metadata.apiType === "official" || metadata.official === true || metadata.whatsappOfficial === true;
}

function connectionIcon(connection?: ChannelConnection | null) {
  const provider = String(connection?.provider ?? "").toLowerCase();
  const channel = String(connection?.channel ?? "").toLowerCase();
  if (provider.includes("instagram") || channel.includes("instagram")) return <SiInstagram className="h-4 w-4 text-pink-400" />;
  if (provider.includes("facebook") || channel.includes("facebook")) return <SiFacebook className="h-4 w-4 text-blue-500" />;
  if (isOfficialConnection(connection)) return <SiWhatsapp className="h-4 w-4 text-sky-400" />;
  if (channel.includes("whatsapp") || channel.includes("whu")) return <SiWhatsapp className="h-4 w-4 text-emerald-400" />;
  return <MessageSquare className="h-4 w-4 text-primary" />;
}

function NewConversationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [countryCode, setCountryCode] = useState("+55");
  const [sendInitialMessage, setSendInitialMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState("");
  const { toast } = useToast();

  const { data: connections = [] } = useQuery<ChannelConnection[]>({
    queryKey: ["/api/attendance/connections/available"],
    enabled: open,
  });
  const { data: sectors = [] } = useQuery<AttSector[]>({
    queryKey: ["/api/attendance/sectors"],
    enabled: open,
  });
  const templateQs = connectionId ? `connectionId=${encodeURIComponent(connectionId)}` : "";
  const selectedConnection = connections.find(connection => connection.id === connectionId);
  const officialChannel = isOfficialConnection(selectedConnection);
  const { data: templates = [] } = useQuery<AttendanceTemplate[]>({
    queryKey: ["/api/attendance/templates", templateQs],
    enabled: open && (sendInitialMessage || officialChannel || Boolean(connectionId)),
  });
  const selectedTemplate = templates.find(template => template.id === templateId);
  const officialTemplates = templates.filter(template => template.source === "official");
  const showTemplatePicker = sendInitialMessage || officialChannel;
  const selectedMetadata = (selectedConnection?.metadata as any) ?? {};
  const officialMissingBusinessAccount = officialChannel && !(
    selectedMetadata.businessAccountId ||
    selectedMetadata.whatsappBusinessAccountId ||
    selectedMetadata.wabaId
  );

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/attendance/conversations/create-new", {
      phone: `${countryCode}${phone}`.replace(/\D/g, ""),
      name,
      connectionId: connectionId || undefined,
      sectorId: sectorId || undefined,
      sendInitialMessage,
      message: selectedTemplate?.preview || message,
      templateId: templateId || undefined,
      templateName: selectedTemplate?.name,
      templateLanguage: selectedTemplate?.language,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      toast({ title: "Conversa iniciada" });
      setPhone("");
      setName("");
      setConnectionId("");
      setSectorId("");
      setCountryCode("+55");
      setSendInitialMessage(false);
      setMessage("");
      setTemplateId("");
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent data-testid="dialog-new-conversation">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Select value={connectionId || "__none"} onValueChange={value => {
            const nextConnectionId = value === "__none" ? "" : value;
            const nextConnection = connections.find(connection => connection.id === nextConnectionId);
            setConnectionId(nextConnectionId);
            setTemplateId("");
            if (isOfficialConnection(nextConnection)) setSendInitialMessage(true);
          }}>
            <SelectTrigger className="h-11" data-testid="select-new-conv-channel">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Canal</SelectItem>
              {connections.map(connection => (
                <SelectItem key={connection.id} value={connection.id}>
                  <span className="flex items-center gap-2">
                    {connectionIcon(connection)}
                    <span>{connection.name}</span>
                    {isOfficialConnection(connection) ? <span className="text-xs text-sky-400">Oficial</span> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorId || "__none"} onValueChange={value => setSectorId(value === "__none" ? "" : value)}>
            <SelectTrigger className="h-11" data-testid="select-new-conv-sector">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Setor</SelectItem>
              {sectors.map(sector => (
                <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Número de WhatsApp *</label>
            <Input
              value={phone}
              onChange={event => setPhone(event.target.value)}
              placeholder="5511999990000"
              data-testid="input-new-conv-phone"
            />
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="mt-2 h-10" data-testid="select-country-code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="+55">Brasil +55</SelectItem>
                <SelectItem value="+1">EUA +1</SelectItem>
                <SelectItem value="+54">Argentina +54</SelectItem>
                <SelectItem value="+598">Uruguai +598</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Formato: código do país + DDD + número</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome do contato</label>
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Nome"
              data-testid="input-new-conv-name"
            />
          </div>
          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox checked={sendInitialMessage} onCheckedChange={value => setSendInitialMessage(Boolean(value) || officialChannel)} disabled={officialChannel} />
              {officialChannel ? "Enviar template oficial ao iniciar" : "Enviar resposta rápida?"}
            </label>
          </div>
          {showTemplatePicker ? (
            <div className="space-y-3">
              {officialChannel && officialMissingBusinessAccount ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Esta conexão está marcada como API oficial, mas falta o Business Account ID/WABA ID na configuração técnica para listar templates aprovados.
                </div>
              ) : null}
              <Select value={templateId || "__none"} onValueChange={value => {
                setTemplateId(value === "__none" ? "" : value);
                const template = templates.find(item => item.id === value);
                if (template?.preview) setMessage(template.preview);
              }}>
                <SelectTrigger className="h-11" data-testid="select-new-conv-template">
                  <SelectValue placeholder="Selecionar template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Selecionar template</SelectItem>
                  {(officialChannel ? officialTemplates : templates).map(template => (
                    <SelectItem key={`${template.source}-${template.id}`} value={template.id}>
                      {template.title ?? template.name} {template.language ? `(${template.language})` : ""} {template.status ? `- ${template.status}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {officialChannel && !officialMissingBusinessAccount && officialTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum template oficial retornado para esta conexão. Confirme se os templates foram sincronizados/aprovados na WHU/Meta.</p>
              ) : null}
              <Textarea
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder="Mensagem"
                className="min-h-24"
                data-testid="input-new-conv-message"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!phone.trim() || mutation.isPending}
            data-testid="button-confirm-new-conversation"
          >
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [selectedConversation, setSelectedConversation] = useState<AttConversation | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);
  useAttendanceRealtime();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-testid="page-attendance">
      <Tabs
        value={activeTab}
        onValueChange={value => {
          setActiveTab(value);
          if (value !== "inbox") setSelectedConversation(null);
        }}
        className="flex h-full flex-col"
      >
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-sidebar px-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none text-sidebar-foreground">Atendimento</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">Political</p>
              </div>
            </div>
            <TabsList className="h-8 bg-background" data-testid="tabs-attendance">
              <TabsTrigger value="inbox" className="gap-1.5 text-xs" data-testid="tab-inbox">
                <MessageSquare className="h-3.5 w-3.5" /> Caixa
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-1.5 text-xs" data-testid="tab-reports">
                <BarChart2 className="h-3.5 w-3.5" /> Relatórios
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5 text-xs" data-testid="tab-contacts">
                <Users className="h-3.5 w-3.5" /> Contatos
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-1.5 text-xs" data-testid="tab-archived">
                <Archive className="h-3.5 w-3.5" /> Arquivados
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs" data-testid="tab-history">
                <FileClock className="h-3.5 w-3.5" /> Histórico
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs" data-testid="tab-settings">
                <Settings className="h-3.5 w-3.5" /> Configurações
              </TabsTrigger>
              <TabsTrigger value="automation" className="gap-1.5 text-xs" data-testid="tab-automation">
                <Zap className="h-3.5 w-3.5" /> Automações
              </TabsTrigger>
            </TabsList>
          </div>
          <Button size="sm" onClick={() => setShowNewConv(true)} className="gap-1.5" data-testid="button-new-conv-top">
            <Plus className="h-3.5 w-3.5" />
            Nova conversa
          </Button>
        </div>

        <TabsContent value="inbox" className="m-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex h-full overflow-hidden bg-muted/20">
            <div className="w-[22rem] flex-shrink-0 overflow-hidden xl:w-[23rem]">
              <ConversationList
                selected={selectedConversation}
                onSelect={conversation => setSelectedConversation(conversation)}
                onNewConversation={() => setShowNewConv(true)}
              />
            </div>

            <div className="min-w-0 flex-1 overflow-hidden border-r border-border bg-background">
              {selectedConversation ? (
                <ChatPanel
                  key={selectedConversation.id}
                  conversation={selectedConversation}
                  onClose={() => setSelectedConversation(null)}
                  onOpenContact={() => setShowContactPanel(true)}
                />
              ) : (
                <div
                  className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"
                  data-testid="empty-chat-panel"
                  style={{
                    backgroundColor: "hsl(var(--accent) / 0.22)",
                    backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.16) 1px, transparent 0)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-background/85 text-primary shadow-sm">
                    <MessageSquare className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Selecione um atendimento</p>
                    <p className="mt-1 text-xs">A conversa aparece aqui com histórico, ações e resposta em tempo real.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowNewConv(true)} data-testid="button-new-conv-empty">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Nova conversa
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="m-0 flex-1 overflow-auto bg-background">
          <ReportsTab />
        </TabsContent>

        <TabsContent value="contacts" className="m-0 flex-1 overflow-auto bg-background">
          <AttendanceContactsTab />
        </TabsContent>

        <TabsContent value="archived" className="m-0 flex-1 overflow-auto bg-background">
          <AttendanceArchivedTab />
        </TabsContent>

        <TabsContent value="history" className="m-0 flex-1 overflow-auto bg-background">
          <AttendanceHistoryTab />
        </TabsContent>

        <TabsContent value="settings" className="m-0 flex-1 overflow-auto bg-background">
          <SettingsTab />
        </TabsContent>

        <TabsContent value="automation" className="m-0 flex-1 overflow-auto bg-background">
          <AutomationTab />
        </TabsContent>
      </Tabs>

      <NewConversationDialog open={showNewConv} onClose={() => setShowNewConv(false)} />
      <Dialog open={showContactPanel} onOpenChange={setShowContactPanel}>
        <DialogContent className="max-h-[86vh] max-w-xl overflow-hidden p-0" data-testid="dialog-contact-panel">
          <DialogHeader className="sr-only">
            <DialogTitle>Detalhes do contato</DialogTitle>
          </DialogHeader>
          {selectedConversation ? (
            <ContactPanel
              key={selectedConversation.id}
              conversation={selectedConversation}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatAttendanceDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getHistoryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    resolved: "Finalizado",
    finalized: "Finalizado",
    closed: "Encerrado",
    paused: "Pausado",
    waiting_agent: "Aguardando atendente",
    waiting_customer: "Aguardando cliente",
    in_progress: "Em atendimento",
  };
  return labels[status] ?? status;
}

type AttendanceHistoryDetail = {
  conversation: AttConversation;
  messages: AttMessage[];
  notes: AttNote[];
  events: AttConversationEvent[];
  transfers: AttTransfer[];
};

function getHistoryMessageLabel(message: AttMessage) {
  if (message.direction === "inbound") return "Cliente";
  if (message.direction === "outbound") return "Operador";
  if (message.direction === "internal") return "Nota interna";
  if (message.direction === "system") return "Sistema";
  return message.direction;
}

function getHistoryMessageClass(message: AttMessage) {
  if (message.direction === "inbound") return "mr-auto border-border bg-card text-foreground";
  if (message.direction === "system") return "mx-auto max-w-md border-primary/20 bg-primary/10 text-center text-primary";
  if (message.direction === "internal") return "mx-auto max-w-md border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "ml-auto border-primary/20 bg-primary/15 text-foreground";
}

function AttendanceHistoryDetailDialog({ conversationId, onClose }: { conversationId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<AttendanceHistoryDetail>({
    queryKey: conversationId ? ["/api/attendance/history", conversationId] : ["/api/attendance/history", "__empty__"],
    enabled: Boolean(conversationId),
  });
  const conversation = data?.conversation;
  const messages = data?.messages ?? [];
  const events = data?.events ?? [];
  const transfers = data?.transfers ?? [];
  const notes = data?.notes ?? [];

  return (
    <Dialog open={Boolean(conversationId)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0" data-testid="dialog-attendance-history-detail">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Atendimento {conversation?.attendanceCode ?? ""}
            {conversation?.status ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {getHistoryStatusLabel(conversation.status)}
              </span>
            ) : null}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {conversation?.contactName ?? conversation?.contactPhone ?? "Contato"} · {conversation?.contactPhone ?? conversation?.externalContactId ?? "Sem telefone"}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando atendimento...</div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">Nao foi possivel carregar este atendimento.</div>
        ) : (
          <div className="grid max-h-[calc(90vh-92px)] overflow-hidden md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-y-auto border-r border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Mensagens</h3>
                <span className="text-xs text-muted-foreground">{messages.length} registro(s)</span>
              </div>
              {messages.length === 0 ? (
                <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">Nenhuma mensagem registrada neste atendimento.</div>
              ) : (
                <div className="space-y-3">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`max-w-[82%] rounded-md border px-3 py-2 text-sm shadow-sm ${getHistoryMessageClass(message)}`}
                      data-testid={`history-message-${message.id}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-muted-foreground">
                        <span>{getHistoryMessageLabel(message)}</span>
                        <span>{formatAttendanceDate(message.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words">
                        {message.body || (message.mediaUrl ? "Midia/anexo" : "Mensagem sem conteudo")}
                      </div>
                      {message.mediaUrl ? (
                        <a className="mt-2 block text-xs font-semibold text-primary underline-offset-2 hover:underline" href={message.mediaUrl} target="_blank" rel="noreferrer">
                          Abrir anexo
                        </a>
                      ) : null}
                      {message.status ? <div className="mt-1 text-[10px] text-muted-foreground">Status: {message.status}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              <div className="space-y-4">
                <section className="rounded-md border border-border p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Resumo</h3>
                  <div className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>Canal: {conversation?.channel ?? "-"}</span>
                    <span>Modo: {conversation?.mode ?? "-"}</span>
                    <span>Aberto: {formatAttendanceDate(conversation?.createdAt)}</span>
                    <span>Finalizado: {formatAttendanceDate(conversation?.closedAt ?? conversation?.resolvedAt)}</span>
                    <span>Prioridade: {conversation?.priority ?? "normal"}</span>
                  </div>
                  {conversation?.tags && conversation.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {conversation.tags.map(tag => (
                        <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-md border border-border p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Notas internas</h3>
                  {notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map(note => (
                        <div key={note.id} className="rounded bg-muted/40 p-2 text-xs">
                          <p className="whitespace-pre-wrap text-foreground">{note.note}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{formatAttendanceDate(note.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-md border border-border p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Transferencias</h3>
                  {transfers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma transferencia registrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {transfers.map(transfer => (
                        <div key={transfer.id} className="rounded bg-muted/40 p-2 text-xs text-muted-foreground">
                          <p className="text-foreground">{transfer.reason || "Transferencia registrada"}</p>
                          <p>{formatAttendanceDate(transfer.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-md border border-border p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Eventos</h3>
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {events.slice(0, 80).map(event => (
                        <div key={event.id} className="rounded bg-muted/40 p-2 text-xs">
                          <p className="font-semibold text-foreground">{event.action}</p>
                          <p className="text-[10px] text-muted-foreground">{formatAttendanceDate(event.createdAt)}</p>
                        </div>
                      ))}
                      {events.length > 80 ? <p className="text-[10px] text-muted-foreground">Exibindo os 80 eventos mais recentes.</p> : null}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttendanceHistoryTab() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const { toast } = useToast();

  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();

  const { data: history = [], isLoading } = useQuery<AttConversation[]>({
    queryKey: query ? ["/api/attendance/history", query] : ["/api/attendance/history"],
  });

  const handleExportHistory = async (format: "csv" | "xlsx" | "pdf") => {
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.set("format", format);
      const response = await apiRequest("GET", `/api/attendance/history/export?${exportParams.toString()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "xlsx" ? "historico-atendimentos.xlsx" : format === "pdf" ? "historico-atendimentos.pdf" : "historico-atendimentos.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Erro ao exportar historico", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4" data-testid="attendance-history-tab">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Historico de atendimentos</h2>
          <p className="text-xs text-muted-foreground">Todos os atendimentos finalizados ou encerrados no Political.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-[220px_150px_150px_auto_auto_auto]">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por cliente, telefone ou protocolo"
            data-testid="input-search-attendance-history"
          />
          <Input type="date" value={from} onChange={event => setFrom(event.target.value)} data-testid="input-history-from" />
          <Input type="date" value={to} onChange={event => setTo(event.target.value)} data-testid="input-history-to" />
          <Button variant="outline" onClick={() => handleExportHistory("csv")} data-testid="button-export-history-csv">
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" onClick={() => handleExportHistory("xlsx")} data-testid="button-export-history-xlsx">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button variant="outline" onClick={() => handleExportHistory("pdf")} data-testid="button-export-history-pdf">
            <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando historico...</div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum atendimento realizado encontrado</div>
        ) : (
          history.map(conversation => {
            const finishedAt = conversation.closedAt ?? conversation.resolvedAt;
            return (
              <button
                key={conversation.id}
                type="button"
                className="flex w-full flex-col gap-3 border-b border-border p-3 text-left transition-colors last:border-0 hover:bg-muted/35 focus:outline-none focus:ring-2 focus:ring-primary/40 md:flex-row md:items-center"
                onClick={() => setSelectedConversationId(conversation.id)}
                data-testid={`attendance-history-${conversation.id}`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(conversation.contactName ?? conversation.contactPhone ?? "AT").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{conversation.contactName ?? conversation.contactPhone ?? "Contato sem nome"}</p>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{getHistoryStatusLabel(conversation.status)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {conversation.contactPhone ?? conversation.externalContactId ?? "Sem telefone"} · {conversation.attendanceCode ?? conversation.protocol ?? "Sem protocolo"}
                  </p>
                  {conversation.tags && conversation.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {conversation.tags.map(tag => (
                        <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground md:min-w-56 md:text-right">
                  <span>Aberto: {formatAttendanceDate(conversation.createdAt)}</span>
                  <span>Finalizado: {formatAttendanceDate(finishedAt)}</span>
                  <span className="font-semibold text-primary">Ver atendimento</span>
                </div>
              </button>
            );
          })
        )}
      </div>
      <AttendanceHistoryDetailDialog conversationId={selectedConversationId} onClose={() => setSelectedConversationId(null)} />
    </div>
  );
}

function AttendanceContactsTab() {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState({
    name: "Nome",
    phone: "Telefone",
    email: "Email",
    city: "Cidade",
    state: "Estado",
    tags: "Etiquetas",
    notes: "Observacoes",
    channel: "Canal",
    company: "Empresa",
    position: "Cargo",
  });
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", state: "", notes: "", tags: [] as string[] });
  const { toast } = useToast();
  const { data: labels = [] } = useAttendanceLabels();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/attendance/contacts"],
  });

  const filtered = contacts.filter(contact => {
    const term = search.trim().toLowerCase();
    if (tagFilter && !(contact.interests ?? []).includes(tagFilter)) return false;
    if (!term) return true;
    return [contact.name, contact.phone, contact.email, contact.city, contact.state, ...(contact.interests ?? [])]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(term));
  });
  const availableTags = Array.from(new Set([...labels.map(label => label.name), ...contacts.flatMap(contact => contact.interests ?? [])])).sort();

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setForm({
      name: contact.name,
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      city: contact.city ?? "",
      state: contact.state ?? "",
      notes: contact.notes ?? "",
      tags: contact.interests ?? [],
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/attendance/contacts/${editing?.id}`, {
      name: form.name,
      phone: form.phone,
      email: form.email,
      city: form.city,
      state: form.state,
      notes: form.notes,
      interests: form.tags,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/contacts"] });
      setEditing(null);
      toast({ title: "Contato atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importListMutation = useMutation({
    mutationFn: async () => {
      const contactsToImport = parseContactsList(importText);
      if (contactsToImport.length === 0) throw new Error("Nenhum contato válido encontrado");
      const res = await apiRequest("POST", "/api/attendance/contacts/import-list", { contacts: contactsToImport });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/contacts"] });
      setImportText("");
      setShowImport(false);
      toast({ title: "Contatos importados", description: `${data.imported ?? 0} criado(s), ${data.updated ?? 0} atualizado(s)` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importFileMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error("Selecione um arquivo CSV, XLSX, XLS ou TXT");
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("mapping", JSON.stringify(mapping));
      const token = getAuthToken();
      const response = await fetch("/api/attendance/contacts/import-file", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        let message = text || response.statusText;
        try {
          const parsed = JSON.parse(text);
          message = parsed.message || parsed.error || message;
        } catch {
          // Keep the raw response text when it is not JSON.
        }
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: (job: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/contacts"] });
      setImportFile(null);
      setShowImport(false);
      toast({
        title: "Arquivo importado",
        description: `${job.importedRows ?? 0} criado(s), ${job.updatedRows ?? 0} atualizado(s), ${job.failedRows ?? 0} falha(s)`,
      });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleExportContacts = async () => {
    try {
      const qs = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : "";
      const response = await apiRequest("GET", `/api/attendance/contacts/export${qs}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "contatos-atendimento.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Erro ao extrair contatos", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4" data-testid="attendance-contacts-tab">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Contatos do atendimento</h2>
          <p className="text-xs text-muted-foreground">Contatos salvos automaticamente a partir das conversas recebidas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-list-attendance-contacts">
            <Upload className="mr-2 h-4 w-4" /> Importar CSV/lista
          </Button>
          <Button variant="outline" onClick={handleExportContacts} data-testid="button-export-attendance-contacts">
            <Download className="mr-2 h-4 w-4" /> Extrair contatos
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Pesquisar contato"
          className="max-w-md"
          data-testid="input-search-attendance-contacts"
        />
        <Select value={tagFilter || "__all"} onValueChange={value => setTagFilter(value === "__all" ? "" : value)}>
          <SelectTrigger className="w-full md:w-56" data-testid="select-contact-tag-filter">
            <SelectValue placeholder="Filtrar por etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas as etiquetas</SelectItem>
            {availableTags.map(tag => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando contatos...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum contato encontrado</div>
        ) : (
          filtered.map(contact => (
            <div key={contact.id} className="flex flex-col gap-3 border-b border-border p-3 last:border-0 md:flex-row md:items-center" data-testid={`attendance-contact-${contact.id}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{contact.name}</p>
                <p className="text-xs text-muted-foreground">{contact.phone || "Sem telefone"} {contact.email ? `- ${contact.email}` : ""}</p>
                {contact.interests && contact.interests.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {contact.interests.map(tag => (
                      <span
                        key={tag}
                        className="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ borderColor: labelColor(labels, tag), backgroundColor: `${labelColor(labels, tag)}22`, color: labelColor(labels, tag) }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {(contact.city || contact.state || contact.notes) ? (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{[contact.city, contact.state].filter(Boolean).join(" / ")} {contact.notes ? `- ${contact.notes}` : ""}</p>
                ) : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(contact)} data-testid={`button-edit-attendance-contact-${contact.id}`}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={value => !value && setEditing(null)}>
        <DialogContent data-testid="dialog-edit-attendance-contact">
          <DialogHeader>
            <DialogTitle>Editar contato</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nome" />
            <Input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} placeholder="Telefone" />
            <Input value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="E-mail" />
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} placeholder="Cidade" />
              <Input value={form.state} onChange={event => setForm(current => ({ ...current, state: event.target.value }))} placeholder="Estado" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Etiquetas</p>
              <TagSelector selected={form.tags} onChange={tags => setForm(current => ({ ...current, tags }))} />
            </div>
            <Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Informações extras" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={value => !value && setShowImport(false)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-import-attendance-contacts">
          <DialogHeader>
            <DialogTitle>Importar contatos</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Para importar etiquetas, use a sexta coluna e separe multiplas etiquetas com |.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border p-3">
              <label className="mb-2 block text-xs font-medium text-foreground">Arquivo CSV, XLSX, XLS ou TXT</label>
              <Input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={event => setImportFile(event.target.files?.[0] ?? null)}
                data-testid="input-import-attendance-file"
              />
              {importFile ? (
                <p className="mt-2 text-xs text-muted-foreground">{importFile.name}</p>
              ) : null}
            </div>
            <div className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-3">
              {Object.entries(mapping).map(([key, value]) => (
                <Input
                  key={key}
                  value={value}
                  onChange={event => setMapping(current => ({ ...current, [key]: event.target.value }))}
                  placeholder={key}
                  className="h-8 text-xs"
                  data-testid={`input-import-map-${key}`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cole uma lista ou CSV. Formatos aceitos: Nome, Telefone, Email, Cidade, Estado, Observações.
            </p>
            <Textarea
              value={importText}
              onChange={event => setImportText(event.target.value)}
              placeholder={"Maria Silva, 5551999999999, maria@email.com, Porto Alegre, RS\nJoão Souza; 5551888888888"}
              className="min-h-48"
              data-testid="textarea-import-attendance-contacts"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button
              onClick={() => importFile ? importFileMutation.mutate() : importListMutation.mutate()}
              disabled={(!importFile && !importText.trim()) || importListMutation.isPending || importFileMutation.isPending}
            >
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseContactsList(raw: string) {
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^nome\s*[,;]\s*telefone/i.test(line))
    .map(line => {
      const separator = line.includes(";") ? ";" : ",";
      const parts = line.split(separator).map(part => part.trim()).filter(Boolean);
      if (parts.length === 1) {
        const phone = parts[0].match(/\+?\d[\d\s().-]{7,}/)?.[0] ?? "";
        const name = phone ? parts[0].replace(phone, "").trim() : parts[0];
        return { name: name || phone, phone };
      }
      return {
        name: parts[0] ?? "",
        phone: parts[1] ?? "",
        email: parts[2] ?? "",
        city: parts[3] ?? "",
        state: parts[4] ?? "",
        interests: (parts[5] ?? "").split("|").map(tag => tag.trim()).filter(Boolean),
        notes: parts.slice(6).join(" "),
      };
    })
    .filter(contact => contact.name.trim());
}

function AttendanceArchivedTab() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const query = params.toString();

  const { data: archived = [], isLoading } = useQuery<AttConversation[]>({
    queryKey: query ? ["/api/attendance/archived", query] : ["/api/attendance/archived"],
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/attendance/conversations/${id}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      toast({ title: "Atendimento restaurado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/attendance/conversations/${id}`, { reason: "Exclusao auditavel pelo atendimento" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      toast({ title: "Atendimento removido da operacao", description: "Registro minimo preservado para auditoria." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4" data-testid="attendance-archived-tab">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Arquivados</h2>
          <p className="text-xs text-muted-foreground">Atendimentos ocultos das filas normais, com rastreabilidade preservada.</p>
        </div>
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Buscar por contato, telefone ou protocolo"
          className="max-w-sm"
          data-testid="input-search-archived"
        />
      </div>

      <div className="rounded-md border border-border">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando arquivados...</div>
        ) : archived.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum atendimento arquivado</div>
        ) : (
          archived.map(conversation => (
            <div key={conversation.id} className="flex flex-col gap-3 border-b border-border p-3 last:border-0 md:flex-row md:items-center" data-testid={`archived-conversation-${conversation.id}`}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {(conversation.contactName ?? conversation.contactPhone ?? "AT").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{conversation.contactName ?? conversation.contactPhone ?? "Contato sem nome"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {conversation.contactPhone ?? "Sem telefone"} - {conversation.attendanceCode ?? conversation.protocol ?? conversation.id}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Arquivado em {formatAttendanceDate((conversation.metadata as any)?.archivedAt ?? conversation.updatedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => restoreMutation.mutate(conversation.id)} disabled={restoreMutation.isPending}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restaurar
                </Button>
                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(conversation.id)} disabled={deleteMutation.isPending}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AttendanceActionRail({ conversation, onOpenContact }: { conversation: AttConversation | null; onOpenContact: () => void }) {
  const code = conversation?.attendanceCode ?? conversation?.protocol;

  return (
    <div className="hidden w-14 flex-shrink-0 flex-col items-center border-r border-border bg-sidebar py-3 lg:flex" data-testid="attendance-action-rail">
      <div className="flex flex-1 flex-col items-center gap-2">
        <RailButton title="Conversa" active icon={<MessageSquare className="h-4 w-4" />} />
        <RailButton title="Dados do contato" icon={<Users className="h-4 w-4" />} onClick={onOpenContact} disabled={!conversation} />
        <RailButton title="Histórico" icon={<FileClock className="h-4 w-4" />} />
        <RailButton title="Notas" icon={<StickyNote className="h-4 w-4" />} />
        <RailButton title="Etiquetas" icon={<Tags className="h-4 w-4" />} />
        <RailButton title="Automação" icon={<Bot className="h-4 w-4" />} />
        <RailButton title="Atividade" icon={<Activity className="h-4 w-4" />} />
      </div>
      {code ? (
        <div className="mb-2 flex max-h-28 w-8 items-center justify-center overflow-hidden rounded border border-border bg-background px-1 py-2 text-[10px] font-semibold text-muted-foreground [writing-mode:vertical-rl]">
          {code}
        </div>
      ) : null}
    </div>
  );
}

function RailButton({ title, icon, active = false, onClick, disabled = false }: { title: string; icon: JSX.Element; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "default" : "ghost"}
      className="h-9 w-9"
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </Button>
  );
}

