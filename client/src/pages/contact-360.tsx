import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CalendarDays, FileSignature, Megaphone, MessageSquareText, MessagesSquare, RefreshCw } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Contact360Response } from "@shared/contact-360";
import { Contact360Header } from "@/components/contacts/contact-360-header";
import { Contact360Summary } from "@/components/contacts/contact-360-summary";
import { Contact360Timeline, EmptyState, formatDate } from "@/components/contacts/contact-360-timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ContentProps =
  | { state: "loading" }
  | { state: "error"; onRetry: () => void }
  | { state: "success"; data: Contact360Response };

export function Contact360Content(props: ContentProps) {
  if (props.state === "loading") {
    return <div className="space-y-4 p-4 sm:p-6"><p className="sr-only">Carregando ficha do eleitor</p><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-80 w-full rounded-xl" /></div>;
  }
  if (props.state === "error") {
    return <div className="flex min-h-[60vh] items-center justify-center p-6"><div className="max-w-md text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-4 text-xl font-semibold">Nao foi possivel carregar a ficha</h1><p className="mt-2 text-sm text-muted-foreground">Verifique sua conexao e tente novamente.</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" asChild><Link href="/contacts"><ArrowLeft className="mr-2 h-4 w-4" />Eleitores</Link></Button><Button onClick={props.onRetry}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div></div></div>;
  }

  const { data } = props;
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-3 sm:p-5 lg:p-6">
      <Contact360Header contact={data.contact} visibility={data.visibility} />
      <Contact360Summary summary={data.summary} visibility={data.visibility} />
      <section className="min-w-0 rounded-xl border border-card-border bg-card p-3 shadow-sm sm:p-4">
        <Tabs defaultValue="timeline">
          <div className="overflow-x-auto pb-1"><TabsList className="w-max min-w-full justify-start"><TabsTrigger value="timeline">Linha do tempo</TabsTrigger>{data.visibility.demands && <TabsTrigger value="demands">Demandas</TabsTrigger>}{data.visibility.conversations && <TabsTrigger value="attendance">Atendimentos</TabsTrigger>}{data.visibility.events && <TabsTrigger value="events">Agenda</TabsTrigger>}{data.visibility.campaigns && <TabsTrigger value="campaigns">Campanhas</TabsTrigger>}{data.visibility.petitions && <TabsTrigger value="petitions">Peticoes</TabsTrigger>}</TabsList></div>
          <TabsContent value="timeline"><Contact360Timeline items={data.timeline} /></TabsContent>
          {data.visibility.demands && <TabsContent value="demands"><DomainList empty="Nenhuma demanda vinculada." items={data.demands.map((item) => ({ id: item.id, title: item.title, detail: item.protocol || item.priority || "Demanda", date: item.updatedAt, status: item.status, href: `/demands?demandId=${encodeURIComponent(item.id)}`, icon: MessageSquareText }))} /></TabsContent>}
          {data.visibility.conversations && <TabsContent value="attendance"><DomainList empty="Nenhum atendimento vinculado." items={data.conversations.map((item) => ({ id: item.id, title: item.attendanceCode ? `Atendimento ${item.attendanceCode}` : "Atendimento", detail: item.inboundLabel || item.summary || item.channel, date: item.lastMessageAt || item.createdAt, status: item.status, href: `/attendance?conversationId=${encodeURIComponent(item.id)}`, icon: MessagesSquare }))} /></TabsContent>}
          {data.visibility.events && <TabsContent value="events"><DomainList empty="Nenhum compromisso vinculado." items={data.events.map((item) => ({ id: item.id, title: item.title, detail: item.category || "Agenda", date: item.startDate, status: null, href: `/agenda?eventId=${encodeURIComponent(item.id)}`, icon: CalendarDays }))} /></TabsContent>}
          {data.visibility.campaigns && <TabsContent value="campaigns"><DomainList empty="Nenhuma campanha enviada para este eleitor." items={data.campaigns.map((item) => ({ id: item.id, title: item.campaignName, detail: item.channel, date: item.sentAt || item.createdAt, status: item.status, href: `/broadcasts/${encodeURIComponent(item.campaignId)}`, icon: Megaphone }))} /></TabsContent>}
          {data.visibility.petitions && <TabsContent value="petitions"><DomainList empty="Nenhuma peticao vinculada." items={data.petitions.map((item) => ({ id: item.id, title: item.petitionTitle, detail: "Assinatura registrada", date: item.createdAt, status: null, href: `/petitions?petitionId=${encodeURIComponent(item.petitionId)}`, icon: FileSignature }))} /></TabsContent>}
        </Tabs>
      </section>
    </div>
  );
}

type DomainItem = { id: string; title: string; detail: string; date: string | Date; status: string | null; href: string; icon: typeof CalendarDays };

function DomainList({ items, empty }: { items: DomainItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState text={empty} />;
  return <div className="divide-y rounded-lg border">{items.map(({ icon: Icon, ...item }) => <Link key={item.id} href={item.href} className="flex items-center gap-3 p-4 hover:bg-muted/40"><Icon className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.title}</p><p className="truncate text-sm text-muted-foreground">{item.detail}</p></div><div className="shrink-0 text-right"><p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>{item.status && <p className="mt-1 text-xs font-medium">{item.status}</p>}</div></Link>)}</div>;
}

export default function Contact360Page() {
  const [, params] = useRoute("/contacts/:id");
  const contactId = params?.id;
  const query = useQuery<Contact360Response>({ queryKey: ["/api/contacts", contactId, "360"], enabled: Boolean(contactId), retry: 1 });
  if (query.isLoading) return <Contact360Content state="loading" />;
  if (query.isError || !query.data) return <Contact360Content state="error" onRetry={() => void query.refetch()} />;
  return <Contact360Content state="success" data={query.data} />;
}
