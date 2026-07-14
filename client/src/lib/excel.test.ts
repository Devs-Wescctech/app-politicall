import { describe, expect, it } from "vitest";
import { readExcelRows, writeWorkbookBuffer } from "./excel";

describe("client Excel helpers", () => {
  it("writes and reads xlsx row arrays", async () => {
    const buffer = await writeWorkbookBuffer({
      sheets: [
        {
          name: "Contatos",
          rows: [
            ["Nome", "Telefone"],
            ["Ana", "11999999999"],
          ],
        },
      ],
    });

    await expect(readExcelRows(buffer)).resolves.toEqual([
      ["Nome", "Telefone"],
      ["Ana", "11999999999"],
    ]);
  });
});
