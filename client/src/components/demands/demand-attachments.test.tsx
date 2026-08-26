import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemandAttachments, type DemandAttachmentView } from "./demand-attachments";

const attachment: DemandAttachmentView = {
  id: "attachment-a",
  originalName: "foto-da-rua.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  createdAt: "2026-08-12T12:00:00.000Z",
  userName: "Carlos Nedel",
};

describe("DemandAttachments", () => {
  it("renders an accessible empty upload state", () => {
    const html = renderToStaticMarkup(createElement(DemandAttachments, {
      attachments: [], loading: false, uploading: false,
      onUpload: () => undefined, onDownload: () => undefined, onDelete: () => undefined,
    }));

    expect(html).toContain("Adicionar anexo");
    expect(html).toContain("Nenhum anexo nesta demanda");
    expect(html).toContain("PDF, PNG, JPG ou WebP");
  });

  it("renders attachment metadata and commands", () => {
    const html = renderToStaticMarkup(createElement(DemandAttachments, {
      attachments: [attachment], loading: false, uploading: false,
      onUpload: () => undefined, onDownload: () => undefined, onDelete: () => undefined,
    }));

    expect(html).toContain("foto-da-rua.png");
    expect(html).toContain("2 KB");
    expect(html).toContain("Baixar foto-da-rua.png");
    expect(html).toContain("Excluir foto-da-rua.png");
  });
});
