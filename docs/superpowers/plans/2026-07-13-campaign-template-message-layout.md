# Campaign Template Message Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the official WhatsApp campaign message step with responsive two-column editing, contextual required variables, a single scroll region, and a clear live preview.

**Architecture:** Keep template selection and form state in `MessageComposer`, move pure progress/excerpt/preview-value logic to a tested shared module, and move official-template presentation to a focused React component. Integrate the component without changing campaign API contracts or non-official channel behavior.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix UI, React Hook Form, Vitest, Vite.

## Global Constraints

- The approved Meta template body remains non-editable.
- Desktop uses two columns; small screens use one column.
- Header, stepper, and footer remain visible; only the dialog body scrolls.
- No additional runtime dependency.
- SMS, email, and normal WhatsApp behavior remains unchanged.
- Inputs expose labels, `aria-invalid`, and associated inline error text.
- The workspace has no Git repository; replace commit steps with explicit verification checkpoints and do not initialize Git.

## File Structure

- Create `shared/campaign-template-message-layout.ts`: pure progress, excerpt, and preview-value helpers.
- Create `shared/campaign-template-message-layout.test.ts`: unit coverage for all new pure behavior.
- Create `client/src/components/campaign-template-message-layout.tsx`: variable editor and official preview UI.
- Modify `client/src/components/campaign-wizard.tsx`: delegate official-template rendering and widen the dialog.
- Modify `Projetos/Politicall/03 - Alteracoes.md` in Obsidian after successful verification.

---

### Task 1: Pure template layout helpers

**Files:**
- Create: `shared/campaign-template-message-layout.ts`
- Test: `shared/campaign-template-message-layout.test.ts`

**Interfaces:**
- Consumes: `TemplateVariable`, `TemplateVariableValues`, and `WhatsAppTemplateLike` from `shared/whatsapp-template-variables.ts`.
- Produces: `templateVariableProgress`, `templateVariableExcerpt`, and `templatePreviewValues`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  templatePreviewValues,
  templateVariableExcerpt,
  templateVariableProgress,
} from "./campaign-template-message-layout";
import { extractWhatsAppTemplateVariables } from "./whatsapp-template-variables";

const template = {
  components: [{
    type: "BODY",
    text: "Prezado(a) {{1}}, acompanhamos o chamado {{2}} aberto para resolver {{3}}.",
  }],
};

const variables = extractWhatsAppTemplateVariables(template);

