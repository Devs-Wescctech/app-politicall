import ExcelJS from "exceljs";

export type ExcelCell = string | number | boolean | Date | null | undefined;
export type ExcelRows = ExcelCell[][];
export type ExcelSheet = {
  name: string;
  rows: ExcelRows;
};

function safeSheetName(name: string, fallback: string): string {
  return (name || fallback).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || fallback;
}

function normalizeCellText(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  return String(cell.text ?? cell.value).trim();
}

export async function workbookSheetsToXlsxBuffer(sheets: ExcelSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Politicall";
  workbook.created = new Date();

  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name, `Aba ${index + 1}`));
    worksheet.addRows(sheet.rows);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function rowsToXlsxBuffer(rows: ExcelRows, sheetName: string): Promise<Buffer> {
  return workbookSheetsToXlsxBuffer([{ name: sheetName, rows }]);
}

export async function xlsxBufferToObjectRows(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers = Array.from({ length: worksheet.columnCount }, (_, index) => {
    const header = normalizeCellText(worksheet.getRow(1).getCell(index + 1));
    return header || `col_${index}`;
  });

  const rows: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const out = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = normalizeCellText(row.getCell(index + 1));
      return acc;
    }, {});
    if (Object.values(out).some((value) => value.length > 0)) rows.push(out);
  }

  return rows;
}
