import { useState, useCallback, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, ChevronRight, Phone, Mail, MessageSquare, AlertTriangle,
  DollarSign, Users, Send, Clock, Zap, Eye,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RecipientSource } from "@/components/recipient-source";
import { CampaignTemplateMessageLayout } from "@/components/campaign-template-message-layout";
import { recipientsToPayload, countRecipients, toRecipientRecords } from "@shared/recipients";
import type { MessageTemplate, CampaignTemplateConfig } from "@shared/schema";
import {
  TEMPLATE_VARIABLES, extractVariables, unknownVariables,
  renderTemplate, smsSegments, isBlankMessage, isWaTemplateUsable,
  waTemplateBlockReason, contactTemplateContext,
} from "@shared/templates";
import {
  extractWhatsAppTemplateVariables,
  renderWhatsAppTemplatePreview,
} from "@shared/whatsapp-template-variables";
import { prepareTemplatePreviewValues, templateVariableProgress } from "@shared/campaign-template-message-layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────
type WaTemplate = {
  id: string; name: string; language: string; category: string | null;
  status: string | null; usable: boolean; blockReason: string | null;
  bodyVariables: number[]; preview: string;
  components: any[];
  source?: "meta_graph" | "whu_action_card";
  connectionId?: string;
};
type CampaignLite = { id: string; name: string };
type ModuleStatus = Record<string, string>;
type WhatsappConnectionOption = {
  id: string; name: string; phoneNumber: string | null; provider: string; status: string;
  official: boolean; campaignType: "whatsapp" | "whatsapp_oficial"; label: string;
};

export const campaignSchema = z.object({
  name: z.string().min(3, "Nome deve ter ao menos 3 caracteres"),
  type: z.enum(["whatsapp", "whatsapp_oficial", "email", "sms"]),
  waConnectionId: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(5, "Mensagem deve ter ao menos 5 caracteres"),
  recipients: z.string().min(1, "Adicione ao menos um destinatário"),
  scheduleMode: z.enum(["manual", "agendar"]).default("manual"),
  scheduledFor: z.string().optional(),
  ratePerMinute: z.string().optional(),
  intervalSeconds: z.string().optional(),
  batchSize: z.string().optional(),
  maxRetries: z.string().optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  businessHoursOnly: z.boolean().default(false),
}).refine(
  (d) => d.scheduleMode !== "agendar" || (d.scheduledFor && !isNaN(new Date(d.scheduledFor).getTime())),
  { message: "Informe a data e hora do agendamento", path: ["scheduledFor"] },
);
export type CampaignForm = z.infer<typeof campaignSchema>;

type SendConfig = {
  waConnectionId?: string;
  ratePerMinute?: number; ratePerHour?: number; intervalMs?: number;
  batchSize?: number; maxRetries?: number;
  window?: { start?: string; end?: string; businessHoursOnly?: boolean; timezoneOffsetMinutes?: number };
};

function buildSendConfig(d: CampaignForm): SendConfig | null {
  const cfg: SendConfig = {};
  if ((d.type === "whatsapp" || d.type === "whatsapp_oficial") && d.waConnectionId) cfg.waConnectionId = d.waConnectionId;
  const rpm = d.ratePerMinute ? parseInt(d.ratePerMinute, 10) : NaN;
  const interval = d.intervalSeconds ? parseInt(d.intervalSeconds, 10) : NaN;
  const batch = d.batchSize ? parseInt(d.batchSize, 10) : NaN;
  const retries = d.maxRetries ? parseInt(d.maxRetries, 10) : NaN;
  if (!isNaN(rpm) && rpm > 0) cfg.ratePerMinute = rpm;
  if (!isNaN(interval) && interval > 0) cfg.intervalMs = interval * 1000;
  if (!isNaN(batch) && batch > 0) cfg.batchSize = batch;
  if (!isNaN(retries) && retries >= 0) cfg.maxRetries = retries;
  const win: NonNullable<SendConfig["window"]> = {};
  if (/^\d{2}:\d{2}$/.test(d.windowStart ?? "")) win.start = d.windowStart;
  if (/^\d{2}:\d{2}$/.test(d.windowEnd ?? "")) win.end = d.windowEnd;
  if (d.businessHoursOnly) win.businessHoursOnly = true;
  if (Object.keys(win).length > 0) { win.timezoneOffsetMinutes = -new Date().getTimezoneOffset(); cfg.window = win; }
  return Object.keys(cfg).length > 0 ? cfg : null;
}

const SAMPLE_CONTACT = { name: "Maria Silva", phone: "(11) 98888-0000", city: "São Paulo" };
const VARIABLE_HINTS: Record<string, string> = {
  nome: "Nome do contato", telefone: "Telefone do contato",
  cidade: "Cidade do contato", protocolo: "Protocolo", link: "Link",
};