describe("campaign template message layout", () => {
  it("counts only trimmed required values as completed", () => {
    expect(templateVariableProgress(variables, {
      [variables[0].key]: "Maria",
      [variables[1].key]: "   ",
      [variables[2].key]: "Cadastro",
    })).toEqual({ total: 3, completed: 2, missing: [variables[1].key] });
  });

  it("returns a readable excerpt around the selected variable", () => {
    expect(templateVariableExcerpt(template, variables[1]))
      .toContain("chamado {{2}} aberto");
  });

  it("keeps markers for missing values in preview", () => {
    expect(templatePreviewValues(variables, { [variables[0].key]: "Maria" }))
      .toEqual({
        [variables[0].key]: "Maria",
        [variables[1].key]: "{{2}}",
        [variables[2].key]: "{{3}}",
      });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run shared/campaign-template-message-layout.test.ts
```

Expected: FAIL because `campaign-template-message-layout` does not exist.

- [ ] **Step 3: Implement the minimal helpers**

```ts
import type {
  TemplateVariable,
  TemplateVariableValues,
  WhatsAppTemplateLike,
} from "./whatsapp-template-variables";

export function templateVariableProgress(
  variables: TemplateVariable[],
  values: TemplateVariableValues,
) {
  const missing = variables
    .filter(variable => !String(values[variable.key] ?? "").trim())
    .map(variable => variable.key);
  return { total: variables.length, completed: variables.length - missing.length, missing };
}

function templateComponents(template: WhatsAppTemplateLike) {
  if (Array.isArray(template.components) && template.components.length) return template.components;
  if (Array.isArray(template.dynamicComponents) && template.dynamicComponents.length) return template.dynamicComponents;
  return Array.isArray(template.staticComponents) ? template.staticComponents : [];
}

export function templateVariableExcerpt(
  template: WhatsAppTemplateLike,
  variable: TemplateVariable,
  radius = 42,
) {
  const component = templateComponents(template)[variable.componentIndex];
  const source = variable.componentType === "button"
    ? `${component?.buttons?.[variable.buttonIndex ?? 0]?.text ?? ""} ${component?.buttons?.[variable.buttonIndex ?? 0]?.url ?? ""}`.trim()
    : String(component?.text ?? "");
  const marker = `{{${variable.token}}}`;
  const index = source.indexOf(marker);
  if (index < 0) return marker;
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + marker.length + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

export function templatePreviewValues(
  variables: TemplateVariable[],
  values: TemplateVariableValues,
): TemplateVariableValues {
  return Object.fromEntries(variables.map(variable => {
    const value = String(values[variable.key] ?? "").trim();
    return [variable.key, value || `{{${variable.token}}}`];
  }));
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: 3 tests passed.

- [ ] **Step 5: Verification checkpoint**

Run:

```powershell
npm.cmd run check
```

Expected: exit code 0. No commit is possible because this workspace is not a Git repository.

---

### Task 2: Official template variable and preview component

**Files:**
- Create: `client/src/components/campaign-template-message-layout.tsx`

**Interfaces:**
- Consumes: an approved template, extracted variables, current values, rendered preview, and `onValueChange(key, value)`.
- Produces: `CampaignTemplateMessageLayout`, a responsive accessible presentation component.

- [ ] **Step 1: Create the focused component**

```tsx
import { useState } from "react";
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
} from "@shared/campaign-template-message-layout";

type Props = {
  template: WhatsAppTemplateLike;
  variables: TemplateVariable[];
  values: TemplateVariableValues;
  preview: string;
  sampleContactName: string;
  onValueChange: (key: string, value: string) => void;
};

export function CampaignTemplateMessageLayout({
  template,
  variables,
  values,
  preview,
  sampleContactName,
  onValueChange,
}: Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const progress = templateVariableProgress(variables, values);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]" data-testid="campaign-template-layout">
      <section className="space-y-3" aria-labelledby="campaign-template-variables-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="campaign-template-variables-title" className="text-sm font-semibold">Personalize o template</h3>
            <p className="text-xs text-muted-foreground">Preencha os dados que serão inseridos na mensagem aprovada.</p>
          </div>
          <Badge variant={progress.missing.length ? "secondary" : "default"} className="shrink-0">
            {progress.missing.length ? `${progress.completed} de ${progress.total}` : <><CheckCircle2 className="mr-1 h-3 w-3" /> Completo</>}
          </Badge>
        </div>

        <div className="space-y-2.5">
          {variables.map(variable => {
            const value = values[variable.key] ?? "";
            const invalid = Boolean(touched[variable.key]) && !value.trim();
            const errorId = `campaign-template-variable-error-${variable.key.replace(/[^a-z0-9]/gi, "-")}`;
            return (
              <div key={variable.key} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px]">{`{{${variable.token}}}`}</Badge>
                  <label htmlFor={`campaign-template-variable-${variable.key}`} className="text-sm font-medium">
                    {variable.label} <span className="text-destructive">*</span>
                  </label>
                </div>
                <Input
                  id={`campaign-template-variable-${variable.key}`}
                  value={value}
                  onChange={event => onValueChange(variable.key, event.target.value)}
                  onBlur={() => setTouched(current => ({ ...current, [variable.key]: true }))}
                  placeholder="Digite um texto ou use {nome}"
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                  data-testid={`input-campaign-template-variable-${variable.key}`}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Usado em: “{templateVariableExcerpt(template, variable)}”
                </p>
                {invalid ? <p id={errorId} className="mt-1 text-xs text-destructive">Preencha esta variável.</p> : null}
              </div>
            );
          })}
        </div>
      </section>

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
            <div className="rounded-lg rounded-tl-sm bg-primary/10 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-preview-message">
              {preview || "Selecione e preencha um template para visualizar."}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the isolated component**

Run:

```powershell
npm.cmd run check
```

Expected: exit code 0.

- [ ] **Step 3: Verification checkpoint**

Review that the component contains one responsive grid, no `overflow-y-auto`, no textarea, programmatic labels, and inline errors. No commit is possible in this workspace.

---

### Task 3: Integrate the redesigned official-template step

**Files:**
- Modify: `client/src/components/campaign-wizard.tsx:1-35`
- Modify: `client/src/components/campaign-wizard.tsx:190-430`
- Modify: `client/src/components/campaign-wizard.tsx:748-1034`

**Interfaces:**
- Consumes: `CampaignTemplateMessageLayout` and `templatePreviewValues` from Tasks 1–2.
- Produces: official-template UI with a wider dialog and one body scroll region.

- [ ] **Step 1: Add imports**

```ts
import { CampaignTemplateMessageLayout } from "@/components/campaign-template-message-layout";
import { templatePreviewValues } from "@shared/campaign-template-message-layout";
```

- [ ] **Step 2: Preserve missing markers in the official preview**

Replace official preview value construction with:

```ts
const sampleWaValues = selectedWa
  ? Object.fromEntries(Object.entries(templatePreviewValues(waVariables, configuredWaValues)).map(([key, value]) => [
      key,
      renderTemplate(value, contactTemplateContext(SAMPLE_CONTACT as any)),
    ]))
  : {};
```

- [ ] **Step 3: Replace the old variable box, read-only textarea, and duplicate preview**

After the template selector and template-status warning, render:

```tsx
{selectedWa?.usable ? (
  <CampaignTemplateMessageLayout
    template={selectedWa}
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
```

Guard the existing editable message and generic preview blocks so they render only when no official template is selected:

```tsx
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
```

Delete the old `campaign-template-variables` box and its generic `Preencha todas as variáveis` message.

- [ ] **Step 4: Widen the wizard without introducing a second scrollbar**

Change the dialog shell to:

```tsx
<DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-campaign-wizard">
```

Keep the central body as the only scroll region:

```tsx
<div className="min-h-0 overflow-y-auto flex-1 px-4 py-5 sm:px-6">
```

Keep `DialogHeader` and `DialogFooter` outside that body.

- [ ] **Step 5: Run focused and full static verification**

Run:

```powershell
npx.cmd vitest run shared/campaign-template-message-layout.test.ts shared/whatsapp-template-variables.test.ts
npm.cmd run check
```

Expected: all focused tests pass and TypeScript exits 0.

---

### Task 4: Full verification, browser QA, and project documentation

**Files:**
- Modify in Obsidian: `Projetos/Politicall/03 - Alteracoes.md`
- Modify in Obsidian if a limitation remains: `Projetos/Politicall/04 - Pendencias.md`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified local application and documented change.

- [ ] **Step 1: Run complete automated verification**

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

Expected: zero failed tests, TypeScript exit 0, and production build exit 0. Record non-blocking build warnings separately.

- [ ] **Step 2: Restart the local Politicall service and verify health**

Restart only the process listening on port 5000 through `.runtime/start-app.ps1`, then run:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

Expected: `{ "status": "ok" }`.

- [ ] **Step 3: Perform desktop browser QA**

Open Campaigns, create a temporary unsaved campaign, select the official connection and a template containing three variables. Verify:

- dialog width expands on desktop;
- variable cards and preview are side by side;
- only the dialog body scrolls;
- approved body has no editable textarea;
- preview preserves `{{N}}` for missing values;
- filling values updates progress and preview;
- footer remains visible;
- **Próximo** remains disabled until every value is non-blank.

Do not save, schedule, or send the temporary campaign.

- [ ] **Step 4: Perform narrow-viewport browser QA**

Use a viewport near 390 × 844. Verify one-column order, no horizontal overflow, readable cards, and non-sticky preview. Reset the viewport override after testing.

- [ ] **Step 5: Update Obsidian**

Append a dated entry to `Projetos/Politicall/03 - Alteracoes.md` with:

- files/components created;
- official-template UX changes;
- exact test/build results;
- browser QA results;
- no secrets or environment values.

- [ ] **Step 6: Final verification checkpoint**

Confirm the server still answers the health endpoint and leave the Campaigns page open without persisting the test campaign. No commit or PR options apply because the project is not a Git repository.
