import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  Bot,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileText,
  Lock,
  MessageSquareText,
  Mic,
  MoreVertical,
  Paperclip,
  PauseCircle,
  Phone,
  Pin,
  RefreshCw,
  Send,
  Smile,
  Star,
  Tags,
  UserPlus,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AttConversation, AttMessage, QuickReply } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { TagSelector, labelColor, useAttendanceLabels } from "./TagSelector";

const STATUS_META: Record<string, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900" },
  waiting: { label: "Aguardando", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" },
  waiting_agent: { label: "Aguardando atendente", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" },
  waiting_customer: { label: "Aguardando cliente", className: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-900" },
  in_progress: { label: "Em atendimento", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" },
  finalized: { label: "Finalizado", className: "bg-muted text-muted-foreground border-border" },
  closed: { label: "Fechado", className: "bg-muted text-muted-foreground border-border" },
  bot: { label: "Bot", className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900" },
  automatic: { label: "Automático", className: "bg-primary/10 text-primary border-primary/20" },
  out_of_hours: { label: "Fora do horário", className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800" },
  paused: { label: "Pausado", className: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-300 dark:border-zinc-800" },
  transferred: { label: "Transferido", className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900" },
  reopened: { label: "Reaberto", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900" },
};

const MESSAGE_CACHE_VERSION = 1;
const MESSAGE_CACHE_PREFIX = "politicall:attendance:messages";
const MESSAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_CACHED_MESSAGES = 250;

interface Props {
  conversation: AttConversation;
  onClose?: () => void;
  onOpenContact?: () => void;
}

type CachedConversationData = { messages: AttMessage[]; notes?: any[] };

function normalizeCachePart(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9+@._-]/g, "");
}

function conversationCacheKeys(conversation: AttConversation) {
  const keys = new Set<string>();
  keys.add(`${MESSAGE_CACHE_PREFIX}:conversation:${conversation.id}`);

  const contactId = normalizeCachePart((conversation as any).contactId);
  const phone = normalizeCachePart(conversation.contactPhone);
  const externalThreadId = normalizeCachePart(conversation.externalThreadId);
  const attendanceCode = normalizeCachePart(conversation.attendanceCode ?? conversation.protocol);

  if (contactId) keys.add(`${MESSAGE_CACHE_PREFIX}:contact:${contactId}`);
  if (phone) keys.add(`${MESSAGE_CACHE_PREFIX}:phone:${phone}`);
  if (externalThreadId) keys.add(`${MESSAGE_CACHE_PREFIX}:thread:${externalThreadId}`);
  if (attendanceCode) keys.add(`${MESSAGE_CACHE_PREFIX}:code:${attendanceCode}`);

  return Array.from(keys);
}

function readCachedConversation(conversation: AttConversation): CachedConversationData | undefined {
  if (typeof window === "undefined") return undefined;

  for (const key of conversationCacheKeys(conversation)) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      let parsed = JSON.parse(raw) as { version?: number; savedAt?: number; data?: CachedConversationData; ref?: string };
      const refKey = parsed.ref;
      if (parsed.ref) {
        const referenced = window.localStorage.getItem(parsed.ref);
        if (!referenced) {
          window.localStorage.removeItem(key);
          continue;
        }
        parsed = JSON.parse(referenced);
      }
      if (parsed.version !== MESSAGE_CACHE_VERSION || !parsed.savedAt || !parsed.data?.messages) continue;
      if (Date.now() - parsed.savedAt > MESSAGE_CACHE_TTL_MS) {
        window.localStorage.removeItem(key);
        if (refKey) window.localStorage.removeItem(refKey);
        continue;
      }
      return parsed.data;
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return undefined;
}

function writeCachedConversation(conversation: AttConversation, data?: CachedConversationData) {
  if (typeof window === "undefined" || !data?.messages) return;

  const cacheData: CachedConversationData = {
    ...data,
    messages: data.messages.slice(-MAX_CACHED_MESSAGES),
  };
  const payload = JSON.stringify({
    version: MESSAGE_CACHE_VERSION,
    savedAt: Date.now(),
    data: cacheData,
  });
  const [primaryKey, ...aliasKeys] = conversationCacheKeys(conversation);
  const aliasPayload = JSON.stringify({
    version: MESSAGE_CACHE_VERSION,
    savedAt: Date.now(),
    ref: primaryKey,
  });

  try {
    window.localStorage.setItem(primaryKey, payload);
    for (const key of aliasKeys) {
      window.localStorage.setItem(key, aliasPayload);
    }
  } catch {
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(MESSAGE_CACHE_PREFIX)) window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(primaryKey, payload);
    } catch {
      // If storage is full or blocked, the chat still works from the API.
    }
  }
}

export default function ChatPanel({ conversation, onClose, onOpenContact }: Props) {
  const [message, setMessage] = useState("");
  const [isWhisper, setIsWhisper] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>(conversation.tags ?? []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const currentUser = getAuthUser();
  const { data: labels = [] } = useAttendanceLabels();

  const { data: convData, isLoading, isFetching } = useQuery<(AttConversation & { messages: AttMessage[]; notes?: any[] }) | CachedConversationData>({
    queryKey: ["/api/attendance/conversations", conversation.id],
    refetchInterval: 10000,
    refetchOnMount: "always",
    initialData: () => readCachedConversation(conversation),
  });

  const { data: quickReplies = [] } = useQuery<QuickReply[]>({
    queryKey: ["/api/attendance/quick-replies"],
  });

  const liveConversation = { ...conversation, ...(convData ?? {}) } as AttConversation & { messages?: AttMessage[]; notes?: any[] };
  const messages = liveConversation.messages ?? [];
  const status = STATUS_META[liveConversation.status] ?? { label: liveConversation.status, className: "bg-muted text-muted-foreground border-border" };
  const isResolved = ["resolved", "closed", "finalized"].includes(liveConversation.status);
  const isAssignedToMe = liveConversation.assignedUserId === currentUser?.id;
  const canReplyAny = Boolean((currentUser?.permissions as any)?.attendanceReplyAny);
  const hasAssignee = Boolean(liveConversation.assignedUserId);
  const canWrite = !isResolved && (isAssignedToMe || canReplyAny);
  const liveTagsKey = (liveConversation.tags ?? []).join("|");
  const initials = (liveConversation.contactName ?? liveConversation.contactPhone ?? "?")
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    setTagDraft(liveConversation.tags ?? []);
  }, [liveConversation.id, liveTagsKey]);

  const filteredQuickReplies = useMemo(() => {
    const term = quickSearch.trim().toLowerCase();
    if (!term) return quickReplies;
    return quickReplies.filter(reply =>
      reply.title.toLowerCase().includes(term) || reply.message.toLowerCase().includes(term)
    );
  }, [quickReplies, quickSearch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    writeCachedConversation(liveConversation, { messages, notes: liveConversation.notes });
  }, [liveConversation.id, liveConversation.contactPhone, liveConversation.externalThreadId, liveConversation.attendanceCode, liveConversation.protocol, messages, liveConversation.notes]);

  const invalidateConversation = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", conversation.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
  };

  const sendMutation = useMutation({
    mutationFn: async (body: { message: string; isWhisper?: boolean; tempId: string }) => {
      const response = await apiRequest("POST", `/api/attendance/conversations/${conversation.id}/send`, {
        message: body.message,
        isWhisper: body.isWhisper,
      });
      return response.json() as Promise<AttMessage>;
    },
    onMutate: async (body) => {
      const tempMessage: AttMessage = {
        id: body.tempId,
        accountId: (liveConversation as any).accountId ?? "",
        conversationId: conversation.id,
        contactId: liveConversation.contactId ?? null,
        userId: currentUser?.id ?? null,
        direction: body.isWhisper ? "internal" : "outbound",
        channel: liveConversation.channel,
        provider: liveConversation.provider,
        externalMessageId: null,
        body: body.message,
        messageType: body.isWhisper ? "whisper" : "text",
        status: "sent",
        errorMessage: null,
        aiGenerated: false,
        mediaUrl: null,
        mimeType: null,
        metadata: { optimistic: true },
        createdAt: new Date(),
      } as any;

      queryClient.setQueryData<any>(["/api/attendance/conversations", conversation.id], (old: any) => {
        const base = old ?? { ...liveConversation, messages: [] };
        const existing = Array.isArray(base.messages) ? base.messages : [];
        if (existing.some((item: AttMessage) => item.id === tempMessage.id)) return base;
        return { ...base, messages: [...existing, tempMessage] };
      });

      return { tempId: body.tempId };
    },
    onSuccess: (saved, _body, context) => {
      queryClient.setQueryData<any>(["/api/attendance/conversations", conversation.id], (old: any) => {
        if (!old?.messages) return old;
        const byId = new Map<string, AttMessage>();
        for (const item of old.messages.map((item: AttMessage) => item.id === context?.tempId ? saved : item)) {
          byId.set(item.id, item);
        }
        return {
          ...old,
          messages: Array.from(byId.values()),
        };
      });
      invalidateConversation();
    },
    onError: (e: any, _body, context) => {
      queryClient.setQueryData<any>(["/api/attendance/conversations", conversation.id], (old: any) => {
        if (!old?.messages) return old;
        return {
          ...old,
          messages: old.messages.map((item: AttMessage) => item.id === context?.tempId ? { ...item, status: "failed", errorMessage: e.message } : item),
        };
      });
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversation.id}/close`, {}),
    onSuccess: () => {
      invalidateConversation();
      toast({ title: "Conversa encerrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversation.id}/reopen`, {}),
    onSuccess: () => {
      invalidateConversation();
      toast({ title: "Conversa reaberta" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const assumeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/attendance/conversations/${conversation.id}/assume`, {});
      return response.json() as Promise<AttConversation>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<any>(["/api/attendance/conversations", conversation.id], (old: any) => ({ ...(old ?? {}), ...updated }));
      queryClient.setQueriesData<AttConversation[]>({ queryKey: ["/api/attendance/conversations"] }, (old) =>
        Array.isArray(old) ? old.map(item => item.id === updated.id ? { ...item, ...updated } : item) : old
      );
      invalidateConversation();
      toast({ title: "Atendimento assumido" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const protocolMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/attendance/conversations/${conversation.id}/protocol`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateConversation();
      toast({ title: `Protocolo gerado: ${data.protocol}` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const releaseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversation.id}/release`, {}),
    onSuccess: () => {
      invalidateConversation();
      toast({ title: "Atendimento liberado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversation.id}/pause`, {}),
    onSuccess: () => {
      invalidateConversation();
      toast({ title: "Atendimento pausado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const flagsMutation = useMutation({
    mutationFn: (flags: Record<string, boolean>) => apiRequest("PATCH", `/api/attendance/conversations/${conversation.id}/flags`, flags),
    onSuccess: invalidateConversation,
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversation.id}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/archived"] });
      onClose?.();
      toast({ title: "Atendimento arquivado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const tagsMutation = useMutation({
    mutationFn: (tags: string[]) => apiRequest("PATCH", `/api/attendance/conversations/${liveConversation.id}/labels`, { tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", liveConversation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/contacts"] });
      setShowTagDialog(false);
      toast({ title: "Etiquetas atualizadas" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar etiquetas", description: e.message, variant: "destructive" }),
  });

  const handleSend = () => {
    const text = message.trim();
    if (!canWrite || !text) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessage("");
    sendMutation.mutate({ message: text, isWhisper, tempId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const applyQuickReply = (reply: QuickReply) => {
    setMessage(reply.message);
    setShowQuickReplies(false);
    setQuickSearch("");
  };

  let previousDay = "";

  return (
    <div className="flex h-full flex-col bg-background" data-testid="panel-chat">
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenContact}
            disabled={!onOpenContact}
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-default"
            title="Detalhes do contato"
            data-testid="button-open-contact-details"
          >
            <Avatar className="h-10 w-10 border border-border bg-muted">
              <AvatarImage src={liveConversation.contactAvatar ?? ""} />
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
          </button>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {liveConversation.contactName ?? liveConversation.contactPhone ?? "Contato sem nome"}
              </p>
              <Badge variant="outline" className={cn("h-5 rounded px-1.5 text-[10px] font-semibold", status.className)}>
                {status.label}
              </Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {liveConversation.contactPhone ?? liveConversation.channel}
              </span>
              <span>{liveConversation.attendanceCode ?? liveConversation.protocol ?? liveConversation.id}</span>
              <span className="font-medium text-primary">{liveConversation.mode === "manual" ? "Manual" : "Automático"}</span>
              {liveConversation.tags?.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ borderColor: labelColor(labels, tag), backgroundColor: `${labelColor(labels, tag)}22`, color: labelColor(labels, tag) }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5"
            onClick={() => setShowTagDialog(true)}
            title="Editar etiquetas"
            data-testid="button-edit-conversation-tags"
          >
            <Tags className="h-4 w-4" />
            Etiquetas
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={invalidateConversation}
            title="Atualizar conversa"
            data-testid="button-refresh-chat"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>

          {!isResolved && !hasAssignee ? (
            <Button size="sm" variant="outline" onClick={() => assumeMutation.mutate()} disabled={assumeMutation.isPending} data-testid="button-assume-conversation">
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Assumir
            </Button>
          ) : null}

          {!isResolved ? (
            <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} data-testid="button-close-conversation">
              Finalizar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending} data-testid="button-reopen-conversation">
              Reabrir
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" data-testid="button-conversation-menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowTransferDialog(true)}>
                <ArrowRight className="mr-2 h-4 w-4" /> Transferir
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending}>
                <UserPlus className="mr-2 h-4 w-4" /> Liberar atendimento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
                <PauseCircle className="mr-2 h-4 w-4" /> Pausar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => protocolMutation.mutate()} disabled={protocolMutation.isPending}>
                <FileText className="mr-2 h-4 w-4" /> Gerar protocolo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => flagsMutation.mutate({ pinned: true })}>
                <Pin className="mr-2 h-4 w-4" /> Fixar conversa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => flagsMutation.mutate({ favorite: true })}>
                <Star className="mr-2 h-4 w-4" /> Favoritar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
                <Archive className="mr-2 h-4 w-4" /> Arquivar
              </DropdownMenuItem>
              {onClose ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClose}>
                    <X className="mr-2 h-4 w-4" /> Fechar painel
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5"
        data-testid="area-messages"
        style={{
          backgroundColor: "hsl(var(--accent) / 0.22)",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.14) 1px, transparent 0), repeating-linear-gradient(135deg, transparent 0 18px, hsl(var(--primary) / 0.035) 18px 20px, transparent 20px 38px)",
          backgroundSize: "22px 22px, 38px 38px",
        }}
      >
        {isLoading ? (
          <div className="mx-auto max-w-4xl space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className={cn("h-16 rounded-md", i % 2 === 0 ? "w-80" : "w-64")} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-2">
            {messages.map(msg => {
              const day = format(new Date(msg.createdAt), "dd/MM/yyyy", { locale: ptBR });
              const showDay = day !== previousDay;
              previousDay = day;
              return (
                <Fragment key={msg.id}>
                  {showDay ? (
                    <div className="my-2 flex justify-center">
                      <span className="rounded bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                        {day}
                      </span>
                    </div>
                  ) : null}
                  <MessageBubble message={msg} />
                </Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showQuickReplies ? (
        <div className="max-h-60 flex-shrink-0 overflow-y-auto border-t border-border bg-background/95 backdrop-blur" data-testid="panel-quick-replies">
          <div className="sticky top-0 border-b border-border bg-background p-2">
            <Input
              placeholder="Buscar resposta rápida"
              value={quickSearch}
              onChange={e => setQuickSearch(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-quick-reply-search"
              autoFocus
            />
          </div>
          {filteredQuickReplies.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma resposta encontrada</p>
          ) : (
            filteredQuickReplies.map(reply => (
              <button
                key={reply.id}
                type="button"
                data-testid={`item-quick-reply-${reply.id}`}
                onClick={() => applyQuickReply(reply)}
                className="w-full border-b border-border/50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent"
              >
                <p className="text-xs font-semibold text-foreground">{reply.title}</p>
                <p className="truncate text-xs text-muted-foreground">{reply.message}</p>
              </button>
            ))
          )}
        </div>
      ) : null}

      {!isResolved ? (
        <div className={cn("flex-shrink-0 border-t border-border bg-background px-3 py-2", isWhisper && "bg-yellow-50/60 dark:bg-yellow-950/10")}>
          {!canWrite ? (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {hasAssignee ? "Atendimento bloqueado para o responsável atual." : "Assuma o atendimento para responder."}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="flex items-center gap-1 pb-1">
              <Button
                type="button"
                size="icon"
                variant={isWhisper ? "secondary" : "ghost"}
                className={cn("h-9 w-9 rounded-full", isWhisper && "text-yellow-700 dark:text-yellow-300")}
                onClick={() => setIsWhisper(value => !value)}
                disabled={!canWrite}
                data-testid="toggle-whisper"
                title="Nota interna"
              >
                <Lock className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" disabled={!canWrite} title="Anexar arquivo">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setShowQuickReplies(value => !value)} disabled={!canWrite} data-testid="button-quick-replies" title="Respostas rápidas">
                <Zap className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-[44px] flex-1 rounded-md border border-input bg-background px-2 py-1 shadow-sm">
              <Textarea
                data-testid="input-message"
                placeholder={isWhisper ? "Nota interna para a equipe" : "Digite sua mensagem"}
                className="min-h-[34px] max-h-32 resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!canWrite}
                rows={1}
              />
              <div className="flex items-center justify-between px-1 pb-1">
                <span className={cn("text-[10px] font-medium", isWhisper ? "text-yellow-700 dark:text-yellow-300" : "text-muted-foreground")}>
                  {isWhisper ? "Nota interna" : canWrite ? "Mensagem pública" : "Somente leitura"}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Smile className="h-3.5 w-3.5" />
                  <Mic className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="icon"
              className="mb-1 h-10 w-10 rounded-full"
              onClick={handleSend}
              disabled={!canWrite || !message.trim() }
              data-testid="button-send-message"
              title="Enviar"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <TransferDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        conversationId={conversation.id}
      />
      <Dialog open={showTagDialog} onOpenChange={value => !value && setShowTagDialog(false)}>
        <DialogContent data-testid="dialog-conversation-tags">
          <DialogHeader>
            <DialogTitle>Etiquetas do atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Selecione as etiquetas criadas em Configuracoes. Elas tambem ficam vinculadas ao contato.
            </p>
            <TagSelector selected={tagDraft} onChange={setTagDraft} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagDialog(false)}>Cancelar</Button>
            <Button onClick={() => tagsMutation.mutate(tagDraft)} disabled={tagsMutation.isPending} data-testid="button-save-conversation-tags">
              Salvar etiquetas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({ message }: { message: AttMessage }) {
  const isOut = message.direction === "outbound";
  const isInternal = message.direction === "internal";
  const isSystem = isSystemMessage(message);
  const author = getMessageAuthor(message);

  if (isSystem) {
    return (
      <div className="my-1.5 flex justify-center" data-testid={`msg-${message.id}`}>
        <div className="max-w-[min(34rem,90%)] rounded-md border border-border/70 bg-background/80 px-4 py-2 text-center text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{systemMessageText(message)}</p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground/80">
            {format(new Date(message.createdAt), "dd/MM/yyyy - HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
    );
  }

  if (isInternal) {
    return (
      <div className="flex justify-center" data-testid={`msg-${message.id}`}>
        <div className="flex max-w-3xl items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50/95 px-3 py-2 text-sm text-yellow-950 shadow-sm dark:border-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-100">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-yellow-700 dark:text-yellow-300" />
          <div>
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
            <p className="mt-1 text-[10px] text-yellow-700/80 dark:text-yellow-300/80">
              {format(new Date(message.createdAt), "dd/MM/yyyy, HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0", isOut ? "justify-end" : "justify-start")} data-testid={`msg-${message.id}`}>
      <div
        className={cn(
          "min-w-0 max-w-[calc(100%_-_2rem)] overflow-hidden rounded-md border px-3 py-2 text-sm shadow-sm sm:max-w-[82%] xl:max-w-[72%]",
          isOut
            ? "rounded-br-sm border-primary/15 bg-primary/15 text-foreground"
            : "rounded-bl-sm border-border bg-background text-foreground",
        )}
      >
        {author ? (
          <p className={cn("mb-1 flex items-center gap-1 text-xs font-semibold", isOut ? "text-primary" : "text-foreground")}>
            {author.isBot ? <Bot className="h-3.5 w-3.5" /> : null}
            {author.label}
          </p>
        ) : null}
        <MessageMedia message={message} />
        {message.body ? <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{message.body}</p> : null}
        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", isOut ? "text-primary/80" : "text-muted-foreground")}>
          <span>{format(new Date(message.createdAt), "HH:mm", { locale: ptBR })}</span>
          {isOut && message.status === "read" ? <CheckCheck className="h-3 w-3" /> : null}
          {message.aiGenerated ? <Bot className="h-3 w-3" /> : null}
        </div>
      </div>
    </div>
  );
}

function isSystemMessage(message: AttMessage) {
  const metadata = (message.metadata as any) ?? {};
  const remote = metadata.remote ?? {};
  const type = String(message.messageType ?? "").toLowerCase();
  const body = String(message.body ?? "").trim();

  if (type === "system" || type === "event") return true;
  if (remote.isSystemMessage || metadata.isSystemMessage) return true;

  return /^(chat|atendimento)\s+(iniciado|transferido|assumido|finalizado|encerrado|reaberto|pausado|liberado|criado)/i.test(body);
}

function systemMessageText(message: AttMessage) {
  const body = String(message.body ?? "").trim();
  if (body) return body;
  const action = String((message.metadata as any)?.action ?? "").trim();
  return action ? `Evento do atendimento: ${action}` : "Evento do atendimento";
}

function getMessageAuthor(message: AttMessage): { label: string; isBot: boolean } | null {
  const metadata = (message.metadata as any) ?? {};
  const remote = metadata.remote ?? {};
  const type = String(message.messageType ?? "").toLowerCase();

  if (message.aiGenerated || type === "bot" || remote.isBot || remote.sentByBot || remote.senderType === "bot") {
    return { label: "Chatbot", isBot: true };
  }

  const operatorName =
    metadata.operatorName ??
    metadata.userName ??
    remote.operatorName ??
    remote.userName ??
    remote.sentByName ??
    remote.senderName;

  if (message.direction === "outbound" && typeof operatorName === "string" && operatorName.trim()) {
    return { label: operatorName.trim(), isBot: false };
  }

  return null;
}

function MessageMedia({ message }: { message: AttMessage }) {
  if (message.mediaUrl) {
    if (message.mimeType?.startsWith("image/")) {
      return <img src={message.mediaUrl} alt="Anexo" className="mb-2 max-h-64 max-w-full rounded-md object-cover" />;
    }
    if (message.mimeType?.startsWith("video/")) {
      return <video src={message.mediaUrl} controls className="mb-2 max-h-72 max-w-full rounded-md" />;
    }
    if (message.mimeType?.startsWith("audio/")) {
      return <audio src={message.mediaUrl} controls className="mb-2 max-w-full" />;
    }
    return (
      <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 flex min-w-0 items-center gap-1 rounded bg-background/70 px-2 py-1 text-xs underline [overflow-wrap:anywhere]">
        <Paperclip className="h-3 w-3" /> Anexo
      </a>
    );
  }

  if (message.messageType === "location" && (message.metadata as any)?.location) {
    const location = (message.metadata as any).location;
    return (
      <a
        href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
        target="_blank"
        rel="noreferrer"
        className="mb-2 flex min-w-0 items-center gap-1 rounded bg-background/70 px-2 py-1 text-xs underline [overflow-wrap:anywhere]"
      >
        <ExternalLink className="h-3 w-3" /> Abrir localização
      </a>
    );
  }

  if (message.messageType === "contact" && Array.isArray((message.metadata as any)?.contacts)) {
    return (
      <div className="mb-2 space-y-1">
        {(message.metadata as any).contacts.map((contact: any, index: number) => (
          <div key={`${contact.number}-${index}`} className="rounded-md bg-background/70 px-2 py-1 text-xs">
            <span className="font-semibold">{contact.name}</span>
            <span className="ml-2 opacity-80">{contact.number}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function TransferDialog({ open, onClose, conversationId }: { open: boolean; onClose: () => void; conversationId: string }) {
  const { toast } = useToast();
  const [targetUserId, setTargetUserId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [reason, setReason] = useState("");

  const { data: sectors = [] } = useQuery<any[]>({
    queryKey: ["/api/attendance/sectors"],
    enabled: open,
  });

  const { data: queues = [] } = useQuery<any[]>({
    queryKey: ["/api/attendance/queues"],
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/attendance/conversations/${conversationId}/transfer`, {
      userId: targetUserId || undefined,
      sectorId: sectorId && sectorId !== "__none" ? sectorId : undefined,
      queueId: queueId && queueId !== "__none" ? queueId : undefined,
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      toast({ title: "Conversa transferida" });
      setTargetUserId("");
      setSectorId("");
      setQueueId("");
      setReason("");
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent data-testid="dialog-transfer">
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Setor de destino</label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger data-testid="select-transfer-sector">
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nenhum</SelectItem>
                {sectors.map((sector: any) => (
                  <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Fila de destino</label>
            <Select value={queueId} onValueChange={setQueueId}>
              <SelectTrigger data-testid="select-transfer-queue">
                <SelectValue placeholder="Selecione uma fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nenhuma</SelectItem>
                {queues.map((queue: any) => (
                  <SelectItem key={queue.id} value={queue.id}>{queue.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Atendente de destino</label>
            <Input
              value={targetUserId}
              onChange={event => setTargetUserId(event.target.value)}
              placeholder="ID do usuário"
              data-testid="input-transfer-user"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Motivo</label>
            <Input
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Motivo da transferência"
              data-testid="input-transfer-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-confirm-transfer">
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

