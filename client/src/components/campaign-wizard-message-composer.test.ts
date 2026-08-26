import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { MessageComposer, clearCampaignWhatsappSelection, selectedCampaignTemplateConfig } from "./campaign-wizard";

describe("Campaign wizard message composer", () => {
  it("preserves the editable generic path for normal WhatsApp", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Harness() {
      const form = useForm();
      return createElement(FormProvider, form, createElement(MessageComposer, {
        channel: "whatsapp",
        message: "Olá {nome}",
        subject: "",
        waConnectionId: "normal-connection",
        templateConfig: null,
        onMessageChange: () => undefined,
        onSubjectChange: () => undefined,
        onTemplateConfigChange: () => undefined,
        onTemplateIdChange: () => undefined,
      }));
    }
    const html = renderToStaticMarkup(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Harness),
    ));

    expect(html).toContain("data-testid=\"textarea-campaign-message\"");
    expect(html).toContain("data-testid=\"text-preview-message\"");
    expect(html).toContain("Olá Maria Silva");
    expect(html).not.toContain("Personalize o template");
  });

  it("keeps the explicit sender when the operator selects an official template", () => {
    expect(selectedCampaignTemplateConfig(
      { waConnectionId: "selected-sender", variables: { existing: "value" } },
      {
        id: "template-1",
        name: "aviso",
        language: "pt_BR",
        status: "APPROVED",
        preview: "Olá",
        components: [],
        connectionId: "different-template-sender",
      },
    )).toMatchObject({
      waConnectionId: "selected-sender",
      waTemplateId: "template-1",
      waTemplateName: "aviso",
    });
  });

  it("clears the WhatsApp sender and template when the operator changes channel", () => {
    expect(clearCampaignWhatsappSelection({ waConnectionId: "sender-1", waTemplateName: "aviso" }))
      .toEqual({ waConnectionId: "", templateConfig: null, templateId: null });
  });
});
