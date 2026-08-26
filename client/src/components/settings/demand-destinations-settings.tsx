import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, LoaderCircle, Plus, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Destination = {
  id: string;
  name: string;
  kind: string;
  description?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  responseDeadlineHours: number;
  active: boolean;
};

export function DemandDestinationsSettings() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("external");
  const [hours, setHours] = useState("72");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const { data: items = [], isLoading, isError, refetch } = useQuery<Destination[]>({ queryKey: ["/api/demand-destinations"] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/demand-destinations"] });
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return items;
    return items.filter((item) => [item.name, item.description, item.contactName, item.email, item.phone]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [items, search]);
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demand-destinations", {
      name,
      kind,
      responseDeadlineHours: Number(hours),
      description: description || null,
      contactName: contactName || null,
      phone: phone || null,
      email: email || null,
      active: true,
    }),
    onSuccess: () => {
      setName(""); setDescription(""); setContactName(""); setPhone(""); setEmail("");
      refresh();
      toast({ title: "Destino adicionado" });
    },
    onError: (error: Error) => toast({ title: "Nao foi possivel adicionar", description: error.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiRequest("PATCH", `/api/demand-destinations/${id}`, { active }),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Nao foi possivel atualizar", description: error.message, variant: "destructive" }),
  });
  const changeActive = (item: Destination, active: boolean) => {
    if (!active && !window.confirm(`Inativar ${item.name}? Encaminhamentos existentes serao preservados.`)) return;
    toggle.mutate({ id: item.id, active });
  };

  return <section className="space-y-4" aria-label="Orgaos e setores">
    <div><h2 className="text-lg font-semibold">Orgaos e setores</h2><p className="text-sm text-muted-foreground">Destinos usados nos encaminhamentos de demandas.</p></div>
    <div className="space-y-3 rounded-md border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label htmlFor="destination-name">Nome</Label><Input id="destination-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Secretaria de Obras" /></div>
        <div><Label>Tipo</Label><Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="external">Orgao externo</SelectItem><SelectItem value="internal">Setor interno</SelectItem></SelectContent></Select></div>
        <div><Label htmlFor="destination-contact">Responsavel de contato</Label><Input id="destination-contact" value={contactName} onChange={(event) => setContactName(event.target.value)} /></div>
        <div><Label htmlFor="destination-hours">Prazo (horas)</Label><Input id="destination-hours" type="number" min="1" max="8760" value={hours} onChange={(event) => setHours(event.target.value)} /></div>
        <div><Label htmlFor="destination-phone">Telefone</Label><Input id="destination-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
        <div><Label htmlFor="destination-email">E-mail</Label><Input id="destination-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      </div>
      <div><Label htmlFor="destination-description">Descricao</Label><Textarea id="destination-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></div>
      <div className="flex justify-end"><Button disabled={name.trim().length < 2 || !Number.isInteger(Number(hours)) || Number(hours) < 1 || create.isPending} onClick={() => create.mutate()}><Plus className="mr-2 size-4" />Adicionar</Button></div>
    </div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Label htmlFor="destination-search" className="sr-only">Pesquisar destinos</Label><Input id="destination-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar destinos" /></div>
    {isLoading ? <div className="flex justify-center py-8"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Carregando destinos" /></div>
      : isError ? <div className="py-8 text-center"><p className="text-sm text-destructive">Nao foi possivel carregar os destinos.</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>
      : filteredItems.length === 0 ? <div className="py-8 text-center"><Building2 className="mx-auto size-7 text-muted-foreground" /><p className="mt-2">{search ? "Nenhum destino encontrado" : "Nenhum destino cadastrado"}</p></div>
      : <ul className="divide-y rounded-md border">{filteredItems.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 p-3"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.kind === "external" ? "Orgao externo" : "Setor interno"} · {item.responseDeadlineHours} horas</p>{item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}{(item.contactName || item.email || item.phone) && <p className="mt-1 text-xs text-muted-foreground">{[item.contactName, item.phone, item.email].filter(Boolean).join(" · ")}</p>}</div><div className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted-foreground">{item.active ? "Ativo" : "Inativo"}</span><Switch checked={item.active} disabled={toggle.isPending} onCheckedChange={(active) => changeActive(item, active)} aria-label={`${item.active ? "Inativar" : "Ativar"} ${item.name}`} /></div></li>)}</ul>}
  </section>;
}
