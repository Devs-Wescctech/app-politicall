export type ExcelCell = string | number | boolean | Date | null | undefined;
export type ExcelRows = ExcelCell[][];
export type ExcelMerge = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};
export type ExcelSheet = {
  name: string;
  rows: ExcelRows;
  columnWidths?: number[];
  merges?: ExcelMerge[];
};

function safeSheetName(name: string, fallback: string): string {
  return (name || fallback).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || fallback;
}

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
}

function cellText(cell: { value: unknown; text?: string }): string {
  if (cell.value == null) return "";
  return String(cell.text ?? cell.value).trim();
}

export async function writeWorkbookBuffer({ sheets }: { sheets: ExcelSheet[] }): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Politicall";
  workbook.created = new Date();

  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name, `Aba ${index + 1}`));
    worksheet.addRows(sheet.rows);
    sheet.columnWidths?.forEach((width, columnIndex) => {
      worksheet.getColumn(columnIndex + 1).width = width;
    });
    sheet.merges?.forEach((merge) => {
      worksheet.mergeCells(merge.top, merge.left, merge.bottom, merge.right);
    });
  });

  return workbook.xlsx.writeBuffer();
}

export async function downloadWorkbookAsXlsx(filename: string, sheets: ExcelSheet[]): Promise<void> {
  const buffer = await writeWorkbookBuffer({ sheets });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export async function readExcelRows(data: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.from({ length: worksheet.columnCount }, (_, index) => cellText(row.getCell(index + 1)));
    if (values.some((value) => value.length > 0)) rows.push(values);
  }
  return rows;
}
