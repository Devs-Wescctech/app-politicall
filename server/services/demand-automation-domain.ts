import path from "node:path";
import { hasPdfMagic, validateImageBuffer } from "./upload-security";

export const DEMAND_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DEMAND_SLA_WARNING_HOURS = 4;

export type DemandSlaAlertType = "sla_due_soon" | "sla_overdue";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  triage: "Triagem",
  in_progress: "Em andamento",
  waiting_requester: "Aguardando solicitante",
  waiting_third_party: "Aguardando terceiro",
  completed: "Concluida",
  cancelled: "Cancelada",
};

type DemandChange = {
  demandId: string;
  actorUserId: string;
  previousAssigneeUserId?: string | null;
  assigneeUserId?: string | null;
  previousStatus: string;
  status: string;
  protocol?: string | null;
  title: string;
};

export function buildDemandChangeNotification(change: DemandChange) {
  if (!change.assigneeUserId || change.assigneeUserId === change.actorUserId) return null;
  const statusChanged = change.previousStatus !== change.status;
  const assigneeChanged = change.previousAssigneeUserId !== change.assigneeUserId;
  if (!statusChanged && !assigneeChanged) return null;

  const details = [
    statusChanged ? `status alterado para ${STATUS_LABELS[change.status] ?? change.status}` : null,
    assigneeChanged ? "responsabilidade atribuida a voce" : null,
  ].filter(Boolean).join(" e ");
  return {
    userId: change.assigneeUserId,
    title: "Demanda atualizada",
    message: `${change.protocol || change.title}: ${details}`,
    priority: change.status === "completed" ? "low" : "medium",
    link: `/demands?demandId=${change.demandId}`,
  };
}

export function classifyDemandSlaAlert(
  demand: { status: string; slaDueAt?: Date | string | null },
  now = new Date(),
): DemandSlaAlertType | null {
  if (demand.status === "completed" || demand.status === "cancelled" || !demand.slaDueAt) return null;
  const dueAt = new Date(demand.slaDueAt);
  if (!Number.isFinite(dueAt.getTime())) return null;
  const remainingMs = dueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "sla_overdue";
  return remainingMs <= DEMAND_SLA_WARNING_HOURS * 60 * 60 * 1000 ? "sla_due_soon" : null;
}

type AttachmentInput = {
  buffer: Buffer | Uint8Array;
  mimeType: string;
  originalName: string;
  size: number;
};

type ValidatedAttachment = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  extension: "pdf" | "jpg" | "png" | "webp";
  safeOriginalName: string;
};

function safeAttachmentName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (base || "anexo").slice(0, 180);
}

export function validateDemandAttachment(input: AttachmentInput): ValidatedAttachment {
  if (!Number.isFinite(input.size) || input.size <= 0) throw new Error("O arquivo esta vazio");
  if (input.size > DEMAND_ATTACHMENT_MAX_BYTES) throw new Error("O arquivo deve ter no maximo 10 MB");

  const safeOriginalName = safeAttachmentName(input.originalName);
  if (input.mimeType === "application/pdf") {
    if (!hasPdfMagic(input.buffer)) throw new Error("O conteudo nao corresponde a um PDF valido");
    return { mimeType: "application/pdf", extension: "pdf", safeOriginalName };
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) {
    throw new Error("Tipo de arquivo nao permitido");
  }
  const image = validateImageBuffer(input.buffer);
  if (!image || image.mimeType !== input.mimeType || image.mimeType === "image/gif") {
    throw new Error("O conteudo nao corresponde ao tipo de imagem informado");
  }
  return { mimeType: image.mimeType, extension: image.extension as "jpg" | "png" | "webp", safeOriginalName };
}
