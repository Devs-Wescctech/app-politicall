import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Upload, ListChecks, Pencil, Search, CheckCircle2, AlertCircle, Copy, Plus, Tag, ChevronDown, MapPin, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { normalizeBrazilPhone, normalizePhoneList } from "@shared/phone";
import { countRecipients, normalizeRecipientsText, parseRecipients } from "@shared/recipients";
import type { AudienceFilters } from "@shared/schema";

type CampaignLite = { id: string; name: string };
type ContactList = { id: string; name: string; kind: string; description?: string | null };

type PreviewSample = { id?: string; name: string; phone: string | null; email: string | null; city: string | null; state: string | null };
type Preview = { total: number; withPhone: number; withEmail: number; sample: PreviewSample[] };

type ImportContact = {
  name: string; phone: string; email: string; city: string; neighborhood: string;
  state: string; gender: string; age: number | null; interests: string[]; validPhone: boolean; validEmail: boolean;
};
type ImportResult = {
  valid: ImportContact[];
  invalid: { contact: ImportContact; reason: string }[];
  duplicates: ImportContact[];
  stats: { total: number; valid: number; invalid: number; duplicates: number };
};

const IMPORT_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "__ignore__", label: "Ignorar" },
  { value: "name", label: "Nome" },
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "city", label: "Cidade" },
  { value: "neighborhood", label: "Bairro" },
  { value: "state", label: "Estado" },
  { value: "gender", label: "Gênero" },
  { value: "age", label: "Idade" },
  { value: "interests", label: "Interesses/Etiquetas" },
];

// upload helper (apiRequest forces JSON, so files need a raw fetch)
async function uploadImport(url: string, form: FormData): Promise<any> {
  const token = getAuthToken();
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    try { throw new Error(JSON.parse(text).error || text); } catch (e: any) { throw new Error(e.message || text); }
  }
  return res.json();
}

function splitList(value: string): string[] {
  return value.split(/[,;]+/).map((v) => v.trim()).filter(Boolean);
}

