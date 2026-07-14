import { useEffect, useReducer } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  TemplateVariable,
  TemplateVariableValues,
  WhatsAppTemplateLike,
} from "@shared/whatsapp-template-variables";
import {
  templateVariableExcerpt,
  templateVariableProgress,
  templateVariableValueError,
} from "@shared/campaign-template-message-layout";

type Props = {
  template: WhatsAppTemplateLike;
  templateKey: string;
  variables: TemplateVariable[];
  values: TemplateVariableValues;
  preview: string;
  sampleContactName: string;
  onValueChange: (key: string, value: string) => void;
};

type TouchedState = { templateKey: string; touched: Record<string, boolean> };
type TouchedAction =
  | { type: "field-touched"; templateKey: string; variableKey: string }
  | { type: "template-changed"; templateKey: string };

export function campaignTemplateTouchedReducer(state: TouchedState, action: TouchedAction): TouchedState {
  if (action.type === "template-changed") {
    return action.templateKey === state.templateKey
      ? state
      : { templateKey: action.templateKey, touched: {} };
  }
  if (action.templateKey !== state.templateKey) {
    return { templateKey: action.templateKey, touched: { [action.variableKey]: true } };
  }
  return { ...state, touched: { ...state.touched, [action.variableKey]: true } };
}

function CampaignTemplatePreview({ preview, sampleContactName }: Pick<Props, "preview" | "sampleContactName">) {
  return (
    <aside className="lg:sticky lg:top-0 lg:self-start" aria-label="Prévia da mensagem">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
          <Eye className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Prévia da mensagem</p>
            <p className="text-xs text-muted-foreground">Exemplo com {sampleContactName}</p>
          </div>
        </div>
        <div className="p-4">
          <div className="whitespace-pre-wrap rounded-lg rounded-tl-sm bg-primary/10 px-4 py-3 text-sm leading-relaxed" data-testid="text-preview-message">
            {preview || "Selecione e preencha um template para visualizar."}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function CampaignTemplateMessageLayout({
  template,
  templateKey,
  variables,
  values,
  preview,
  sampleContactName,
  onValueChange,
}: Props) {
  const [touchedState, dispatchTouched] = useReducer(campaignTemplateTouchedReducer, {
    templateKey,
    touched: {},
  });
  useEffect(() => {
    dispatchTouched({ type: "template-changed", templateKey });
  }, [templateKey]);
  const touched = touchedState.templateKey === templateKey ? touchedState.touched : {};
  const progress = templateVariableProgress(variables, values);

  if (variables.length === 0) {
    return (
      <div data-testid="campaign-template-layout">
        <CampaignTemplatePreview preview={preview} sampleContactName={sampleContactName} />
      </div>
    );
  }

  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]"
      data-testid="campaign-template-layout"
    >
      <section
        className="space-y-3"
        aria-labelledby="campaign-template-variables-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="campaign-template-variables-title"
              className="text-sm font-semibold"
            >
              Personalize o template
            </h3>
            <p className="text-xs text-muted-foreground">
              Preencha os dados que serão inseridos na mensagem aprovada.
            </p>
          </div>
          <Badge
            variant={progress.missing.length ? "secondary" : "default"}
            className="shrink-0"
          >
            {progress.missing.length ? (
              `${progress.completed} de ${progress.total}`
            ) : (
              <>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Completo
              </>
            )}
          </Badge>
        </div>

        <div className="space-y-2.5">
          {variables.map((variable) => {
            const value = values[variable.key] ?? "";
            const error = templateVariableValueError(value);
            const invalid = error !== null && (Boolean(touched[variable.key]) || Boolean(value.trim()));
            const errorId = `campaign-template-variable-error-${variable.key.replace(/[^a-z0-9]/gi, "-")}`;

            return (
              <div
                key={variable.key}
                className="rounded-lg border bg-card p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {`{{${variable.token}}}`}
                  </Badge>
                  <label
                    htmlFor={`campaign-template-variable-${variable.key}`}
                    className="text-sm font-medium"
                  >
                    {variable.label} <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                </div>
                <Input
                  id={`campaign-template-variable-${variable.key}`}
                  value={value}
                  onChange={(event) =>
                    onValueChange(variable.key, event.target.value)
                  }
                  onBlur={() => dispatchTouched({ type: "field-touched", templateKey, variableKey: variable.key })}
                  placeholder="Digite um texto ou use {nome}"
                  required
                  aria-required="true"
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                  data-testid={`input-campaign-template-variable-${variable.key}`}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Usado em: “{templateVariableExcerpt(template, variable)}”
                </p>
                {invalid ? (
                  <p id={errorId} className="mt-1 text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <CampaignTemplatePreview preview={preview} sampleContactName={sampleContactName} />
    </div>
  );
}