// ─── SMS cost estimate (same formula as server) ───────────────────────────────
function estimateCost(message: string, recipientCount: number): { segments: number; perSms: number; total: number } {
  const sms = smsSegments(message);
  const perSms = sms.parts * 0.12;
  return { segments: sms.parts, perSms, total: recipientCount * perSms };
}

// ─── Variable chips ───────────────────────────────────────────────────────────
function VariableChips({ onInsert }: { onInsert: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEMPLATE_VARIABLES.map((v) => (
        <Badge key={v} variant="secondary" className="cursor-pointer"
          onClick={() => onInsert(`{${v}}`)} data-testid={`chip-var-${v}`} title={VARIABLE_HINTS[v]}>
          {`{${v}}`}
        </Badge>
      ))}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEP_LABELS = ["Dados", "Canal", "Público", "Mensagem", "Configurações", "Revisão"];
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto pb-1">
      {STEP_LABELS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-0 min-w-0">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0
                ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 border-2 border-primary text-primary" : "bg-muted text-muted-foreground"}`}
                data-testid={`step-indicator-${i}`}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-[10px] mt-0.5 whitespace-nowrap ${active ? "text-primary font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 w-6 mx-0.5 mb-4 shrink-0 ${done ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Channel card ─────────────────────────────────────────────────────────────
function ChannelCard({ value, label, description, icon: Icon, selected, allowed, onClick }: {
  value: string; label: string; description: string; icon: any;
  selected: boolean; allowed: boolean; onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={allowed ? 0 : -1}
      aria-disabled={!allowed}
      data-testid={`channel-card-${value}`}
      onClick={allowed ? onClick : undefined}
      onKeyDown={allowed ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      className={`rounded-md border p-4 flex items-start gap-3 transition-colors
        ${!allowed ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover-elevate"}
        ${selected ? "border-primary bg-primary/5" : "border-border"}
      `}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <div>
        <p className={`text-sm font-medium ${selected ? "text-primary" : ""}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {!allowed && <p className="text-xs text-destructive mt-0.5">Sem permissão</p>}
      </div>
      {selected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
    </div>
  );
}

// ─── Message Composer ─────────────────────────────────────────────────────────
export function MessageComposer({
  channel, message, subject, onMessageChange, onSubjectChange,
  waConnectionId, templateConfig, onTemplateConfigChange, onTemplateIdChange,
}: {
  channel: string; message: string; subject: string;
  waConnectionId?: string;
  onMessageChange: (v: string) => void; onSubjectChange: (v: string) => void;
  templateConfig: CampaignTemplateConfig | null;
  onTemplateConfigChange: (c: CampaignTemplateConfig | null) => void;
  onTemplateIdChange: (id: string | null) => void;
}) {
  const { toast } = useToast();
  const [useModel, setUseModel] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedWaName, setSelectedWaName] = useState("");
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const isWhatsappOficial = channel === "whatsapp_oficial";
  const isEmail = channel === "email";
  const isSms = channel === "sms";

  const { data: savedModels = [], isLoading: modelsLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates", channel],
    enabled: (isSms || isEmail) && useModel,
  });

  // Official WhatsApp templates only apply to the API Oficial channel.
  const { data: waData, isLoading: waLoading, error: waError } = useQuery<{ templates: WaTemplate[] }>({
    queryKey: [`/api/campaigns/whatsapp/templates?connectionId=${encodeURIComponent(waConnectionId ?? "")}`],
    enabled: isWhatsappOficial && Boolean(waConnectionId),
  });

  const waTemplates = waData?.templates ?? [];
  const selectedWa = waTemplates.find((t) => t.name === selectedWaName) ?? null;
  const waVariables = selectedWa ? extractWhatsAppTemplateVariables(selectedWa) : [];
  const configuredWaValues = templateConfig?.variables ?? {};
  const sampleWaValues = selectedWa
    ? prepareTemplatePreviewValues(
        waVariables,
        configuredWaValues,
        value => renderTemplate(value, contactTemplateContext(SAMPLE_CONTACT as any), { keepMissing: true }),
      )
    : {};
  const waPreview = selectedWa ? renderWhatsAppTemplatePreview(selectedWa, sampleWaValues) : "";
  const usedVars = extractVariables(message);
  const unknownVars = unknownVariables(message);
  const previewMessage = renderTemplate(message, contactTemplateContext(SAMPLE_CONTACT as any));
  const previewSubject = renderTemplate(subject, contactTemplateContext(SAMPLE_CONTACT as any));
  const sms = smsSegments(message);

  useEffect(() => {
    if (templateConfig?.waTemplateName && waTemplates.some(template => template.name === templateConfig.waTemplateName)) {
      setSelectedWaName(templateConfig.waTemplateName);
    }
  }, [templateConfig?.waTemplateName, waTemplates.length]);

  const insertToken = useCallback((token: string) => {
    const el = messageRef.current;
    if (!el) {
      onMessageChange(message + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    onMessageChange(next);
    // Restore focus and place the caret right after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }, [message, onMessageChange]);

  const applySavedModel = (id: string) => {
    setSelectedModelId(id);
    const m = savedModels.find((x) => x.id === id);
    if (m) {
      onMessageChange(m.body);
      if (isEmail && m.subject) onSubjectChange(m.subject);
      onTemplateIdChange(m.id);
    }
  };

  const saveAsModel = useMutation({
    mutationFn: () => apiRequest("POST", "/api/message-templates", { channel, name: `Modelo ${new Date().toLocaleDateString("pt-BR")}`, body: message, subject: subject || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/message-templates", channel] }); toast({ title: "Modelo salvo" }); },
    onError: (err: any) => toast({ title: "Erro ao salvar modelo", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {isWhatsappOficial && (
        <div className="space-y-2">
          <FormLabel>Template WhatsApp</FormLabel>
          {waLoading ? <Skeleton className="h-9 w-full" /> : waError ? (
            <p className="text-sm text-destructive">Erro ao carregar templates. Verifique a configuração.</p>
          ) : waTemplates.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10 p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
              <p className="text-sm text-yellow-700 dark:text-yellow-400">Nenhum template WhatsApp aprovado encontrado.</p>
            </div>
          ) : (
            <Select value={selectedWaName} onValueChange={(name) => {
              setSelectedWaName(name);
              const tmpl = waTemplates.find((t) => t.name === name);
              if (tmpl) {
                const variables = extractWhatsAppTemplateVariables(tmpl);
                onTemplateIdChange(tmpl.id);
                onTemplateConfigChange({
                  ...(templateConfig ?? {}),
                  waTemplateId: tmpl.id,
                  waTemplateName: tmpl.name,
                  waTemplateLanguage: tmpl.language,
                  waTemplateCategory: tmpl.category ?? undefined,
                  waTemplateStatus: tmpl.status ?? undefined,
                  waTemplateSource: tmpl.source,
                  waConnectionId: tmpl.connectionId,
                  waTemplatePreview: tmpl.preview,
                  waTemplateComponents: tmpl.components,
                  variables: Object.fromEntries(variables.map(variable => [variable.key, ""])),
                });
                if (isWaTemplateUsable(tmpl.status)) onMessageChange(tmpl.preview);
              }
            }}>
              <SelectTrigger data-testid="select-wa-template"><SelectValue placeholder="Selecione um template" /></SelectTrigger>
              <SelectContent>
                {waTemplates.map((t) => (
                  <SelectItem key={t.name} value={t.name} disabled={!t.usable}>
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      {!t.usable && <Badge variant="destructive" className="text-[10px]">Inválido</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedWa && !selectedWa.usable && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{waTemplateBlockReason(selectedWa.status) ?? "Template inválido ou rejeitado."}</p>
            </div>
          )}
          {selectedWa?.usable ? (
            <CampaignTemplateMessageLayout
              key={selectedWa.id || selectedWa.name}
              template={selectedWa}
              templateKey={selectedWa.id || selectedWa.name}
              variables={waVariables}
              values={configuredWaValues}
              preview={waPreview}
              sampleContactName={SAMPLE_CONTACT.name}
              onValueChange={(key, value) => onTemplateConfigChange({
                ...(templateConfig ?? {}),
                variables: { ...configuredWaValues, [key]: value },
              })}
            />
          ) : null}
        </div>
      )}

      {(isSms || isEmail) && (
        <div className="flex items-center justify-between gap-2 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Usar modelo salvo</p>
            <p className="text-xs text-muted-foreground">Reaproveite mensagens já criadas.</p>
          </div>
          <Switch checked={useModel} onCheckedChange={(v) => { setUseModel(v); if (!v) { setSelectedModelId(""); onTemplateIdChange(null); } }} data-testid="switch-use-model" />
        </div>
      )}

      {(isSms || isEmail) && useModel && (
        <div className="space-y-2">
          <FormLabel>Modelo</FormLabel>
          {modelsLoading ? <Skeleton className="h-9 w-full" /> : savedModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum modelo salvo para este canal.</p>
          ) : (
            <Select value={selectedModelId} onValueChange={applySavedModel}>
              <SelectTrigger data-testid="select-saved-model"><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
              <SelectContent>{savedModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}

      {isEmail && (
        <>
          <div className="space-y-2">
            <FormLabel>Assunto do e-mail</FormLabel>
            <Input placeholder="Assunto" value={subject} onChange={(e) => onSubjectChange(e.target.value)} data-testid="input-campaign-subject" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-2">
              <FormLabel>Nome do remetente</FormLabel>
              <Input placeholder="Ex: Gabinete do Vereador" value={templateConfig?.fromName ?? ""} onChange={(e) => onTemplateConfigChange({ ...(templateConfig ?? {}), fromName: e.target.value })} data-testid="input-from-name" />
            </div>
            <div className="space-y-2">
              <FormLabel>E-mail do remetente</FormLabel>
              <Input type="email" placeholder="contato@dominio.com" value={templateConfig?.fromEmail ?? ""} onChange={(e) => onTemplateConfigChange({ ...(templateConfig ?? {}), fromEmail: e.target.value })} data-testid="input-from-email" />
            </div>
          </div>
        </>
      )}

      {!selectedWa ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <FormLabel>Mensagem</FormLabel>
              <Button type="button" size="sm" variant="outline" onClick={() => saveAsModel.mutate()} disabled={saveAsModel.isPending || isBlankMessage(message)} data-testid="button-save-model">
                {saveAsModel.isPending ? "Salvando..." : "Salvar como modelo"}
              </Button>
            </div>
            <VariableChips onInsert={insertToken} />
            <Textarea ref={messageRef} placeholder="Escreva a mensagem..." rows={5} value={message} onChange={(event) => onMessageChange(event.target.value)} data-testid="textarea-campaign-message" />
            {unknownVars.length > 0 ? <p className="text-xs text-destructive" data-testid="text-unknown-vars">Variáveis não suportadas: {unknownVars.map(value => `{${value}}`).join(", ")}</p> : null}
            {isSms ? <p className="text-xs text-muted-foreground" data-testid="text-sms-count">{sms.length} caracteres · {sms.parts} SMS ({sms.encoding})</p> : null}
          </div>
          <div className="rounded-md border p-3 space-y-1.5 bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Prévia — {SAMPLE_CONTACT.name}</p>
            </div>
            {isEmail && previewSubject ? <p className="text-sm font-medium" data-testid="text-preview-subject">Assunto: {previewSubject}</p> : null}
            <p className="text-sm whitespace-pre-wrap" data-testid="text-preview-message">{previewMessage || "—"}</p>
            {usedVars.length > 0 ? <p className="text-xs text-muted-foreground">Variáveis: {usedVars.map(value => `{${value}}`).join(", ")}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Review step ──────────────────────────────────────────────────────────────
function ReviewStep({ form, templateConfig, moduleStatus }: {
  form: ReturnType<typeof useForm<CampaignForm>>;
  templateConfig: CampaignTemplateConfig | null;
  moduleStatus: ModuleStatus;
}) {
  const data = form.getValues();
  const count = countRecipients(data.recipients, data.type);
  const isSms = data.type === "sms";
  const isWhatsappOficial = data.type === "whatsapp_oficial";
  const isWhatsapp = data.type === "whatsapp" || isWhatsappOficial;
  const isEmail = data.type === "email";
  const cost = isSms ? estimateCost(data.message, count) : null;
  const unknownVars = unknownVariables(data.message);
  const preview = renderTemplate(data.message, contactTemplateContext(SAMPLE_CONTACT as any));

  const channelStatus = isWhatsapp
    ? (moduleStatus[data.type] ?? moduleStatus["whatsapp"]) : isEmail
    ? moduleStatus["email"] : moduleStatus["sms"];
  const channelConfigured = channelStatus && channelStatus !== "not_configured";

  const CHANNEL_LABELS: Record<string, string> = { whatsapp: "WhatsApp", whatsapp_oficial: "WhatsApp API Oficial", email: "E-mail", sms: "SMS" };
  const ChannelIcon = isWhatsapp ? SiWhatsapp : isEmail ? Mail : Phone;

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Resumo</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{data.name}</span></div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Canal:</span>
            <ChannelIcon className="w-3.5 h-3.5" />
            <span className="font-medium">{CHANNEL_LABELS[data.type] ?? data.type}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Destinatários:</span>{" "}
            <span className={`font-medium ${count > 500 ? "text-yellow-600" : ""}`}>
              {count.toLocaleString("pt-BR")}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Envio:</span>{" "}
            <span className="font-medium">
              {data.scheduleMode === "agendar" && data.scheduledFor
                ? format(new Date(data.scheduledFor), "dd/MM/yyyy HH:mm", { locale: ptBR })
                : "Manual (rascunho)"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-md border p-4 space-y-2 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> Prévia da mensagem — {SAMPLE_CONTACT.name}
        </p>
        {isEmail && data.subject && <p className="text-sm font-medium">Assunto: {renderTemplate(data.subject, contactTemplateContext(SAMPLE_CONTACT as any))}</p>}
        <p className="text-sm whitespace-pre-wrap">{preview || "—"}</p>
      </div>

      {cost && (
        <div className="rounded-md border border-yellow-400/40 bg-yellow-50 dark:bg-yellow-900/10 p-4 space-y-1">
          <p className="text-sm font-medium flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400">
            <DollarSign className="w-4 h-4" /> Custo estimado SMS
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            {count} destinatários × {cost.segments} SMS/mensagem × R${cost.perSms.toFixed(2)}/SMS ={" "}
            <span className="font-semibold">R$ {cost.total.toFixed(2)}</span>
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-500">Estimativa baseada em R$0,12/SMS. Valores reais podem variar.</p>
        </div>
      )}

      {count > 500 && (
        <div className="rounded-md border border-orange-400/40 bg-orange-50 dark:bg-orange-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-700 dark:text-orange-400">
            Campanha grande: {count.toLocaleString("pt-BR")} destinatários. Use limites de envio para evitar bloqueios.
          </p>
        </div>
      )}

      {unknownVars.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">Variáveis não reconhecidas: {unknownVars.map((v) => `{${v}}`).join(", ")}</p>
        </div>
      )}

      {!channelConfigured && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Canal {CHANNEL_LABELS[data.type]} pode não estar configurado. Verifique as configurações antes de disparar.
          </p>
        </div>
      )}

      {templateConfig?.fromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(templateConfig.fromEmail) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">E-mail do remetente inválido.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
type EditCampaign = {
  id: string;
  name: string;
  type: string;
  subject?: string | null;
  message: string;
  recipients: unknown;
  scheduledFor?: string | null;
  templateId?: string | null;
  templateConfig?: CampaignTemplateConfig | null;
  sendConfig?: any;
};

type SubmitAction = "draft" | "schedule" | "send";

export function CampaignWizard({
  open, onClose, defaultType, allowedTypes, campaigns, moduleStatus, editCampaign,
}: {
  open: boolean;
  onClose: () => void;
  defaultType: string;
  allowedTypes: string[];
  campaigns: CampaignLite[];
  moduleStatus: ModuleStatus;
  editCampaign?: EditCampaign | null;
}) {
  const { toast } = useToast();
  const isEdit = !!editCampaign;
  const [step, setStep] = useState(0);
  const [templateConfig, setTemplateConfig] = useState<CampaignTemplateConfig | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastAction, setLastAction] = useState<SubmitAction>("draft");

  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "", type: defaultType as any, subject: "", message: "", recipients: "",
      waConnectionId: "",
      scheduleMode: "manual", scheduledFor: "", ratePerMinute: "", intervalSeconds: "",
      batchSize: "", maxRetries: "", windowStart: "", windowEnd: "", businessHoursOnly: false,
    },
  });

  const { data: waConnectionsData, isLoading: waConnectionsLoading, error: waConnectionsError } = useQuery<{ connections: WhatsappConnectionOption[] }>({
    queryKey: ["/api/campaigns/whatsapp/connections"],
    enabled: open,
  });
  const waConnections = (waConnectionsData?.connections ?? []).filter(connection => allowedTypes.includes(connection.campaignType));

  // Prefill the form when opening in edit mode; reset to blank for create mode.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSuccess(false);
    if (editCampaign) {
      // Rebuild the textarea preserving any stored names as "telefone;nome".
      const recips = Array.isArray(editCampaign.recipients)
        ? toRecipientRecords(editCampaign.recipients, editCampaign.type)
            .map((r) => (r.name ? `${r.recipient};${r.name}` : r.recipient))
            .join("\n")
        : "";
      const cfg = editCampaign.sendConfig ?? {};
      const win = cfg.window ?? {};
      form.reset({
        name: editCampaign.name ?? "",
        type: editCampaign.type as any,
        waConnectionId: cfg.waConnectionId ?? editCampaign.templateConfig?.waConnectionId ?? "",
        subject: editCampaign.subject ?? "",
        message: editCampaign.message ?? "",
        recipients: recips,
        scheduleMode: editCampaign.scheduledFor ? "agendar" : "manual",
        scheduledFor: editCampaign.scheduledFor
          ? format(new Date(editCampaign.scheduledFor), "yyyy-MM-dd'T'HH:mm")
          : "",
        ratePerMinute: cfg.ratePerMinute != null ? String(cfg.ratePerMinute) : "",
        intervalSeconds: cfg.intervalMs != null ? String(Math.round(cfg.intervalMs / 1000)) : "",
        batchSize: cfg.batchSize != null ? String(cfg.batchSize) : "",
        maxRetries: cfg.maxRetries != null ? String(cfg.maxRetries) : "",
        windowStart: win.start ?? "",
        windowEnd: win.end ?? "",
        businessHoursOnly: !!win.businessHoursOnly,
      });
      setTemplateConfig(editCampaign.templateConfig ?? null);
      setTemplateId(editCampaign.templateId ?? null);
    } else {
      form.reset({
        name: "", type: defaultType as any, subject: "", message: "", recipients: "",
        waConnectionId: "",
        scheduleMode: "manual", scheduledFor: "", ratePerMinute: "", intervalSeconds: "",
        batchSize: "", maxRetries: "", windowStart: "", windowEnd: "", businessHoursOnly: false,
      });
      setTemplateConfig(null);
      setTemplateId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCampaign]);

  const watchType = form.watch("type");
  const watchScheduleMode = form.watch("scheduleMode");
  const configuredCampaignTemplateVariables = templateConfig?.waTemplateName
    ? extractWhatsAppTemplateVariables({
      preview: templateConfig.waTemplatePreview,
      components: templateConfig.waTemplateComponents as any[],
    })
    : [];
  const campaignTemplateVariablesIncomplete = watchType === "whatsapp_oficial"
    && Boolean(templateConfig?.waTemplateName)
    && templateVariableProgress(configuredCampaignTemplateVariables, templateConfig?.variables ?? {}).missing.length > 0;

  const STEP_FIELDS: (keyof CampaignForm)[][] = [
    ["name"],
    ["type", "waConnectionId"],
    ["recipients"],
    ["message"],
    ["scheduledFor"],
    [],
  ];

  const handleClose = () => {
    form.reset();
    setTemplateConfig(null);
    setTemplateId(null);
    setStep(0);
    setSuccess(false);
    onClose();
  };

  const goNext = async () => {
    if (step === 1 && (watchType === "whatsapp" || watchType === "whatsapp_oficial") && !form.getValues("waConnectionId")) {
      toast({ title: "Selecione o número de envio", description: "Escolha uma conexão WhatsApp cadastrada para continuar.", variant: "destructive" });
      return;
    }
    if (step === 3 && campaignTemplateVariablesIncomplete) {
      toast({ title: "Variáveis obrigatórias", description: "Preencha todas as variáveis do template antes de continuar.", variant: "destructive" });
      return;
    }
    const fields = STEP_FIELDS[step];
    const valid = fields.length === 0 || await form.trigger(fields);
    if (!valid) return;
    setStep((s) => s + 1);
  };

  const goBack = () => setStep((s) => s - 1);

  const mutation = useMutation({
    mutationFn: async ({ data, action }: { data: CampaignForm; action: SubmitAction }) => {
      if (campaignTemplateVariablesIncomplete) {
        throw new Error("Preencha todas as variáveis obrigatórias do template WhatsApp");
      }
      const recipientsList = recipientsToPayload(data.recipients, data.type);
      if (data.type === "email" && templateConfig?.fromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(templateConfig.fromEmail)) {
        throw new Error("Informe um e-mail de remetente válido");
      }
      if (action === "schedule" && (!data.scheduledFor || isNaN(new Date(data.scheduledFor).getTime()))) {
        throw new Error("Informe a data e hora do agendamento");
      }
      const hasConfig = templateConfig && Object.values(templateConfig).some((v) => v != null && v !== "");
      const sendConfig = buildSendConfig(data);
      const payload = {
        name: data.name, type: data.type, subject: data.subject || null,
        message: data.message, recipients: recipientsList,
        templateId: templateId ?? null, templateConfig: hasConfig ? templateConfig : null, sendConfig,
      };
      let campaign;
      if (isEdit && editCampaign) {
        const res = await apiRequest("PATCH", `/api/campaigns/${editCampaign.id}`, payload);
        campaign = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/campaigns", { ...payload, status: "rascunho" });
        campaign = await res.json();
      }
      if (action === "schedule" && data.scheduledFor && campaign?.id) {
        await apiRequest("POST", `/api/campaigns/${campaign.id}/schedule`, {
          scheduledFor: new Date(data.scheduledFor).toISOString(), sendConfig,
        });
      } else if (action === "send" && campaign?.id) {
        await apiRequest("POST", `/api/campaigns/${campaign.id}/send`, {});
      }
      return campaign;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      const titles: Record<SubmitAction, string> = {
        draft: isEdit ? "Campanha atualizada" : "Rascunho salvo",
        schedule: "Campanha agendada",
        send: "Disparo iniciado",
      };
      const descriptions: Record<SubmitAction, string> = {
        draft: "Revise e dispare quando estiver pronto.",
        schedule: "O disparo ocorrerá automaticamente na data escolhida.",
        send: "O envio foi iniciado. Acompanhe o progresso na lista de campanhas.",
      };
      setLastAction(vars.action);
      toast({ title: titles[vars.action], description: descriptions[vars.action] });
      setSuccess(true);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar campanha", description: err.message, variant: "destructive" });
    },
  });

  const submitAction = (action: SubmitAction) =>
    form.handleSubmit((data) => mutation.mutate({ data, action }))();

  const recipientCount = countRecipients(form.watch("recipients"), watchType);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-campaign-wizard">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-lg">{isEdit ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
          {!success && <div className="mt-3"><StepIndicator step={step} /></div>}
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto flex-1 px-4 py-5 sm:px-6">
          {success ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10" data-testid="wizard-success">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold">
                  {lastAction === "send" ? "Disparo iniciado!" : lastAction === "schedule" ? "Campanha agendada!" : isEdit ? "Campanha atualizada!" : "Rascunho salvo!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lastAction === "send"
                    ? "O envio foi iniciado. Acompanhe o progresso na lista de campanhas."
                    : lastAction === "schedule"
                    ? "O disparo foi agendado automaticamente para a data escolhida."
                    : "Você pode disparar a campanha a qualquer momento."}
                </p>
              </div>
              <Button onClick={handleClose} data-testid="button-wizard-done">Fechar</Button>
            </div>
          ) : (
            <Form {...form}>
              <form id="wizard-form" onSubmit={(e) => e.preventDefault()} className="space-y-4">
                {/* Step 0: Dados */}
                {step === 0 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Dados da campanha</p>
                      <p className="text-sm text-muted-foreground">Dê um nome claro para identificar facilmente esta campanha.</p>
                    </div>
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da campanha</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Campanha de junho — SMS Eleitores" {...field} data-testid="input-campaign-name" autoFocus />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}

                {/* Step 1: Canal */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Canal de envio</p>
                      <p className="text-sm text-muted-foreground">Escolha como a mensagem será enviada aos destinatários.</p>
                    </div>
                    <FormField control={form.control} name="type" render={({ field }) => {
                      const waAllowed = allowedTypes.includes("whatsapp") || allowedTypes.includes("whatsapp_oficial");
                      const isWa = field.value === "whatsapp" || field.value === "whatsapp_oficial";
                      const selectWhatsappConnection = (connection: WhatsappConnectionOption) => {
                        field.onChange(connection.campaignType);
                        form.setValue("waConnectionId", connection.id, { shouldValidate: true });
                        setTemplateId(null);
                        setTemplateConfig(connection.official ? { waConnectionId: connection.id } : null);
                      };
                      return (
                      <FormItem>
                        <div className="space-y-2">
                          <ChannelCard value="whatsapp" label="WhatsApp" description="Envie pelo número conectado (normal ou API Oficial). Alta taxa de abertura." icon={SiWhatsapp} selected={isWa} allowed={waAllowed} onClick={() => { if (!isWa && waConnections[0]) selectWhatsappConnection(waConnections[0]); }} />
                          <ChannelCard value="email" label="E-mail" description="Ideal para comunicados formais e conteúdo rico." icon={Mail} selected={field.value === "email"} allowed={allowedTypes.includes("email")} onClick={() => { field.onChange("email"); form.setValue("waConnectionId", ""); }} />
                          <ChannelCard value="sms" label="SMS" description="Mensagem curta com alta taxa de leitura. Custo por envio." icon={Phone} selected={field.value === "sms"} allowed={allowedTypes.includes("sms")} onClick={() => { field.onChange("sms"); form.setValue("waConnectionId", ""); }} />
                        </div>
                        {isWa && (
                          <div className="space-y-2 rounded-md border p-3 mt-1" data-testid="wa-connection-picker">
                            <FormLabel>Número de envio</FormLabel>
                            <p className="text-xs text-muted-foreground">Escolha a conexão de WhatsApp usada para enviar esta campanha.</p>
                            {waConnectionsLoading ? <Skeleton className="h-9 w-full" /> : waConnectionsError ? (
                              <p className="text-sm text-destructive">Não foi possível carregar as conexões WhatsApp.</p>
                            ) : waConnections.length === 0 ? (
                              <p className="text-sm text-yellow-600">Nenhum número WhatsApp ativo foi encontrado.</p>
                            ) : <Select value={form.watch("waConnectionId") || undefined} onValueChange={(id) => {
                              const connection = waConnections.find(item => item.id === id);
                              if (connection) selectWhatsappConnection(connection);
                            }}>
                              <SelectTrigger data-testid="select-wa-connection"><SelectValue placeholder="Selecione o número de envio" /></SelectTrigger>
                              <SelectContent>
                                {waConnections.map(connection => <SelectItem key={connection.id} value={connection.id}>{connection.label}</SelectItem>)}
                              </SelectContent>
                            </Select>}
                            <p className="text-xs text-muted-foreground" data-testid="text-wa-connection-hint">
                              {field.value === "whatsapp_oficial"
                                ? "Envio com templates aprovados da API Oficial da Meta."
                                : "Envio de mensagem livre pelo número conectado."}
                            </p>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                      );
                    }} />
                  </div>
                )}

                {/* Step 2: Público */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Público</p>
                      <p className="text-sm text-muted-foreground">Selecione os destinatários da campanha.</p>
                    </div>
                    <FormField control={form.control} name="recipients" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RecipientSource channel={watchType} value={field.value} onChange={field.onChange} campaigns={campaigns} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {recipientCount > 0 && (
                      <Card>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">{recipientCount.toLocaleString("pt-BR")} destinatários selecionados</p>
                            {recipientCount > 500 && (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-500/40">Campanha grande</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Step 3: Mensagem */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Mensagem</p>
                      <p className="text-sm text-muted-foreground">Componha a mensagem que será enviada aos destinatários.</p>
                    </div>
                    <MessageComposer
                      channel={watchType}
                      waConnectionId={form.watch("waConnectionId")}
                      message={form.watch("message")}
                      subject={form.watch("subject") ?? ""}
                      onMessageChange={(v) => form.setValue("message", v, { shouldValidate: true })}
                      onSubjectChange={(v) => form.setValue("subject", v)}
                      templateConfig={templateConfig}
                      onTemplateConfigChange={setTemplateConfig}
                      onTemplateIdChange={setTemplateId}
                    />
                    <FormField control={form.control} name="message" render={() => <FormMessage />} />
                  </div>
                )}

                {/* Step 4: Configurações */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Agendamento e limites</p>
                      <p className="text-sm text-muted-foreground">Defina quando e como a campanha será disparada.</p>
                    </div>
                    <div className="rounded-md border p-4 space-y-4">
                      <p className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Agendamento</p>
                      <FormField control={form.control} name="scheduleMode" render={({ field }) => (
                        <FormItem>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger data-testid="select-schedule-mode"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="manual">Salvar como rascunho (disparo manual)</SelectItem>
                              <SelectItem value="agendar">Agendar disparo automático</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      {watchScheduleMode === "agendar" && (
                        <FormField control={form.control} name="scheduledFor" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data e hora</FormLabel>
                            <FormControl><Input type="datetime-local" {...field} data-testid="input-scheduled-for" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                    </div>
                    <div className="rounded-md border p-4 space-y-4">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2"><Zap className="w-4 h-4" /> Limites de envio</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Opcional. Controle o ritmo do disparo para evitar bloqueios.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { name: "ratePerMinute" as const, label: "Máx. por minuto", placeholder: "Ex: 30", type: "number" },
                          { name: "intervalSeconds" as const, label: "Intervalo (seg)", placeholder: "Ex: 2", type: "number" },
                          { name: "batchSize" as const, label: "Tamanho do lote", placeholder: "Ex: 50", type: "number" },
                          { name: "maxRetries" as const, label: "Máx. tentativas", placeholder: "Ex: 3", type: "number" },
                          { name: "windowStart" as const, label: "Início da janela", placeholder: "", type: "time" },
                          { name: "windowEnd" as const, label: "Fim da janela", placeholder: "", type: "time" },
                        ].map(({ name, label, placeholder, type }) => (
                          <FormField key={name} control={form.control} name={name} render={({ field }) => (
                            <FormItem>
                              <FormLabel>{label}</FormLabel>
                              <FormControl><Input type={type} placeholder={placeholder} {...field} data-testid={`input-${name}`} /></FormControl>
                            </FormItem>
                          )} />
                        ))}
                      </div>
                      <FormField control={form.control} name="businessHoursOnly" render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-3">
                          <FormLabel className="mb-0">Somente em dias úteis (seg–sex)</FormLabel>
                          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-business-hours" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                )}

                {/* Step 5: Revisão */}
                {step === 5 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold">Revisão final</p>
                      <p className="text-sm text-muted-foreground">Revise todos os dados antes de criar a campanha.</p>
                    </div>
                    <ReviewStep form={form} templateConfig={templateConfig} moduleStatus={moduleStatus} />
                  </div>
                )}
              </form>
            </Form>
          )}
        </div>

        {!success && (
          <DialogFooter className="px-6 py-4 border-t flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack} data-testid="button-wizard-back">
                  Voltar
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button type="button" variant="ghost" onClick={handleClose}>Cancelar</Button>
              {step < 5 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={step === 3 && campaignTemplateVariablesIncomplete}
                  data-testid="button-wizard-next"
                >
                  Próximo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending || campaignTemplateVariablesIncomplete}
                    data-testid="button-wizard-draft"
                    onClick={() => submitAction("draft")}
                  >
                    {isEdit ? "Salvar alterações" : "Salvar rascunho"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending || campaignTemplateVariablesIncomplete || !form.watch("scheduledFor")}
                    data-testid="button-wizard-schedule"
                    onClick={() => submitAction("schedule")}
                  >
                    <Clock className="w-4 h-4 mr-1.5" /> Agendar
                  </Button>
                  <Button
                    type="button"
                    disabled={mutation.isPending || campaignTemplateVariablesIncomplete}
                    data-testid="button-wizard-send"
                    onClick={() => submitAction("send")}
                  >
                    {mutation.isPending ? "Enviando..." : "Enviar agora"}
                    {!mutation.isPending && <Send className="w-4 h-4 ml-1.5" />}
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
