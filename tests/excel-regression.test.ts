import { readFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { PassThrough } from "node:stream";
import path from "node:path";
import * as archiver from "archiver";
import type archiverFactory from "archiver";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import yauzl from "yauzl";

type ZipArchive = ReturnType<typeof archiverFactory>;
const { ZipArchive } = archiver as unknown as {
  ZipArchive: new (options?: Parameters<typeof archiverFactory>[1]) => ZipArchive;
};

type ZipEntry = { name: string; content: Buffer };

function readZipEntries(buffer: Buffer): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError ?? new Error("Could not open ZIP buffer"));
        return;
      }

      const entries: ZipEntry[] = [];
      zipfile.on("error", reject);
      zipfile.on("end", () => resolve(entries));
      zipfile.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`Could not read ${entry.fileName}`));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.push({ name: entry.fileName, content: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
        });
      });
      zipfile.readEntry();
    });
  });
}

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

  it("creates and extracts a Unicode ZIP with the direct archiver workflow", async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));

    const outputFinished = finished(output);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    archive.append("Conteúdo completo: São Paulo, ação e coração.", { name: "dados.txt" });

    await archive.finalize();
    await outputFinished;

    await expect(readZipEntries(Buffer.concat(chunks))).resolves.toEqual([
      {
        name: "dados.txt",
        content: Buffer.from("Conteúdo completo: São Paulo, ação e coração."),
      },
    ]);
  });

  it("uses the current unzipper graph without the legacy fstream glob chain", async () => {
    const lockfile = JSON.parse(await readFile(path.join(process.cwd(), "package-lock.json"), "utf8"));
    const packages = lockfile.packages as Record<string, { version?: string; dependencies?: Record<string, string> }>;
    const unzipper = packages["node_modules/unzipper"];

    expect(unzipper).toMatchObject({ version: "0.12.5" });
    expect(unzipper.dependencies).not.toHaveProperty("fstream");
    expect(packages).not.toHaveProperty("node_modules/fstream");
  });
});
