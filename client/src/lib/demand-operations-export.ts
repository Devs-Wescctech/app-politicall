import type { DemandOperationsReport } from "@/components/demands/demand-operations-types";
import type { ExcelRows } from "./excel";
import { apiRequest } from "./queryClient";

export const DEMAND_OPERATIONS_EXPORT_LIMIT = 5_000;

const reasonLabels: Record<string, string> = {
  forwarding_overdue: "Encaminhamento vencido",
  demand_overdue: "SLA vencido",
  due_soon: "Vence em ate 4h",
  stale: "Sem atualizacao",
  active: "Em acompanhamento",
};
const statusLabels: Record<string, string> = {
  open: "Aberta", triage: "Triagem", in_progress: "Em andamento",
  waiting_requester: "Aguardando solicitante", waiting_third_party: "Aguardando terceiro",
  completed: "Concluida", cancelled: "Cancelada",
};
const rate = (value: number) => `${(value * 100).toFixed(1)}%`;
const hours = (value: number | null) => value == null ? "Sem dados" : `${value.toFixed(1)}h`;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem prazo";

export function buildDemandOperationsExportFileName(format: "xlsx" | "pdf", now = new Date()) {
  return `central-demandas-${now.toISOString().slice(0, 10)}.${format}`;
}

export function buildDemandOperationsExportRows(report: DemandOperationsReport): ExcelRows {
  const summary: ExcelRows = [
    ["CENTRAL OPERACIONAL DE DEMANDAS"],
    ["Gerado em", date(report.generatedAt)],
    [],
    ["Demandas criadas", report.summary.totalCreated],
    ["Demandas ativas", report.summary.active],
    ["SLA vencido", report.summary.overdue],
    ["Encaminhamentos vencidos", report.summary.forwardingOverdue],
    ["Taxa de conclusao", rate(report.summary.completionRate)],
    ["Taxa de atraso", rate(report.summary.overdueRate)],
    ["Taxa de resposta", rate(report.summary.responseRate)],
    ["Tempo medio para primeiro movimento", hours(report.summary.averageFirstMovementHours)],
    ["Tempo medio de resposta", hours(report.summary.averageResponseHours)],
    ["Tempo medio de resolucao", hours(report.summary.averageResolutionHours)],
    [],
    ["Protocolo", "Titulo", "Motivo", "Status", "Responsavel", "Categoria", "Destino", "Prazo"],
  ];
  return summary.concat(report.items.slice(0, DEMAND_OPERATIONS_EXPORT_LIMIT).map((item) => [
    item.protocol ?? "Sem protocolo",
    item.title,
    reasonLabels[item.reason] ?? item.reason,
    statusLabels[item.status] ?? item.status,
    item.assigneeName ?? "Sem responsavel",
    item.categoryName ?? "Sem categoria",
    item.destinationName ?? "Sem destino",
    date(item.deadlineAt),
  ]));
}

export async function fetchDemandOperationsExport(requestUrl: string): Promise<DemandOperationsReport> {
  const [path, rawQuery = ""] = requestUrl.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("page", "1");
  params.set("pageSize", "100");
  const firstResponse = await apiRequest("GET", `${path}?${params}`);
  const first = await firstResponse.json() as DemandOperationsReport;
  const items = [...first.items];
  const pages = Math.min(first.pagination.totalPages, Math.ceil(DEMAND_OPERATIONS_EXPORT_LIMIT / 100));
  for (let page = 2; page <= pages && items.length < DEMAND_OPERATIONS_EXPORT_LIMIT; page += 1) {
    params.set("page", String(page));
    const response = await apiRequest("GET", `${path}?${params}`);
    const report = await response.json() as DemandOperationsReport;
    items.push(...report.items);
  }
  return { ...first, items: items.slice(0, DEMAND_OPERATIONS_EXPORT_LIMIT), pagination: { ...first.pagination, page: 1, pageSize: items.length } };
}

export async function exportDemandOperationsXlsx(report: DemandOperationsReport) {
  const { downloadWorkbookAsXlsx } = await import("./excel");
  await downloadWorkbookAsXlsx(buildDemandOperationsExportFileName("xlsx"), [{
    name: "Central de demandas",
    rows: buildDemandOperationsExportRows(report),
    columnWidths: [20, 40, 28, 25, 28, 24, 28, 22],
    merges: [{ top: 1, left: 1, bottom: 1, right: 8 }],
  }]);
}

export async function exportDemandOperationsPdf(report: DemandOperationsReport) {
  const { downloadPdf } = await import("./pdfmake");
  const rows = buildDemandOperationsExportRows(report);
  const queueHeader = rows.findIndex((row) => row[0] === "Protocolo");
  const tableRows = rows.slice(queueHeader).map((row, index) => row.map((cell) => ({ text: String(cell ?? ""), bold: index === 0 })));
  await downloadPdf({
    pageOrientation: "landscape",
    pageMargins: [24, 30, 24, 30],
    content: [
      { text: "Central Operacional de Demandas", style: "header" },
      { text: `Ativas: ${report.summary.active} | SLA vencido: ${report.summary.overdue} | Encaminhamentos vencidos: ${report.summary.forwardingOverdue} | Conclusao: ${rate(report.summary.completionRate)}`, margin: [0, 6, 0, 14] },
      { table: { headerRows: 1, widths: [70, "*", 95, 80, 85, 80, 80, 80], body: tableRows }, layout: "lightHorizontalLines" },
    ],
    styles: { header: { fontSize: 18, bold: true } },
    defaultStyle: { fontSize: 8 },
  }, buildDemandOperationsExportFileName("pdf"));
}
