import { type ElementType, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChevronRight,
  Clock,
  Filter,
  Globe,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  WifiOff,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiWhatsapp } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AttConversation, ChannelConnection } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { labelColor, useAttendanceLabels } from "./TagSelector";

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  new: { label: "Novo", dot: "bg-sky-500" },
  waiting: { label: "Aguardando", dot: "bg-amber-500" },
  waiting_agent: { label: "Aguardando atendente", dot: "bg-amber-500" },
  waiting_customer: { label: "Aguardando cliente", dot: "bg-yellow-500" },
  bot: { label: "Bot", dot: "bg-violet-500" },
  automatic: { label: "Automático", dot: "bg-primary" },
  assigned: { label: "Atribuído", dot: "bg-cyan-500" },
  in_progress: { label: "Em atendimento", dot: "bg-emerald-600" },
  transferred: { label: "Transferido", dot: "bg-orange-500" },
  resolved: { label: "Resolvido", dot: "bg-muted-foreground" },
  finalized: { label: "Finalizado", dot: "bg-muted-foreground" },
  closed: { label: "Fechado", dot: "bg-muted-foreground" },
  out_of_hours: { label: "Fora do horário", dot: "bg-slate-500" },
  paused: { label: "Pausado", dot: "bg-zinc-500" },
  reopened: { label: "Reaberto", dot: "bg-red-500" },
};