export function RecipientSource({
  channel,
  value,
  onChange,
  campaigns,
}: {
  channel: string;
  value: string;
  onChange: (value: string) => void;
  campaigns: CampaignLite[];
}) {
  const { toast } = useToast();

  // Split by NEWLINE only so "telefone;nome" lines stay intact.
  const existing = () => value.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const applyRecipients = (list: string[], mode: "append" | "replace") => {
    const base = mode === "replace" ? [] : existing();
    const merged = Array.from(new Set([...base, ...list]));
    onChange(merged.join("\n"));
    toast({ title: "Destinatários adicionados", description: `${list.length} adicionado(s). Total: ${merged.length}.` });
  };

  const count = countRecipients(value, channel);
  const invalidLines = channel === "email" ? [] : parseRecipients(value, channel).invalidLines;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>Destinatários</Label>
        <Badge variant="secondary" data-testid="badge-recipient-count">{count} selecionado(s)</Badge>
      </div>
      <Tabs defaultValue="manual">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="manual" data-testid="tab-recipients-manual"><Pencil className="w-3.5 h-3.5 mr-1" />Manual</TabsTrigger>
          <TabsTrigger value="segment" data-testid="tab-recipients-segment"><Users className="w-3.5 h-3.5 mr-1" />Segmentar</TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-recipients-import"><Upload className="w-3.5 h-3.5 mr-1" />Importar</TabsTrigger>
          <TabsTrigger value="lists" data-testid="tab-recipients-lists"><ListChecks className="w-3.5 h-3.5 mr-1" />Listas</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="pt-3">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={channel === "email" ? "email@exemplo.com\nemail2@exemplo.com" : "+5511999999999;Maria\n+5511988888888;João"}
            rows={6}
            data-testid="textarea-campaign-recipients"
          />
          <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {channel === "email"
                ? "Um e-mail por linha."
                : "Use um por linha. Para incluir nome, use: telefone;nome"}
            </p>
            {channel !== "email" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const normalized = normalizeRecipientsText(value, channel);
                  if (!normalized.trim()) {
                    toast({ title: "Nada a formatar", description: "Adicione números primeiro.", variant: "destructive" });
                    return;
                  }
                  onChange(normalized);
                  toast({ title: "Números formatados", description: `${countRecipients(normalized, channel)} número(s) com +55.` });
                }}
                data-testid="button-add-ddi"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />Adicionar +55
              </Button>
            )}
          </div>
          {invalidLines.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10 p-2.5 mt-2" data-testid="warning-invalid-lines">
              <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                Algumas linhas não parecem telefone. Corrija ou use telefone;nome.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="segment" className="pt-3">
          <SegmentTab channel={channel} campaigns={campaigns} onApply={applyRecipients} />
        </TabsContent>

        <TabsContent value="import" className="pt-3">
          <ImportTab channel={channel} onApply={applyRecipients} />
        </TabsContent>

        <TabsContent value="lists" className="pt-3">
          <ListsTab channel={channel} currentFilters={null} onApply={applyRecipients} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------
function SegmentTab({
  channel,
  campaigns,
  onApply,
}: {
  channel: string;
  campaigns: CampaignLite[];
  onApply: (list: string[], mode: "append" | "replace") => void;
}) {
  const { toast } = useToast();
  const [cities, setCities] = useState("");
  const [neighborhoods, setNeighborhoods] = useState("");
  const [states, setStates] = useState("");
  const [genders, setGenders] = useState("");
  const [tags, setTags] = useState("");
  const [sources, setSources] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [importedOnly, setImportedOnly] = useState(false);
  const [originChannels, setOriginChannels] = useState("");
  const [attendanceStatuses, setAttendanceStatuses] = useState("");
  const [responded, setResponded] = useState<string>("any");
  const [previousCampaignId, setPreviousCampaignId] = useState<string>("none");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: tagData } = useQuery<{ tags: string[] }>({ queryKey: ["/api/campaigns/audience/tags"] });
  const availableTags = tagData?.tags ?? [];
  const selectedTags = splitList(tags);
  const isTagSelected = (t: string) => selectedTags.some((x) => x.toLowerCase() === t.toLowerCase());
  const toggleTag = (t: string) => {
    const cur = splitList(tags);
    const exists = cur.some((x) => x.toLowerCase() === t.toLowerCase());
    const next = exists ? cur.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...cur, t];
    setTags(next.join(", "));
  };

  const buildFilters = (): AudienceFilters => {
    const f: AudienceFilters = {};
    if (cities.trim()) f.cities = splitList(cities);
    if (neighborhoods.trim()) f.neighborhoods = splitList(neighborhoods);
    if (states.trim()) f.states = splitList(states);
    if (genders.trim()) f.genders = splitList(genders);
    if (tags.trim()) f.tags = splitList(tags);
    if (sources.trim()) f.sources = splitList(sources);
    if (ageMin.trim()) f.ageMin = parseInt(ageMin, 10);
    if (ageMax.trim()) f.ageMax = parseInt(ageMax, 10);
    if (importedOnly) f.importedOnly = true;
    if (originChannels.trim()) f.originChannels = splitList(originChannels);
    if (attendanceStatuses.trim()) f.attendanceStatuses = splitList(attendanceStatuses);
    if (responded === "yes") f.responded = true;
    if (responded === "no") f.responded = false;
    if (previousCampaignId !== "none") f.previousCampaignId = previousCampaignId;
    return f;
  };

  const runPreview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/campaigns/audience/preview", { filters: buildFilters() });
      setPreview(await res.json());
    } catch (err: any) {
      toast({ title: "Erro ao pré-visualizar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const useAudience = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/campaigns/audience/resolve", { filters: buildFilters(), channel });
      const data = await res.json();
      if (!data.recipients?.length) {
        toast({ title: "Nenhum destinatário", description: "Os filtros não retornaram contatos alcançáveis neste canal.", variant: "destructive" });
        return;
      }
      onApply(data.recipients, "append");
    } catch (err: any) {
      toast({ title: "Erro ao resolver audiência", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Monte sua audiência combinando os filtros abaixo. Separe vários valores por vírgula.
      </p>

      {/* Localização */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MapPin className="w-3.5 h-3.5" /> Localização
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterInput label="Cidade" value={cities} onChange={setCities} placeholder="São Paulo, Campinas" testid="input-filter-cities" />
          <FilterInput label="Bairro" value={neighborhoods} onChange={setNeighborhoods} placeholder="Centro" testid="input-filter-neighborhoods" />
          <FilterInput label="Estado (UF)" value={states} onChange={setStates} placeholder="SP, RJ" testid="input-filter-states" />
        </div>
      </div>

      {/* Dados do contato */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <UserCircle className="w-3.5 h-3.5" /> Dados do contato
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterInput label="Gênero" value={genders} onChange={setGenders} placeholder="masculino, feminino" testid="input-filter-genders" />
          <FilterInput label="Origem do contato" value={sources} onChange={setSources} placeholder="Evento, Indicação" testid="input-filter-sources" />
          <FilterInput label="Idade mínima" value={ageMin} onChange={setAgeMin} placeholder="18" testid="input-filter-agemin" type="number" />
          <FilterInput label="Idade máxima" value={ageMax} onChange={setAgeMax} placeholder="60" testid="input-filter-agemax" type="number" />
        </div>
      </div>

      {/* Etiquetas */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Tag className="w-3.5 h-3.5" /> Etiquetas / Interesse
        </div>
        {availableTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="tag-chips">
            {availableTags.map((t) => (
              <Badge
                key={t}
                variant={isTagSelected(t) ? "default" : "outline"}
                onClick={() => toggleTag(t)}
                className="cursor-pointer"
                data-testid={`chip-tag-${t}`}
              >
                {t}
              </Badge>
            ))}
          </div>
        )}
        <FilterInput label="" value={tags} onChange={setTags} placeholder="Digite etiquetas separadas por vírgula" testid="input-filter-tags" />
      </div>

      {/* Filtros avançados */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="w-full justify-between" data-testid="button-toggle-advanced">
            <span>Filtros avançados (atendimento e campanhas)</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <FilterInput label="Canal de atendimento" value={originChannels} onChange={setOriginChannels} placeholder="whatsapp, instagram" testid="input-filter-origin" />
            <FilterInput label="Status do atendimento" value={attendanceStatuses} onChange={setAttendanceStatuses} placeholder="open, closed" testid="input-filter-attendance-status" />
            <div className="space-y-1">
              <Label className="text-xs">Respondeu?</Label>
              <Select value={responded} onValueChange={setResponded}>
                <SelectTrigger data-testid="select-filter-responded"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer</SelectItem>
                  <SelectItem value="yes">Respondeu</SelectItem>
                  <SelectItem value="no">Não respondeu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Campanha anterior</Label>
              <Select value={previousCampaignId} onValueChange={setPreviousCampaignId}>
                <SelectTrigger data-testid="select-filter-previous-campaign"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="importedOnly" checked={importedOnly} onCheckedChange={(v) => setImportedOnly(!!v)} data-testid="checkbox-filter-imported" />
            <Label htmlFor="importedOnly" className="text-xs font-normal">Apenas contatos importados</Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={loading} data-testid="button-preview-audience">
          <Search className="w-3.5 h-3.5 mr-1" />Pré-visualizar
        </Button>
        <Button type="button" size="sm" onClick={useAudience} disabled={loading} data-testid="button-use-audience">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Usar audiência
        </Button>
      </div>

      {preview && (
        <div className="rounded-md border p-3 space-y-2" data-testid="audience-preview">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="secondary">Total: {preview.total}</Badge>
            <Badge variant="secondary">Com telefone: {preview.withPhone}</Badge>
            <Badge variant="secondary">Com e-mail: {preview.withEmail}</Badge>
          </div>
          {preview.sample.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs space-y-1">
              {preview.sample.map((s, i) => (
                <div key={s.id ?? i} className="flex items-center justify-between gap-2 border-b pb-1" data-testid={`preview-row-${i}`}>
                  <span className="truncate">{s.name || "(sem nome)"}</span>
                  <span className="text-muted-foreground truncate">{channel === "email" ? s.email : s.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterInput({
  label, value, onChange, placeholder, testid, type,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; testid: string; type?: string;
}) {
  return (
    <div className="space-y-1">
      {label ? <Label className="text-xs">{label}</Label> : null}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} data-testid={testid} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
function ImportTab({
  channel,
  onApply,
}: {
  channel: string;
  onApply: (list: string[], mode: "append" | "replace") => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      let data: any;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        data = await uploadImport("/api/campaigns/import/analyze", fd);
      } else {
        const res = await apiRequest("POST", "/api/campaigns/import/analyze", { text });
        data = await res.json();
      }
      setHeaders(data.headers || []);
      setMapping(data.suggestedMapping || {});
      if (!data.headers?.length) {
        toast({ title: "Nada para importar", description: "Não encontramos colunas nos dados fornecidos.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao analisar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const process = async () => {
    setLoading(true);
    try {
      const cleanMapping: Record<string, string> = {};
      for (const [h, f] of Object.entries(mapping)) {
        if (f && f !== "__ignore__") cleanMapping[h] = f;
      }
      let data: ImportResult;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("mapping", JSON.stringify(cleanMapping));
        fd.append("channel", channel);
        data = await uploadImport("/api/campaigns/import/process", fd);
      } else {
        const res = await apiRequest("POST", "/api/campaigns/import/process", { text, mapping: cleanMapping, channel });
        data = await res.json();
      }
      setResult(data);
    } catch (err: any) {
      toast({ title: "Erro ao processar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const useValid = () => {
    if (!result) return;
    const list = result.valid
      .map((c) => {
        const id = channel === "email" ? c.email : normalizeBrazilPhone(c.phone);
        if (!id) return "";
        // Preserve the name so {nome} works for imported contacts.
        return c.name && c.name.trim() ? `${id};${c.name.trim()}` : id;
      })
      .filter(Boolean);
    if (!list.length) {
      toast({ title: "Nenhum válido", description: "Nenhum contato válido para este canal.", variant: "destructive" });
      return;
    }
    onApply(list, "append");
  };

  const copyInvalids = () => {
    if (!result) return;
    const lines = result.invalid.map((i) => `${i.contact.name}\t${i.contact.phone}\t${i.contact.email}\t${i.reason}`).join("\n");
    navigator.clipboard?.writeText(lines);
    toast({ title: "Copiado", description: "Contatos inválidos copiados para a área de transferência." });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Arquivo (CSV, XLSX, XLS, TXT)</Label>
        <Input
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setText(""); }}
          data-testid="input-import-file"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ou cole os dados</Label>
        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFile(null); }}
          placeholder={"nome;telefone;email\nJoão;11999999999;joao@ex.com"}
          rows={4}
          data-testid="textarea-import-paste"
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={analyze} disabled={loading || (!file && !text.trim())} data-testid="button-import-analyze">
        <Search className="w-3.5 h-3.5 mr-1" />Analisar
      </Button>

      {headers.length > 0 && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-xs font-medium">Mapeamento de colunas</p>
          <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
            {headers.map((h) => (
              <div key={h} className="space-y-1">
                <Label className="text-xs truncate">{h}</Label>
                <Select value={mapping[h] ?? "__ignore__"} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                  <SelectTrigger data-testid={`select-map-${h}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPORT_FIELD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" onClick={process} disabled={loading} data-testid="button-import-process">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Validar e deduplicar
          </Button>
        </div>
      )}

      {result && (
        <div className="rounded-md border p-3 space-y-2" data-testid="import-result">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="secondary">Total: {result.stats.total}</Badge>
            <Badge variant="default">Válidos: {result.stats.valid}</Badge>
            <Badge variant="outline">Duplicados: {result.stats.duplicates}</Badge>
            <Badge variant="destructive">Inválidos: {result.stats.invalid}</Badge>
          </div>
          {result.invalid.length > 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {result.invalid.length} contato(s) separado(s) por telefone/e-mail inválido.
              <Button type="button" variant="ghost" size="sm" onClick={copyInvalids} data-testid="button-copy-invalids">
                <Copy className="w-3 h-3 mr-1" />Copiar inválidos
              </Button>
            </div>
          )}
          <Button type="button" size="sm" onClick={useValid} disabled={result.stats.valid === 0} data-testid="button-use-valid">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Usar {result.stats.valid} válido(s)
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved lists
// ---------------------------------------------------------------------------
function ListsTab({
  channel,
  onApply,
}: {
  channel: string;
  currentFilters: AudienceFilters | null;
  onApply: (list: string[], mode: "append" | "replace") => void;
}) {
  const { toast } = useToast();
  const { data: lists = [] } = useQuery<ContactList[]>({ queryKey: ["/api/contact-lists"] });
  const [selectedId, setSelectedId] = useState<string>("");
  const [preview, setPreview] = useState<(Preview & { kind: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = async (id: string) => {
    setSelectedId(id);
    setPreview(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiRequest("GET", `/api/contact-lists/${id}/preview`);
      setPreview(await res.json());
    } catch (err: any) {
      toast({ title: "Erro ao carregar lista", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const useList = () => {
    if (!preview) return;
    const list = preview.sample
      .map((s) => (channel === "email" ? s.email : s.phone))
      .filter((x): x is string => !!x);
    if (!list.length) {
      toast({ title: "Lista vazia", description: "Nenhum destinatário alcançável para este canal na amostra.", variant: "destructive" });
      return;
    }
    if (preview.total > list.length) {
      toast({ title: "Amostra aplicada", description: `A pré-visualização mostra ${list.length} de ${preview.total}. Aplicando os visíveis.` });
    }
    onApply(list, "append");
  };

  return (
    <div className="space-y-3">
      {lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma lista salva ainda.</p>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">Selecione uma lista</Label>
          <Select value={selectedId} onValueChange={loadPreview}>
            <SelectTrigger data-testid="select-contact-list"><SelectValue placeholder="Escolha uma lista" /></SelectTrigger>
            <SelectContent>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name} ({l.kind === "dynamic" ? "dinâmica" : "fixa"})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {preview && (
        <div className="rounded-md border p-3 space-y-2" data-testid="list-preview">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="secondary">Total: {preview.total}</Badge>
            <Badge variant="secondary">Com telefone: {preview.withPhone}</Badge>
            <Badge variant="secondary">Com e-mail: {preview.withEmail}</Badge>
          </div>
          <Button type="button" size="sm" onClick={useList} disabled={loading} data-testid="button-use-list">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Usar lista
          </Button>
        </div>
      )}
    </div>
  );
}
