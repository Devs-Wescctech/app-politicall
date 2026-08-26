import { ArrowLeft, CalendarPlus, Mail, MapPin, MessageSquarePlus, MessagesSquare, Phone, UserRound } from "lucide-react";
import { Link } from "wouter";
import type { Contact360Response } from "@shared/contact-360";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Contact360Header({ contact, visibility }: { contact: Contact360Response["contact"]; visibility: Contact360Response["visibility"] }) {
  const location = [contact.neighborhood, contact.city, contact.state].filter(Boolean).join(", ");
  return (
    <header className="rounded-xl border border-card-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0" title="Voltar para eleitores">
            <Link href="/contacts"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-muted text-primary">
            <UserRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">Ficha 360 do eleitor</p>
            <h1 className="truncate text-2xl font-semibold text-foreground">{contact.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contact.interests?.map((interest) => <Badge key={interest} variant="outline">{interest}</Badge>)}
              {contact.source && <Badge variant="secondary">Origem: {contact.source}</Badge>}
            </div>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[430px]">
          <ContactLine icon={Mail} value={contact.email || "E-mail nao informado"} href={contact.email ? `mailto:${contact.email}` : undefined} />
          <ContactLine icon={Phone} value={contact.phone || "Telefone nao informado"} href={contact.phone ? `tel:${contact.phone}` : undefined} />
          <ContactLine icon={MapPin} value={location || "Localidade nao informada"} />
          <ContactLine icon={UserRound} value={[contact.gender, contact.age ? `${contact.age} anos` : null].filter(Boolean).join(" · ") || "Perfil nao informado"} />
        </div>
      </div>
      {contact.notes && <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">{contact.notes}</p>}
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4" aria-label="Acoes do eleitor">
        {visibility.demands && <Button asChild size="sm"><Link href={`/demands?new=1&contactId=${encodeURIComponent(contact.id)}`}><MessageSquarePlus className="mr-2 h-4 w-4" />Nova demanda</Link></Button>}
        {visibility.conversations && contact.phone && <Button asChild size="sm" variant="outline"><Link href={`/attendance?new=1&contactId=${encodeURIComponent(contact.id)}`}><MessagesSquare className="mr-2 h-4 w-4" />Novo atendimento</Link></Button>}
        {visibility.events && <Button asChild size="sm" variant="outline"><Link href={`/agenda?new=1&contactId=${encodeURIComponent(contact.id)}`}><CalendarPlus className="mr-2 h-4 w-4" />Agendar retorno</Link></Button>}
      </div>
    </header>
  );
}

function ContactLine({ icon: Icon, value, href }: { icon: typeof Mail; value: string; href?: string }) {
  const content = <><Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{value}</span></>;
  return href
    ? <a href={href} className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted">{content}</a>
    : <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2">{content}</div>;
}
