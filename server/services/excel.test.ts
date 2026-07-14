import { describe, expect, it } from "vitest";
import {
  rowsToXlsxBuffer,
  workbookSheetsToXlsxBuffer,
  xlsxBufferToObjectRows,
} from "./excel";

describe("server Excel helpers", () => {
  it("writes and reads xlsx buffers as object rows", async () => {
    const buffer = await rowsToXlsxBuffer([
      ["Nome", "Email"],
      ["Ana", "ana@example.com"],
      ["Bruno", ""],
    ], "Contatos");

    await expect(xlsxBufferToObjectRows(buffer)).resolves.toEqual([
      { Nome: "Ana", Email: "ana@example.com" },
      { Nome: "Bruno", Email: "" },
    ]);
  });

  it("creates a multi-sheet workbook buffer", async () => {
    const buffer = await workbookSheetsToXlsxBuffer([
      { name: "Resumo", rows: [["Métrica", "Valor"], ["Total", 2]] },
      { name: "Detalhes", rows: [["Nome"], ["Ana"]] },
    ]);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
