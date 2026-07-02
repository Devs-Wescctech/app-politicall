import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type AdminIntegrationAccount = {
  id: string;
  name: string;
};

type IntegrationRecord = {
  id?: string;
  service: "whatsapp" | "sms" | "email";
  enabled?: boolean;
  whatsappToken?: string | null;
  whatsappPhoneNumber?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessAccountId?: string | null;
  whatsappWebhookUrl?: string | null;
  smsAccount?: string | null;
  smsCode?: string | null;
  smsClient?: string | null;
  smsEndpoint?: string | null;
  smsTipoEnvio?: string | null;
  locawebBaseUrl?: string | null;
  locawebAccountId?: string | null;
  locawebApiKey?: string | null;
  locawebAuthHeader?: string | null;
  locawebAuthScheme?: string | null;
};

type IntegrationService = "whatsapp" | "sms" | "email";

function adminToken() {
  return localStorage.getItem("admin_token") ?? "";
}

async function adminJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || text || response.statusText);
  return data as T;
}

function emptyIntegration(service: IntegrationService): IntegrationRecord {
  if (service === "whatsapp") {
    return {
      service,
      enabled: true,
      whatsappToken: "",
      whatsappPhoneNumber: "",
      whatsappPhoneNumberId: "",
      whatsappBusinessAccountId: "",
      whatsappWebhookUrl: "",
    };
  }
  if (service === "sms") {
    return {
      service,
      enabled: true,
      smsEndpoint: "http://integracao.oktor.com.br/integracao3.do",
      smsAccount: "",
      smsCode: "",
      smsClient: "",
      smsTipoEnvio: "7",
    };
  }
  return {
    service,
    enabled: true,
    locawebBaseUrl: "https://emailmarketing.locaweb.com.br/api/v1",
    locawebAccountId: "",
    locawebApiKey: "",
    locawebAuthHeader: "Authorization",
    locawebAuthScheme: "Bearer",
  };
}

function secretPlaceholder(value?: string | null) {
  return value === "***" ? "Configurado. Deixe em branco para manter." : "";
}

function IntegrationField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
}

function IntegrationStatus({ current }: { current?: IntegrationRecord | null }) {
  if (!current?.id) return <Badge variant="secondary">Nao configurado</Badge>;
  return current.enabled
    ? <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Ativo</Badge>
    : <Badge variant="secondary">Desativado</Badge>;
}

export default function AdminIntegrationsDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdminIntegrationAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [service, setService] = useState<IntegrationService>("whatsapp");
  const [drafts, setDrafts] = useState<Record<IntegrationService, IntegrationRecord>>({
    whatsapp: emptyIntegration("whatsapp"),
    sms: emptyIntegration("sms"),
    email: emptyIntegration("email"),
  });
  const { toast } = useToast();

  const enabled = open && !!account?.id;
  const queryKeyBase = account ? ["/api/admin/account-integrations", account.id] : ["/api/admin/account-integrations"];
  const { data: whatsapp } = useQuery<IntegrationRecord | null>({
    queryKey: [...queryKeyBase, "whatsapp"],
    enabled,
    queryFn: () => adminJson(`/api/admin/accounts/${account!.id}/integrations/whatsapp`),
  });
  const { data: sms } = useQuery<IntegrationRecord | null>({
    queryKey: [...queryKeyBase, "sms"],
    enabled,
    queryFn: () => adminJson(`/api/admin/accounts/${account!.id}/integrations/sms`),
  });
  const { data: email } = useQuery<IntegrationRecord | null>({
    queryKey: [...queryKeyBase, "email"],
    enabled,
    queryFn: () => adminJson(`/api/admin/accounts/${account!.id}/integrations/email`),
  });

  useEffect(() => {
    if (!open) return;
    setDrafts({
      whatsapp: { ...emptyIntegration("whatsapp"), ...(whatsapp ?? {}) },
      sms: { ...emptyIntegration("sms"), ...(sms ?? {}) },
      email: { ...emptyIntegration("email"), ...(email ?? {}) },
    });
  }, [open, whatsapp, sms, email]);

  const currentDraft = drafts[service];
  const currentStored = service === "whatsapp" ? whatsapp : service === "sms" ? sms : email;

  const updateDraft = (patch: Partial<IntegrationRecord>) => {
    setDrafts(current => ({ ...current, [service]: { ...current[service], ...patch } }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Empresa nao selecionada");
      return adminJson<IntegrationRecord>(`/api/admin/accounts/${account.id}/integrations/${service}`, {
        method: "PATCH",
        body: JSON.stringify({ ...currentDraft, service, enabled: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
      toast({ title: "Integracao salva" });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Empresa nao selecionada");
      return adminJson(`/api/admin/accounts/${account.id}/integrations/${service}/test`, {
        method: "POST",
        body: JSON.stringify(service === "sms" ? { action: "validate" } : {}),
      });
    },
    onSuccess: () => toast({ title: "Teste concluido", description: "A integracao respondeu corretamente." }),
    onError: (error: any) => toast({ title: "Falha no teste", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto" data-testid="dialog-admin-integrations">
        <DialogHeader>
          <DialogTitle>Integracoes da empresa</DialogTitle>
          <p className="text-sm text-muted-foreground">{account?.name ?? "Empresa"}</p>
        </DialogHeader>

        <Tabs value={service} onValueChange={value => setService(value as IntegrationService)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="whatsapp" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> WHU</TabsTrigger>
            <TabsTrigger value="sms" className="gap-1.5"><Send className="h-3.5 w-3.5" /> SMS</TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail</TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="mt-4 space-y-3">
            <IntegrationField label="Token WHU/WhatsApp" type="password" value={currentDraft.whatsappToken === "***" ? "" : currentDraft.whatsappToken} onChange={whatsappToken => updateDraft({ whatsappToken })} placeholder={secretPlaceholder(currentStored?.whatsappToken) || "Token do canal"} />
          </TabsContent>

          <TabsContent value="sms" className="mt-4 space-y-3">
            <IntegrationField label="Client / centro de custo" value={currentDraft.smsClient} onChange={smsClient => updateDraft({ smsClient })} placeholder="333" />
          </TabsContent>

          <TabsContent value="email" className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <IntegrationField label="Account ID Locaweb" value={currentDraft.locawebAccountId} onChange={locawebAccountId => updateDraft({ locawebAccountId })} placeholder="12345" />
              <IntegrationField label="API Key" type="password" value={currentDraft.locawebApiKey === "***" ? "" : currentDraft.locawebApiKey} onChange={locawebApiKey => updateDraft({ locawebApiKey })} placeholder={secretPlaceholder(currentStored?.locawebApiKey) || "Token da API"} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !currentStored?.id} data-testid="button-test-admin-integration">
            {testMutation.isPending ? "Testando..." : "Testar"}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-admin-integration">
            {saveMutation.isPending ? "Salvando..." : "Salvar integracao"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
