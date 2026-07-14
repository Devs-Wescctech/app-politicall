# Campaign Template Message Layout — Design

**Date:** 2026-07-13  
**Project:** Politicall  
**Status:** Approved for implementation

## Goal

Make the official WhatsApp template message step easier to understand and complete, especially when a template contains multiple required variables. Remove nested scrolling, preserve a useful preview, and make incomplete fields immediately identifiable.

## Scope

This change applies to step 4, **Mensagem**, in `CampaignWizard` when the selected channel is WhatsApp Official and an approved template is selected. SMS, email, and normal WhatsApp composition keep their current behavior.

## Layout

The campaign dialog grows from `max-w-2xl` to `max-w-5xl` on large screens while remaining constrained to the viewport.

For official templates, the message step uses two columns on desktop:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Template and variables               │ Live preview                │
│                                      │                             │
│ Template selector                    │ Maria Silva                 │
│ 2 of 3 variables completed           │ Rendered WhatsApp message   │
│                                      │                             │
│ {{1}} Recipient name                 │                             │
│ [Maria Silva                      ]   │                             │
│ Used in: "Prezado(a), {{1}}"         │                             │
│                                      │                             │
│ {{2}} Ticket                         │                             │
│ [CH-1024                          ]   │                             │
└──────────────────────────────────────┴─────────────────────────────┘
```

On smaller screens the layout becomes one column, with variables first and preview below.

## Dialog scrolling

- The header/stepper and footer remain visible.
- Only the central dialog body scrolls vertically.
- The official template message and preview do not have their own vertical scrollbars.
- The preview is sticky within the desktop column while enough viewport height exists.
- On mobile the preview is not sticky.

## Variables

Each required variable is rendered as a compact field card containing:

- technical marker such as `{{1}}`;
- human-readable label, such as `Corpo · variável 1`;
- required indicator;
- input for fixed text or supported Politicall token;
- contextual excerpt showing where the variable appears in the approved template.

The section header displays progress: `N de M variáveis preenchidas`.

Empty required variables show an inline field error after validation is attempted. The generic red error at the bottom is removed. The **Próximo** button remains disabled while required values are missing.

## Message and preview

For an approved official template:

- the read-only message textarea is removed because users cannot edit Meta-approved content;
- the preview becomes the only rendering of the template body;
- sample contact data continues to render supported Politicall tokens;
- missing variables appear as a neutral placeholder in preview rather than disappearing, so the user can see their position;
- preview copy identifies that it uses a sample contact.

Other channels retain the editable message textarea and existing preview.

## Component boundaries

To avoid further growth in `campaign-wizard.tsx`, extract focused UI and pure helpers:

- `CampaignTemplateVariableFields`: progress, field cards, contextual excerpts and inline errors.
- `CampaignTemplatePreview`: official template preview panel.
- Pure helper for variable completion/progress and contextual excerpt generation.

`MessageComposer` remains responsible for template selection and data flow but delegates official-template presentation.

## Accessibility

- Every input has a programmatic label.
- Error text is associated with its field and exposed through `aria-invalid`/`aria-describedby`.
- Progress is available as text, not color alone.
- Focus styles use the existing design system.
- The responsive layout does not change keyboard order.

## States

- Loading templates: existing skeleton.
- Template load error: existing actionable error.
- No approved templates: existing empty warning.
- Template not usable: existing blocking warning.
- No variables: preview displays directly without an empty variable panel.
- Variables incomplete: inline errors and disabled continuation.
- Variables complete: completion state and rendered preview.

## Testing

### Unit tests

- Counts total and completed required variables.
- Treats whitespace-only values as incomplete.
- Produces a contextual excerpt for each variable occurrence.
- Preserves the variable marker when the value is missing in preview.

### Existing integration tests

- Full Vitest suite.
- TypeScript check.
- Production build.

### Browser QA

- Desktop: two columns, sticky preview, single body scrollbar and visible footer.
- Narrow viewport: one column without horizontal overflow.
- Three-variable template: progress and inline validation update correctly.
- The approved template body is not editable.
- Next step becomes available only after all required variables are filled.

## Out of scope

- Editing templates approved by Meta.
- Changing template API contracts or dispatch behavior.
- Redesigning other campaign steps.
- Adding new Politicall variable tokens.