const CHANNEL_META: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  whatsapp: {
    label: "WhatsApp",
    icon: <SiWhatsapp className="h-3.5 w-3.5" />,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  },
  email: {
    label: "E-mail",
    icon: <Mail className="h-3.5 w-3.5" />,
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
  },
  webchat: {
    label: "Webchat",
    icon: <Globe className="h-3.5 w-3.5" />,
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

function isOfficialConnection(connection?: ChannelConnection | null) {
  const provider = String(connection?.provider ?? "").toLowerCase();
  const metadata = (connection?.metadata as any) ?? {};
  return provider.includes("official") || metadata.apiType === "official" || metadata.official === true || metadata.whatsappOfficial === true;
}

function channelMetaForConversation(conversation: AttConversation, connection?: ChannelConnection | null) {
  const provider = String(connection?.provider ?? conversation.provider ?? "").toLowerCase();
  const channel = String(connection?.channel ?? conversation.channel ?? "").toLowerCase();
  const remote = ((conversation.metadata as any)?.remote ?? {}) as Record<string, any>;
  const metadataConnection = ((conversation.metadata as any)?.connection ?? {}) as Record<string, any>;
  const remoteChannel = String(remote.channel ?? remote.provider ?? remote.platform ?? "").toLowerCase();
  const remoteChannelObject = (remote.channel ?? {}) as Record<string, any>;
  const remoteChannelType = Number(remoteChannelObject.type ?? remote.channelType ?? remote.typeChannel);
  const metadataOfficial = Boolean(
    metadataConnection.official ||
    (conversation.metadata as any)?.official ||
    (conversation.metadata as any)?.whatsappOfficial ||
    remote.official ||
    remote.whatsappOfficial ||
    remote.apiOfficial ||
    remote.apiType === "official" ||
    remoteChannelObject.official ||
    remoteChannelObject.apiType === "official" ||
    remoteChannelType === 0
  );
  const value = `${provider} ${channel} ${remoteChannel} ${String(remoteChannelObject.description ?? "")} ${String(remoteChannelObject.identifier ?? "")}`.toLowerCase();

  if (value.includes("instagram")) {
    return {
      label: "Instagram",
      icon: <SiInstagram className="h-3.5 w-3.5" />,
      className: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-900",
    };
  }
  if (value.includes("facebook") || value.includes("messenger")) {
    return {
      label: "Facebook",
      icon: <SiFacebook className="h-3.5 w-3.5" />,
      className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
    };
  }
  if (isOfficialConnection(connection) || metadataOfficial || value.includes("official") || value.includes("oficial") || value.includes("cloud")) {
    return {
      label: "WhatsApp Oficial",
      icon: <SiWhatsapp className="h-3.5 w-3.5" />,
      className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
    };
  }
  if (value.includes("whatsapp") || value.includes("whu")) return CHANNEL_META.whatsapp;
  if (value.includes("email")) return CHANNEL_META.email;
  if (value.includes("webchat")) return CHANNEL_META.webchat;
  return {
    label: connection?.name ?? conversation.channel,
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    className: "bg-primary/10 text-primary border-primary/20",
  };
}

const LANE_DEFS = [
  {
    value: "automatic",
    label: "Automático",
    icon: Bot,
    matcher: (conv: AttConversation) => !isGroupConversation(conv) && ((conv as any).mode === "automatic" || ["automatic", "bot", "new"].includes(conv.status)),
  },
  {
    value: "waiting",
    label: "Aguardando",
    icon: UserCheck,
    matcher: (conv: AttConversation) => !isGroupConversation(conv) && ["waiting", "waiting_agent", "waiting_customer"].includes(conv.status),
  },
  {
    value: "out_of_hours",
    label: "Fora de hora",
    icon: Clock,
    matcher: (conv: AttConversation) => !isGroupConversation(conv) && conv.status === "out_of_hours",
  },
  {
    value: "manual",
    label: "Manual",
    icon: Users,
    matcher: (conv: AttConversation) =>
      !isGroupConversation(conv) && ((conv as any).mode === "manual" || ["assigned", "in_progress", "transferred", "paused", "reopened"].includes(conv.status)),
  },
  {
    value: "group",
    label: "Grupo",
    icon: MessageCircle,
    matcher: isGroupConversation,
  },
] as const;

const CLOSED_STATUSES = new Set(["resolved", "finalized", "closed"]);

function isGroupConversation(conv: AttConversation) {
  const metadata = (conv.metadata as any) ?? {};
  const remote = metadata.remote ?? {};
  return Boolean(metadata.isGroup || remote.isGroup || remote.contact?.isGroup || remote.typeChat === 3 || remote.type === 3 || metadata.queue === "group");
}

interface Props {
  selected: AttConversation | null;
  onSelect: (c: AttConversation) => void;
  onNewConversation: () => void;
}

export default function ConversationList({ selected, onSelect, onNewConversation }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [lastFrom, setLastFrom] = useState("");
  const [lastTo, setLastTo] = useState("");
  const [expandedLane, setExpandedLane] = useState<string>("waiting");
  const { toast } = useToast();
  const currentUser = getAuthUser();

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (channelFilter !== "all") params.set("channel", channelFilter);
  const qs = params.toString();

  const { data: conversations = [], isLoading, refetch, isFetching } = useQuery<AttConversation[]>({
    queryKey: ["/api/attendance/conversations", qs],
    refetchInterval: 10000,
  });
  const { data: connections = [] } = useQuery<ChannelConnection[]>({
    queryKey: ["/api/attendance/connections/available"],
  });
  const connectionById = useMemo(() => new Map(connections.map(connection => [connection.id, connection])), [connections]);

  const filteredConversations = useMemo(() => {
    return conversations.filter(conversation => {
      if (!showClosed && statusFilter === "all" && CLOSED_STATUSES.has(conversation.status)) return false;
      if (unreadOnly && !(conversation.unreadCount && conversation.unreadCount > 0)) return false;
      if (myOnly && conversation.assignedUserId !== currentUser?.id) return false;
      if (mentionsOnly && !((conversation.metadata as any)?.mentionsUnread || (conversation.metadata as any)?.hasUnreadMention)) return false;

      // Manual conversations assigned to another operator are not visible here —
      // they appear only in that operator's own "Manual" lane.
      const isManual = (conversation as any).mode === "manual" ||
        ["assigned", "in_progress", "transferred", "paused", "reopened"].includes(conversation.status);
      if (isManual && conversation.assignedUserId && conversation.assignedUserId !== currentUser?.id) return false;

      const createdAt = new Date(conversation.createdAt).getTime();
      const lastMessageAt = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : createdAt;
      if (createdFrom && createdAt < new Date(`${createdFrom}T00:00:00`).getTime()) return false;
      if (createdTo && createdAt > new Date(`${createdTo}T23:59:59`).getTime()) return false;
      if (lastFrom && lastMessageAt < new Date(`${lastFrom}T00:00:00`).getTime()) return false;
      if (lastTo && lastMessageAt > new Date(`${lastTo}T23:59:59`).getTime()) return false;

      return true;
    });
  }, [conversations, showClosed, statusFilter, unreadOnly, myOnly, mentionsOnly, createdFrom, createdTo, lastFrom, lastTo, currentUser?.id]);

  const laneData = useMemo(() => {
    const entries = LANE_DEFS.map(lane => {
      let items = filteredConversations.filter(lane.matcher);
      if (lane.value === "manual") {
        items = items.filter(conversation => conversation.assignedUserId === currentUser?.id);
      }
      if (lane.value === "waiting") {
        const unassignedManual = filteredConversations.filter(conversation =>
          !isGroupConversation(conversation) &&
          !conversation.assignedUserId &&
          !CLOSED_STATUSES.has(conversation.status) &&
          ((conversation as any).mode === "manual" || ["assigned", "in_progress", "transferred", "paused", "reopened"].includes(conversation.status))
        );
        const byId = new Map(items.map(conversation => [conversation.id, conversation]));
        for (const conversation of unassignedManual) byId.set(conversation.id, conversation);
        items = Array.from(byId.values());
      }
      return [lane.value, { count: items.length, items }] as const;
    });
    return Object.fromEntries(entries) as Record<string, { count: number; items: AttConversation[] }>;
  }, [filteredConversations, currentUser?.id]);

  const resetFilters = () => {
    setStatusFilter("all");
    setChannelFilter("all");
    setShowClosed(false);
    setUnreadOnly(false);
    setMyOnly(false);
    setMentionsOnly(false);
    setCreatedFrom("");
    setCreatedTo("");
    setLastFrom("");
    setLastTo("");
  };

  const toggleLane = (lane: string) => {
    setExpandedLane(current => current === lane ? "" : lane);
  };

  const handleSync = async (silent = false) => {
    try {
      await apiRequest("POST", "/api/attendance/sync", { page: 0 });
      await queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      if (!silent) toast({ title: "Sincronizado com sucesso" });
    } catch (e: any) {
      if (!silent) toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      handleSync(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar" data-testid="panel-conversation-list">
      <div className="border-b border-sidebar-border bg-sidebar px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">Atendimentos</p>
            <h2 className="text-base font-semibold text-sidebar-foreground">Central omnichannel</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-conversations">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn("h-8 w-8", showFilters && "bg-primary/10 text-primary")}
              onClick={() => setShowFilters(true)}
              data-testid="button-open-attendance-filters"
              title="Filtros"
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-8 w-8" onClick={onNewConversation} data-testid="button-new-conversation" title="Nova conversa">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar"
            className="h-10 rounded-md border-input bg-background pl-9 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-conversations"
          />
        </div>

        {false ? <div className="mt-2 grid grid-cols-2 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 bg-background text-xs" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="automatic">Automático</SelectItem>
              <SelectItem value="waiting_agent">Aguardando atendente</SelectItem>
              <SelectItem value="waiting_customer">Aguardando cliente</SelectItem>
              <SelectItem value="in_progress">Em atendimento</SelectItem>
              <SelectItem value="transferred">Transferido</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
              <SelectItem value="finalized">Finalizado</SelectItem>
              <SelectItem value="out_of_hours">Fora do horário</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 bg-background text-xs" data-testid="select-channel-filter">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="webchat">Webchat</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
        </div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {isLoading ? (
          <div className="space-y-3 p-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-11 w-11 flex-shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground" data-testid="empty-conversations">
            <WifiOff className="mb-2 h-8 w-8 opacity-30" />
            <p>Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="space-y-1 p-2" data-testid="attendance-lanes">
            <LaneSection
              value="all"
              label="Todos"
              icon={Inbox}
              count={filteredConversations.length}
              conversations={filteredConversations}
              connectionById={connectionById}
              expanded={expandedLane === "all"}
              selectedId={selected?.id}
              onToggle={() => toggleLane("all")}
              onSelect={onSelect}
            />

            {LANE_DEFS.map(lane => {
              const data = laneData[lane.value] ?? { count: 0, items: [] };
              return (
                <LaneSection
                  key={lane.value}
                  value={lane.value}
                  label={lane.label}
                  icon={lane.icon}
                  count={data.count}
                  conversations={data.items}
                  connectionById={connectionById}
                  expanded={expandedLane === lane.value}
                  selectedId={selected?.id}
                  onToggle={() => toggleLane(lane.value)}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="w-[21rem] overflow-y-auto p-4 sm:max-w-[21rem]" data-testid="sheet-attendance-filters">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">Filtros</SheetTitle>
          </SheetHeader>

          <div className="space-y-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 bg-background text-sm" data-testid="select-status-filter">
                <SelectValue placeholder="Ignorar filtros em" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ignorar filtros em</SelectItem>
                <SelectItem value="automatic">Automático</SelectItem>
                <SelectItem value="waiting_agent">Aguardando atendente</SelectItem>
                <SelectItem value="waiting_customer">Aguardando cliente</SelectItem>
                <SelectItem value="in_progress">Em atendimento</SelectItem>
                <SelectItem value="transferred">Transferido</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
                <SelectItem value="finalized">Finalizado</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="out_of_hours">Fora do horário</SelectItem>
              </SelectContent>
            </Select>

            <FilterCheckbox label="Apenas não lidas" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            <FilterCheckbox label="Apenas meus atendimentos" checked={myOnly} onCheckedChange={setMyOnly} />
            <FilterCheckbox label="Apenas menções não lidas" checked={mentionsOnly} onCheckedChange={setMentionsOnly} />
            <FilterCheckbox label="Mostrar finalizados e fechados" checked={showClosed} onCheckedChange={setShowClosed} />

            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-11 bg-background text-sm" data-testid="select-channel-filter">
                <SelectValue placeholder="Filtrar por canais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Filtrar por canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="webchat">Webchat</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>

            <FilterPlaceholder label="Filtrar por usuários" />
            <FilterPlaceholder label="Filtrar por empresas" />
            <FilterPlaceholder label="Filtrar por setores" />
            <FilterPlaceholder label="Filtrar por etiquetas" />

            <DateRangeFilter label="Filtrar pela data inicial do atendimento:" from={createdFrom} to={createdTo} onFromChange={setCreatedFrom} onToChange={setCreatedTo} />
            <DateRangeFilter label="Filtrar pela data da última interação:" from={lastFrom} to={lastTo} onFromChange={setLastFrom} onToChange={setLastTo} />

            <div className="flex items-center justify-between pt-3">
              <Button onClick={() => setShowFilters(false)} data-testid="button-apply-attendance-filters">OK</Button>
              <Button variant="outline" onClick={resetFilters} data-testid="button-clear-attendance-filters">Limpar filtros</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterCheckbox({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={value => onCheckedChange(Boolean(value))} />
      <span>{label}</span>
    </label>
  );
}

function FilterPlaceholder({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground"
      disabled
    >
      {label}
      <ChevronRight className="h-4 w-4 rotate-90" />
    </button>
  );
}

function DateRangeFilter({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={from} onChange={event => onFromChange(event.target.value)} className="h-10 text-xs" />
        <Input type="date" value={to} onChange={event => onToChange(event.target.value)} className="h-10 text-xs" />
      </div>
    </div>
  );
}

function LaneSection({
  value,
  label,
  icon: Icon,
  count,
  conversations,
  connectionById,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  value: string;
  label: string;
  icon: ElementType;
  count: number;
  conversations: AttConversation[];
  connectionById: Map<string, ChannelConnection>;
  expanded: boolean;
  selectedId?: string;
  onToggle: () => void;
  onSelect: (conversation: AttConversation) => void;
}) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-transparent", expanded && "border-border bg-sidebar/40")}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
          expanded ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )}
        data-testid={`lane-${value}`}
        aria-expanded={expanded}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 font-semibold">{label}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", expanded ? "bg-primary text-primary-foreground" : "bg-foreground text-background")}>
          {count}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded ? (
        <div className="border-t border-border/70 bg-background" data-testid={`lane-items-${value}`}>
          {conversations.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">
              Nenhum atendimento neste grupo
            </div>
          ) : (
            conversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                connection={conversation.connectionId ? connectionById.get(conversation.connectionId) : undefined}
                selected={selectedId === conversation.id}
                onSelect={() => onSelect(conversation)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ConversationItem({ conversation, connection, selected, onSelect }: { conversation: AttConversation; connection?: ChannelConnection; selected: boolean; onSelect: () => void }) {
  const { data: labels = [] } = useAttendanceLabels();
  const status = STATUS_LABELS[conversation.status] ?? { label: conversation.status, dot: "bg-muted-foreground" };
  const channel = channelMetaForConversation(conversation, connection);
  const initials = (conversation.contactName ?? conversation.contactPhone ?? "?")
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const displayName = conversation.contactName ?? conversation.contactPhone ?? "Contato sem nome";
  const displayPhone = conversation.contactPhone && conversation.contactName ? conversation.contactPhone : conversation.channel;
  const lastDate = conversation.lastMessageAt ? new Date(conversation.lastMessageAt) : null;
  const lastMessage = conversation.lastMessagePreview || "Sem mensagens";
  const code = (conversation as any).attendanceCode ?? conversation.protocol;
  const modeLabel = (conversation as any).mode === "manual" ? "Manual" : "Automático";

  return (
    <button
      type="button"
      data-testid={`item-conversation-${conversation.id}`}
      onClick={onSelect}
      className={cn(
        "group flex w-full gap-3 border-b border-border/70 px-3 py-3 text-left transition-colors",
        selected ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : "bg-background hover:bg-accent/60",
      )}
    >
      <div className="relative mt-0.5 flex-shrink-0">
        <Avatar className="h-11 w-11 border border-border bg-muted">
          <AvatarImage src={conversation.contactAvatar ?? ""} />
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <span className={cn("absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background", channel?.className ?? "bg-muted text-muted-foreground")}>
          {channel?.icon ?? <MessageSquare className="h-3 w-3" />}
        </span>
        {conversation.unreadCount && conversation.unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{displayPhone}</p>
          </div>
          {lastDate ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[11px] text-muted-foreground">{format(lastDate, "HH:mm", { locale: ptBR })}</span>
              <span className="text-[10px] text-muted-foreground/80">
                {formatDistanceToNow(lastDate, { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          ) : null}
        </div>

        <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{lastMessage}</p>

        <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
          <span className="inline-flex max-w-[8rem] items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", status.dot)} />
            <span className="truncate">{status.label}</span>
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{modeLabel}</span>
          {conversation.assignedUserId ? (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Responsável
            </span>
          ) : null}
        </div>

        {conversation.tags && conversation.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {conversation.tags.slice(0, 3).map(tag => (
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

        {code ? <p className="mt-1 truncate text-[10px] text-muted-foreground/70">{code}</p> : null}
      </div>
    </button>
  );
}
