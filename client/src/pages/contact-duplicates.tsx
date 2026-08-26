import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, History, Loader2, RefreshCw, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { ContactMergeComparison } from "@/components/contacts/contact-merge-comparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface DuplicateContactView {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  interests?: string[] | null;
  [key: string]: unknown;
}

export interface DuplicateGroupView {
  id: string;
  confidence: "high" | "review";
  contacts: DuplicateContactView[];
  evidence: Array<{ kind: string; confidence: "high" | "review"; label: string }>;
}

export interface MergePreviewView {
  token: string;
  target: DuplicateContactView;
  sources: DuplicateContactView[];
  conflicts: Array<{ field: string; values: Record<string, unknown> }>;
  relationCounts: Record<string, number>;
}

export interface MergeEventView {
  id: string;
  sourceContactId: string;
  targetContactId: string;
  status: string;
  sourceSnapshot?: { name?: string };
  targetSnapshot?: { name?: string };
  createdAt?: string;
  revertedAt?: string | null;
}

type ContentProps =
  | { state: "loading" }
  | { state: "error"; onRetry(): void }
  | { state: "ready"; groups: DuplicateGroupView[]; events: MergeEventView[]; onReview(group: DuplicateGroupView): void; onRevert(event: MergeEventView): void };

function eventName(snapshot: { name?: string } | undefined, fallback: string): string {
  return snapshot?.name || fallback;
}

