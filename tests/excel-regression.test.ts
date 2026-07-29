import { PassThrough } from "node:stream";
import * as archiver from "archiver";
import type archiverFactory from "archiver";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

type ZipArchive = ReturnType<typeof archiverFactory>;
const { ZipArchive } = archiver as unknown as {
  ZipArchive: new (options?: Parameters<typeof archiverFactory>[1]) => ZipArchive;
};

describe("Excel and archive runtime compatibility", () => {
  it("round-trips accented text, dates, integers, and formulas", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Dados");
    const date = new Date("2026-07-29T00:00:00.000Z");

    worksheet.getCell("A1").value = "Cidade";
    worksheet.getCell("A2").value = "São Paulo";
    worksheet.getCell("B2").value = 42;
    worksheet.getCell("C2").value = date;
    worksheet.getCell("D2").value = { formula: "B2*2", result: 84 };

    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);

    const reloadedWorksheet = reloaded.getWorksheet("Dados");
    expect(reloadedWorksheet?.getCell("A2").value).toBe("São Paulo");
    expect(reloadedWorksheet?.getCell("B2").value).toBe(42);
    expect(reloadedWorksheet?.getCell("C2").value).toEqual(date);
    expect(reloadedWorksheet?.getCell("D2").value).toEqual({ formula: "B2*2", result: 84 });
  });

  it("creates a ZIP with the direct archiver workflow", async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));

    const complete = new Promise<void>((resolve, reject) => {
      output.on("end", resolve);
      output.on("error", reject);
    });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    archive.append("conteúdo", { name: "dados.txt" });

    await archive.finalize();
    await complete;

    const zip = Buffer.concat(chunks);
    expect(zip.subarray(0, 4)).toEqual(Buffer.from("PK\u0003\u0004"));
    expect(zip.length).toBeGreaterThan(20);
  });
});
