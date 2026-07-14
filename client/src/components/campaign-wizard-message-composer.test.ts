import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { MessageComposer } from "./campaign-wizard";

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
});