export function ContactDuplicatesContent(props: ContentProps) {
  if (props.state === "loading") return <div className="space-y-4 p-4 sm:p-6"><p className="sr-only">Carregando duplicidades</p><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (props.state === "error") return <div className="flex min-h-[60vh] items-center justify-center p-6 text-center"><div><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-3 text-xl font-semibold">Nao foi possivel analisar os eleitores</h1><Button className="mt-4" onClick={props.onRetry}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div></div>;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-3 sm:p-6">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2"><Link href="/contacts"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para eleitores</Link></Button>
          <h1 className="text-2xl font-semibold">Revisar duplicados</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Compare os cadastros e preserve todo o historico antes de mesclar.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Nenhum contato sera mesclado automaticamente</div>
      </header>

      <section aria-labelledby="pending-heading">
        <div className="mb-3 flex items-center justify-between"><div><h2 id="pending-heading" className="text-base font-semibold">Pendentes</h2><p className="text-sm text-muted-foreground">{props.groups.length} grupo(s) para revisao</p></div><Badge variant="secondary">{props.groups.length}</Badge></div>
        {props.groups.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center"><UsersRound className="mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-medium">Nenhuma duplicidade pendente</h3><p className="mt-1 text-sm text-muted-foreground">Os cadastros ativos nao apresentam correspondencias que exijam revisao.</p></div>
        ) : (
          <div className="divide-y rounded-md border bg-card">
            {props.groups.map((group) => (
              <article key={group.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">{group.evidence.map((evidence) => <Badge key={evidence.kind} variant={evidence.confidence === "high" ? "default" : "outline"}>{evidence.label}</Badge>)}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{group.contacts.map((contact) => <div key={contact.id} className="min-w-0 rounded-md bg-muted/40 px-3 py-2"><p className="truncate font-medium">{contact.name}</p><p className="truncate text-xs text-muted-foreground">{contact.email || contact.phone || "Sem contato informado"}</p><p className="truncate text-xs text-muted-foreground">{[contact.city, contact.state].filter(Boolean).join(" / ") || "Localidade nao informada"}</p></div>)}</div>
                </div>
                <Button variant="outline" onClick={() => props.onReview(group)}><UsersRound className="mr-2 h-4 w-4" />Revisar grupo</Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="history-heading" className="border-t pt-5">
        <div className="mb-3"><h2 id="history-heading" className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4" />Historico</h2><p className="text-sm text-muted-foreground">Ultimas mesclagens registradas nesta conta</p></div>
        {props.events.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma mesclagem registrada.</p> : <div className="divide-y rounded-md border bg-card">{props.events.map((event) => <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{eventName(event.sourceSnapshot, event.sourceContactId)} <span className="text-muted-foreground">para</span> {eventName(event.targetSnapshot, event.targetContactId)}</p><p className="mt-1 text-xs text-muted-foreground">{event.createdAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt)) : "Data indisponivel"}</p></div>{event.status === "completed" ? <Button variant="outline" size="sm" onClick={() => props.onRevert(event)}><RotateCcw className="mr-2 h-4 w-4" />Desfazer</Button> : <Badge variant="secondary">Revertida</Badge>}</div>)}</div>}
      </section>
    </div>
  );
}

export default function ContactDuplicatesPage() {
  const { toast } = useToast();
  const groupsQuery = useQuery<{ groups: DuplicateGroupView[] }>({ queryKey: ["/api/contacts/duplicates"] });
  const historyQuery = useQuery<{ events: MergeEventView[] }>({ queryKey: ["/api/contacts/merges"] });
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroupView | null>(null);
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<MergePreviewView | null>(null);
  const [resolvedContact, setResolvedContact] = useState<Record<string, unknown>>({});

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup || !targetId) throw new Error("Selecione o cadastro principal");
      const response = await apiRequest("POST", "/api/contacts/merge-preview", { sourceContactIds: selectedGroup.contacts.filter((contact) => contact.id !== targetId).map((contact) => contact.id), targetContactId: targetId });
      return response.json() as Promise<MergePreviewView>;
    },
    onSuccess: (result) => {
      setPreview(result);
      const values = Object.fromEntries(["name", "email", "phone", "city", "state", "interests"].map((field) => [field, result.target[field] ?? null]));
      values.interests = [...new Set([result.target, ...result.sources].flatMap((contact) => Array.isArray(contact.interests) ? contact.interests : []))];
      setResolvedContact(values);
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel comparar", description: error.message, variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup || !preview) throw new Error("Previa indisponivel");
      return apiRequest("POST", "/api/contacts/merge", { sourceContactIds: selectedGroup.contacts.filter((contact) => contact.id !== targetId).map((contact) => contact.id), targetContactId: targetId, previewToken: preview.token, resolvedContact });
    },
    onSuccess: async () => {
      setSelectedGroup(null); setPreview(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/contacts/duplicates"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/contacts/merges"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
      ]);
      toast({ title: "Eleitores mesclados", description: "O historico foi preservado e a operacao pode ser desfeita." });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel mesclar", description: error.message, variant: "destructive" }),
  });

  const revertMutation = useMutation({
    mutationFn: (event: MergeEventView) => apiRequest("POST", `/api/contacts/merges/${encodeURIComponent(event.id)}/revert`, {}),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["/api/contacts/duplicates"] }), queryClient.invalidateQueries({ queryKey: ["/api/contacts/merges"] }), queryClient.invalidateQueries({ queryKey: ["/api/contacts"] })]);
      toast({ title: "Mesclagem desfeita" });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel desfazer", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!selectedGroup) return;
    setTargetId(selectedGroup.contacts[0]?.id ?? "");
    setPreview(null);
    setResolvedContact({});
  }, [selectedGroup]);

  const loading = groupsQuery.isLoading || historyQuery.isLoading;
  const failed = groupsQuery.isError || historyQuery.isError;
  return <>
    {loading ? <ContactDuplicatesContent state="loading" /> : failed ? <ContactDuplicatesContent state="error" onRetry={() => { void groupsQuery.refetch(); void historyQuery.refetch(); }} /> : <ContactDuplicatesContent state="ready" groups={groupsQuery.data?.groups ?? []} events={historyQuery.data?.events ?? []} onReview={setSelectedGroup} onRevert={(event) => revertMutation.mutate(event)} />}
    <ContactMergeComparison open={Boolean(selectedGroup)} group={selectedGroup} targetId={targetId} preview={preview} resolvedContact={resolvedContact} loadingPreview={previewMutation.isPending} merging={mergeMutation.isPending} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }} onTargetChange={(id) => { setTargetId(id); setPreview(null); }} onPreview={() => previewMutation.mutate()} onResolve={(field, value) => setResolvedContact((current) => ({ ...current, [field]: value }))} onConfirm={() => mergeMutation.mutate()} />
  </>;
}
