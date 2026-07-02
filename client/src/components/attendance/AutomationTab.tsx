import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { AttAutomation } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KeywordRule {
  keyword: string;
  response: string;
}

function getKeywordRules(value: unknown): KeywordRule[] {
  if (Array.isArray(value)) return value as KeywordRule[];
  if (value && typeof value === "object" && Array.isArray((value as any).rules)) return (value as any).rules as KeywordRule[];
  return [];
}

function getAutomationLabels(value: unknown) {
  if (value && typeof value === "object" && Array.isArray((value as any).labels)) return (value as any).labels;
  return [];
}

export default function AutomationTab() {
  const { toast } = useToast();

  const { data: automation, isLoading } = useQuery<AttAutomation>({
    queryKey: ["/api/attendance/automation-settings"],
  });

  const [form, setForm] = useState({
    welcomeEnabled: false,
    welcomeMessage: "",
    awayEnabled: false,
    awayMessage: "",
    inactivityEnabled: false,
    inactivityMinutes: 60,
    inactivityMessage: "",
  });
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);

  useEffect(() => {
    if (automation) {
      setForm({
        welcomeEnabled: automation.welcomeEnabled ?? false,
        welcomeMessage: automation.welcomeMessage ?? "",
        awayEnabled: automation.awayEnabled ?? false,
        awayMessage: automation.awayMessage ?? "",
        inactivityEnabled: automation.inactivityEnabled ?? false,
        inactivityMinutes: automation.inactivityMinutes ?? 60,
        inactivityMessage: automation.inactivityMessage ?? "",
      });
      setKeywordRules(getKeywordRules(automation.keywordRules));
    }
  }, [automation]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/attendance/automation-settings", {
      ...form,
      keywordRules: {
        rules: keywordRules,
        labels: getAutomationLabels(automation?.keywordRules),
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/automation-settings"] });
      toast({ title: "Automações salvas" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const addRule = () => setKeywordRules(r => [...r, { keyword: "", response: "" }]);
  const removeRule = (i: number) => setKeywordRules(r => r.filter((_, idx) => idx !== i));
  const updateRule = (i: number, field: keyof KeywordRule, value: string) =>
    setKeywordRules(r => r.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="tab-automation">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Automações de atendimento</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure respostas automáticas e regras por palavra-chave</p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-automation">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          Salvar
        </Button>
      </div>

      {/* Welcome */}
      <div className="rounded-md border border-border p-4 space-y-3" data-testid="section-welcome">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Mensagem de boas-vindas</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enviada automaticamente quando uma nova conversa é iniciada</p>
          </div>
          <Switch
            checked={form.welcomeEnabled}
            onCheckedChange={v => setForm(f => ({ ...f, welcomeEnabled: v }))}
            data-testid="switch-welcome"
          />
        </div>
        {form.welcomeEnabled && (
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: Olá! Seja bem-vindo(a). Como posso ajudar?"
            value={form.welcomeMessage}
            onChange={e => setForm(f => ({ ...f, welcomeMessage: e.target.value }))}
            data-testid="input-welcome-message"
          />
        )}
      </div>

      {/* Away */}
      <div className="rounded-md border border-border p-4 space-y-3" data-testid="section-away">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Mensagem fora do horário</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enviada quando o atendimento está fora do expediente</p>
          </div>
          <Switch
            checked={form.awayEnabled}
            onCheckedChange={v => setForm(f => ({ ...f, awayEnabled: v }))}
            data-testid="switch-away"
          />
        </div>
        {form.awayEnabled && (
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: Nosso atendimento funciona de segunda a sexta, das 8h às 18h."
            value={form.awayMessage}
            onChange={e => setForm(f => ({ ...f, awayMessage: e.target.value }))}
            data-testid="input-away-message"
          />
        )}
      </div>

      {/* Inactivity */}
      <div className="rounded-md border border-border p-4 space-y-3" data-testid="section-inactivity">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Mensagem de inatividade</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enviada ao cliente após período sem resposta</p>
          </div>
          <Switch
            checked={form.inactivityEnabled}
            onCheckedChange={v => setForm(f => ({ ...f, inactivityEnabled: v }))}
            data-testid="switch-inactivity"
          />
        </div>
        {form.inactivityEnabled && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tempo de inatividade (minutos)</label>
              <Input
                type="number"
                min={5}
                value={form.inactivityMinutes}
                onChange={e => setForm(f => ({ ...f, inactivityMinutes: parseInt(e.target.value) || 60 }))}
                className="w-28 h-8"
                data-testid="input-inactivity-minutes"
              />
            </div>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Percebemos que você não respondeu. Sua conversa será encerrada em breve."
              value={form.inactivityMessage}
              onChange={e => setForm(f => ({ ...f, inactivityMessage: e.target.value }))}
              data-testid="input-inactivity-message"
            />
          </div>
        )}
      </div>

      {/* Keyword rules */}
      <div data-testid="section-keyword-rules">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-foreground">Regras por palavra-chave</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resposta automática quando uma mensagem contém a palavra-chave</p>
          </div>
          <Button size="sm" variant="outline" onClick={addRule} data-testid="button-add-keyword-rule">
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
          </Button>
        </div>

        {keywordRules.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-md text-sm">
            Nenhuma regra criada
          </div>
        ) : (
          <div className="space-y-3">
            {keywordRules.map((rule, i) => (
              <div key={i} data-testid={`keyword-rule-${i}`} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Palavra-chave</label>
                    <Input
                      value={rule.keyword}
                      onChange={e => updateRule(i, "keyword", e.target.value)}
                      placeholder="Ex: cardápio, horário, preço"
                      className="h-8 text-sm"
                      data-testid={`input-keyword-${i}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="mt-5 flex-shrink-0"
                    onClick={() => removeRule(i)}
                    data-testid={`button-remove-rule-${i}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Resposta automática</label>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    value={rule.response}
                    onChange={e => updateRule(i, "response", e.target.value)}
                    placeholder="Mensagem de resposta automática..."
                    data-testid={`input-keyword-response-${i}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
