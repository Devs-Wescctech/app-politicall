import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildWhatsAppTemplateComponents,
  createEmptyTemplateVariableValues,
  extractWhatsAppTemplateVariables,
  renderWhatsAppTemplatePreview,
  validateTemplateVariableValues,
  type TemplateVariableValues,
  type WhatsAppTemplateLike,
} from "@shared/whatsapp-template-variables";

export type VariableTemplate = WhatsAppTemplateLike & {
  id: string;
  name: string;
  title?: string;
  language?: string;
  source?: string;
};

export type TemplateVariableConfirmation = {
  values: TemplateVariableValues;
  components: any[];
  preview: string;
};

type EditorProps = {
  template: VariableTemplate;
  values: TemplateVariableValues;
  onChange: (values: TemplateVariableValues) => void;
};

export function TemplateVariableEditor({ template, values, onChange }: EditorProps) {
  const variables = useMemo(() => extractWhatsAppTemplateVariables(template), [template]);
  const preview = useMemo(() => renderWhatsAppTemplatePreview(template, values), [template, values]);

  return (
    <div className="space-y-4" data-testid="template-variable-editor">
      {variables.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Preencha todas as variáveis. O template não será enviado com campos como {"{{1}}"}.</p>
          </div>
          {variables.map(variable => (
            <div key={variable.key} className="space-y-1.5">
              <label htmlFor={`template-variable-${variable.key}`} className="text-sm font-medium">
                {variable.label} <span className="text-destructive">*</span>
              </label>
              <Input
                id={`template-variable-${variable.key}`}
                value={values[variable.key] ?? ""}
                onChange={event => onChange({ ...values, [variable.key]: event.target.value })}
                placeholder={variable.placeholder}
                required
                data-testid={`input-template-variable-${variable.key}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Este template não possui variáveis obrigatórias.</p>
      )}

      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          Prévia final
        </div>
        <p className="whitespace-pre-wrap text-sm" data-testid="text-template-variable-preview">{preview || template.name}</p>
      </div>
    </div>
  );
}

type DialogProps = {
  template: VariableTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (confirmation: TemplateVariableConfirmation) => void;
  isPending?: boolean;
  confirmLabel?: string;
};

export default function TemplateVariableDialog({
  template,
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  confirmLabel = "Enviar template",
}: DialogProps) {
  const variables = useMemo(() => template ? extractWhatsAppTemplateVariables(template) : [], [template]);
  const [values, setValues] = useState<TemplateVariableValues>({});

  useEffect(() => {
    setValues(createEmptyTemplateVariableValues(variables));
  }, [template?.id, open]);

  if (!template) return null;
  const validation = validateTemplateVariableValues(variables, values);

  const confirm = () => {
    if (!validation.valid) return;
    onConfirm({
      values,
      components: buildWhatsAppTemplateComponents(template, values),
      preview: renderWhatsAppTemplatePreview(template, values),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="dialog-template-variables">
        <DialogHeader>
          <DialogTitle>Revisar template: {template.title ?? template.name}</DialogTitle>
        </DialogHeader>
        <TemplateVariableEditor template={template} values={values} onChange={setValues} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={!validation.valid || isPending} data-testid="button-confirm-template-variables">
            {isPending ? "Enviando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
