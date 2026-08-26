import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DuplicateGroupView, MergePreviewView } from "@/pages/contact-duplicates";

const relationLabels: Record<string, string> = {
  demands: "Demandas",
  events: "Agenda",
  conversations: "Atendimentos",
  messages: "Mensagens",
  campaignRecipients: "Destinatarios de campanhas",
  petitionSignatures: "Assinaturas de peticoes",
  contactListMembers: "Listas",
  contactLabels: "Etiquetas",
};

const fieldLabels: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  city: "Cidade",
  state: "Estado",
  interests: "Interesses",
};

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ") || "Nao informado";
  return String(value ?? "").trim() || "Nao informado";
}

export function ContactMergeComparison(props: {
  open: boolean;
  group: DuplicateGroupView | null;
  targetId: string;
  preview: MergePreviewView | null;
  resolvedContact: Record<string, unknown>;
  loadingPreview: boolean;
  merging: boolean;
  onOpenChange(open: boolean): void;
  onTargetChange(id: string): void;
  onPreview(): void;
  onResolve(field: string, value: unknown): void;
  onConfirm(): void;
}) {
  const contacts = props.group?.contacts ?? [];
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Revisar eleitores duplicados</DialogTitle>
          <DialogDescription>Escolha o cadastro principal e confira cada informacao antes de confirmar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          <section aria-labelledby="primary-contact-heading">
            <h2 id="primary-contact-heading" className="text-sm font-semibold">1. Cadastro principal</h2>
            <p className="mt-1 text-xs text-muted-foreground">O cadastro principal permanecera ativo. Os demais serao arquivados, nunca excluidos.</p>
            <RadioGroup value={props.targetId} onValueChange={props.onTargetChange} className="mt-3 grid gap-2 md:grid-cols-2">
              {contacts.map((contact) => (
                <Label key={contact.id} htmlFor={`target-${contact.id}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40">
                  <RadioGroupItem id={`target-${contact.id}`} value={contact.id} className="mt-1" />
                  <span className="min-w-0"><span className="block font-medium">{contact.name}</span><span className="block truncate text-xs text-muted-foreground">{contact.email || contact.phone || "Sem contato informado"}</span></span>
                </Label>
              ))}
            </RadioGroup>
          </section>

          {!props.preview ? (
            <div className="flex justify-end border-t pt-4">
              <Button onClick={props.onPreview} disabled={!props.targetId || props.loadingPreview}>
                {props.loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Comparar dados
              </Button>
            </div>
          ) : (
            <>
              <section aria-labelledby="conflicts-heading" className="border-t pt-4">
                <h2 id="conflicts-heading" className="text-sm font-semibold">2. Resolver informacoes</h2>
                {props.preview.conflicts.length === 0 ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nenhum campo conflitante.</p>
                ) : (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {props.preview.conflicts.map((conflict) => {
                      const baseOptions = Object.entries(conflict.values);
                      const combinedInterests = conflict.field === "interests"
                        ? [...new Set(baseOptions.flatMap(([, value]) => Array.isArray(value) ? value.map(String) : []))]
                        : null;
                      const options: Array<[string, unknown]> = combinedInterests?.length
                        ? [["__combined", combinedInterests], ...baseOptions]
                        : baseOptions;
                      const selectedContactId = options.find(([, value]) => JSON.stringify(value ?? null) === JSON.stringify(props.resolvedContact[conflict.field] ?? null))?.[0];
                      return <div key={conflict.field} className="space-y-1.5">
                        <Label>{fieldLabels[conflict.field] ?? conflict.field}</Label>
                        <Select value={selectedContactId} onValueChange={(contactId) => props.onResolve(conflict.field, contactId === "__combined" ? combinedInterests : conflict.values[contactId] ?? null)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {options.map(([contactId, value]) => (
                              <SelectItem key={`${conflict.field}-${contactId}`} value={contactId}>{contactId === "__combined" ? `Combinar: ${displayValue(value)}` : displayValue(value)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>;
                    })}
                  </div>
                )}
              </section>

              <section aria-labelledby="relations-heading" className="border-t pt-4">
                <h2 id="relations-heading" className="text-sm font-semibold">3. Historico preservado</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(props.preview.relationCounts).map(([name, total]) => (
                    <div key={name} className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{relationLabels[name] ?? name}</p><p className="mt-1 text-lg font-semibold tabular-nums">{total}</p></div>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Atendimentos de numeros de WhatsApp diferentes continuarao separados e manterao a conexao receptora registrada.</p>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button>
          {props.preview && <Button onClick={props.onConfirm} disabled={props.merging}>{props.merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar mesclagem</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
