/**
 * Attendance module routes — all /api/attendance/* endpoints
 */
import type { Express, Response } from "express";
import { storage } from "./storage";
import { authenticateToken, requireAnyPermission, requirePermission, type AuthRequest } from "./auth";
import { mapWesccStatus, normalizeActionCardTemplate, wescctech } from "./services/wescctech";
import { assertAttendanceTransition, isFinalAttendanceStatus, statusForSyncedConversation } from "./services/attendance-state";
import { selectRoutingCandidate } from "./services/attendance-routing";
import { decryptApiKey, encryptApiKey } from "./crypto";
import { publishAttendanceEvent } from "./attendance-events";
import { getMetaWindowState, isDirectMetaConnection, isOfficialAttendanceChannel, isWhuCloudChannelInfo } from "@shared/attendance-meta-window";
import { evaluatePublicReplyPolicy, resolveLastCustomerActivityAt } from "./services/attendance-meta-policy";
import { selectTemplateConnections } from "./services/attendance-template-selection";
import { prepareAttendanceTemplateSend, TemplateVariablesRequiredError } from "./services/attendance-template-variables";
import { extractAttendanceExternalMessageId } from "./services/attendance-message-identity";
import multer from "multer";
import PDFDocument from "pdfkit";
import { rowsToXlsxBuffer, xlsxBufferToObjectRows } from "./services/excel";
import {
  insertChannelConnectionSchema,
  insertAttSectorSchema,
  insertSectorMemberSchema,
  insertAttConversationSchema,
  insertAttMessageSchema,
  insertAttNoteSchema,
  insertQuickReplySchema,
  insertAttAutomationSchema,
  insertAttQueueSchema,
  insertAttQueueMemberSchema,
  insertContactSchema,
  type AttConversation,
  type AttMessage,
  type UserPermissions,
} from "@shared/schema";
import { z } from "zod";

const attendanceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type WebhookRateBucket = { count: number; resetAt: number };
const attendanceWebhookRate = new Map<string, WebhookRateBucket>();
const ATTENDANCE_WEBHOOK_MAX_REQUESTS = 120;
const ATTENDANCE_WEBHOOK_WINDOW_MS = 60_000;
const ATTENDANCE_WEBHOOK_MAX_BODY_BYTES = 2 * 1024 * 1024;

function consumeAttendanceWebhookRate(key: string): boolean {
  const now = Date.now();
  const current = attendanceWebhookRate.get(key);
  if (!current || current.resetAt <= now) {
    attendanceWebhookRate.set(key, { count: 1, resetAt: now + ATTENDANCE_WEBHOOK_WINDOW_MS });
    return true;
  }
  if (current.count >= ATTENDANCE_WEBHOOK_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function attendancePayloadSize(req: any): number {
  const rawBody = req.rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.length;
  return Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function maskToken(token: string | null | undefined): string | null {
  return token ? "***" : null;
}

function encryptTokenIfProvided(token: unknown): string | undefined {
  if (typeof token !== "string") return undefined;
  const trimmed = token.trim();
  if (!trimmed || trimmed === "***") return undefined;
  return encryptApiKey(trimmed);
}

function decryptTokenIfNeeded(token: string | null | undefined): string | null {
  if (!token) return null;
  if (!token.includes(":")) return token;
  return decryptApiKey(token);
}

const attendanceReadPermissions: (keyof UserPermissions)[] = [
  "attendanceView",
  "whatsappAttendance",
  "emailAttendance",
  "socialAttendance",
];

function requireAttendanceRead() {
  return requireAnyPermission(...attendanceReadPermissions);
}

function hasPermission(req: AuthRequest, permission: keyof UserPermissions): boolean {
  return req.user?.role === "admin" || Boolean(req.user?.permissions?.[permission]);
}

function canReplyConversation(req: AuthRequest, conversation: AttConversation): boolean {
  if (!hasPermission(req, "attendanceReply")) return false;
  if (conversation.assignedUserId === req.userId) return true;
  return hasPermission(req, "attendanceReplyAny");
}

function canManageConversation(req: AuthRequest, conversation: AttConversation): boolean {
  return conversation.assignedUserId === req.userId || hasPermission(req, "attendanceReplyAny");
}

function manageBlockedMessage(conversation: AttConversation): string {
  return conversation.assignedUserId
    ? "Somente o responsável ou supervisor pode realizar esta ação."
    : "Assuma o atendimento antes de realizar esta ação.";
}

function replyBlockedMessage(conversation: AttConversation): string {
  return conversation.assignedUserId
    ? "Este atendimento pertence a outro operador."
    : "Assuma o atendimento antes de responder.";
}

async function autoRouteConversation(accountId: string, conversation: AttConversation): Promise<AttConversation> {
  if (conversation.assignedUserId || conversation.status !== "waiting_agent") return conversation;

  const queues = await storage.getQueues(accountId);
  const queue = conversation.queueId
    ? queues.find(item => item.id === conversation.queueId && item.active !== false)
    : queues.find(item => item.active !== false && item.isDefault && (!item.channel || item.channel === conversation.channel))
      ?? queues.find(item => item.active !== false && item.strategy !== "manual" && (!item.channel || item.channel === conversation.channel));
  if (!queue || queue.strategy === "manual") return conversation;

  const members = await storage.getQueueMembers(queue.id, accountId);
  const users = await storage.getAllUsers(accountId);
  const eligibleIds = members
    .map(member => member.userId)
    .filter(userId => users.some(user => user.id === userId && (user.role === "admin" || Boolean((user.permissions as any)?.attendanceReply))));
  const counts = await storage.getOpenConversationCounts(accountId, eligibleIds);
  const metadata = (queue.metadata as any) ?? {};
  const capacity = Math.min(100, Math.max(1, Number(metadata.maxConcurrentPerAgent) || 3));
  const candidate = selectRoutingCandidate(
    queue.strategy,
    eligibleIds.map(userId => ({ userId, openCount: counts[userId] ?? 0, capacity })),
    metadata.lastAssignedUserId,
  );
  if (!candidate) return conversation;

  const result = await storage.assumeConversation(conversation.id, accountId, candidate.userId, candidate.userId);
  if (!result.conversation) return result.conflict ?? conversation;
  await storage.updateQueue(queue.id, accountId, {
    metadata: { ...metadata, lastAssignedUserId: candidate.userId, lastAssignedAt: new Date().toISOString() },
  } as any);
  await recordSystemAttendanceEvent(accountId, "conversation.auto_assigned", {
    conversationId: conversation.id,
    after: result.conversation,
    metadata: { queueId: queue.id, strategy: queue.strategy, assignedUserId: candidate.userId },
    realtimeType: "attendance.conversation.updated",
  });
  return result.conversation;
}

type AttendanceLabel = { id: string; name: string; color: string };

function normalizeAttendanceLabels(value: unknown): AttendanceLabel[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as any).labels)
      ? (value as any).labels
      : [];
  return source
    .map((item: any) => ({
      id: String(item?.id || item?.name || "").trim(),
      name: String(item?.name || "").trim(),
      color: /^#[0-9a-fA-F]{6}$/.test(String(item?.color || "")) ? String(item.color) : "#14b8a6",
    }))
    .filter((label: AttendanceLabel) => label.name);
}

function getAutomationKeywordRules(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as any).rules)) return (value as any).rules;
  return [];
}

function buildAutomationKeywordRules(existing: unknown, labels: AttendanceLabel[]) {
  return {
    rules: getAutomationKeywordRules(existing),
    labels,
  };
}

function requestIp(req: AuthRequest): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip ?? null;
}

async function recordAttendanceEvent(
  req: AuthRequest,
  action: string,
  options: {
    conversationId?: string | null;
    messageId?: string | null;
    entityType?: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, any>;
    realtimeType?: string;
  } = {}
) {
  if (!req.accountId) return null;
  const event = await storage.createAttendanceEvent({
    accountId: req.accountId,
    conversationId: options.conversationId ?? null,
    messageId: options.messageId ?? null,
    userId: req.userId ?? null,
    action,
    entityType: options.entityType ?? "conversation",
    entityId: options.entityId ?? options.conversationId ?? null,
    ipAddress: requestIp(req),
    userAgent: req.headers["user-agent"] ?? null,
    before: options.before as any,
    after: options.after as any,
    metadata: options.metadata ?? {},
  } as any);

  publishAttendanceEvent({
    type: options.realtimeType ?? "attendance.event.created",
    accountId: req.accountId,
    conversationId: options.conversationId,
    messageId: options.messageId,
    payload: { action, event, ...(options.metadata ?? {}) },
  });

  return event;
}

async function recordSystemAttendanceEvent(
  accountId: string,
  action: string,
  options: {
    conversationId?: string | null;
    messageId?: string | null;
    entityType?: string;
    entityId?: string | null;
    after?: unknown;
    metadata?: Record<string, any>;
    realtimeType?: string;
  } = {}
) {
  const event = await storage.createAttendanceEvent({
    accountId,
    conversationId: options.conversationId ?? null,
    messageId: options.messageId ?? null,
    action,
    entityType: options.entityType ?? "conversation",
    entityId: options.entityId ?? options.conversationId ?? null,
    after: options.after as any,
    metadata: options.metadata ?? {},
  } as any);

  publishAttendanceEvent({
    type: options.realtimeType ?? "attendance.event.created",
    accountId,
    conversationId: options.conversationId,
    messageId: options.messageId,
    payload: { action, event, ...(options.metadata ?? {}) },
  });

  return event;
}

function remoteChatId(chat: any): string | null {
  return String(chat?.attendanceId || chat?.chatId || chat?.id || "").trim() || null;
}

function remoteContactNumber(chat: any): string | null {
  return String(chat?.contact?.number || chat?.number || chat?.phone || chat?.contactId || chat?.contact?.id || "").trim() || null;
}

function remoteContactName(chat: any): string | null {
  return chat?.description || chat?.contact?.name || chat?.name || remoteContactNumber(chat);
}

function remoteMessageId(message: any): string | null {
  return extractAttendanceExternalMessageId(message);
}

function remoteMessageText(message: any): string | null {
  if (message?.isDeleted) return "[Mensagem apagada]";
  if (message?.dataLocation) {
    const location = message.dataLocation;
    return location.description || location.urlShared || `${location.latitude}, ${location.longitude}`;
  }
  if (Array.isArray(message?.dataVcard) && message.dataVcard.length > 0) {
    return message.dataVcard
      .map((item: any) => item?.name || item?.displayName || item?.number || item?.phone)
      .filter(Boolean)
      .join(", ") || "[Contato]";
  }
  const text =
    message?.text ??
    message?.body ??
    message?.message ??
    message?.caption ??
    message?.dataMedia?.caption ??
    message?.dataMedia?.filename ??
    message?.lastMessage?.text ??
    message?.textLastMessage;
  if (typeof text === "string" && text.trim()) return text.trim();
  if (message?.dataMedia?.type) return `[${message.dataMedia.type}]`;
  if (message?.dataMedia?.mimetype) return `[${message.dataMedia.mimetype}]`;
  return null;
}

function remoteLastMessagePreview(chat: any): string | null {
  const text = remoteMessageText(chat?.lastMessage);
  if (text) return text;
  if (typeof chat?.textLastMessage === "string" && chat.textLastMessage.trim()) return chat.textLastMessage.trim();
  if (typeof chat?.lastMessage === "string" && chat.lastMessage.trim()) return chat.lastMessage.trim();
  return null;
}

function remoteLastMessageDate(chat: any): Date | null {
  const raw =
    chat?.lastMessage?.utcDhMessage ??
    chat?.lastMessage?.dhMessage ??
    chat?.lastReceivedMessageDate ??
    chat?.lastSentMessageDate ??
    chat?.lastSeen;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractRemoteChats(resp: any): any[] {
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.chats)) return resp.chats;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp?.attendances)) return resp.attendances;
  if (Array.isArray(resp?.result)) return resp.result;
  return [];
}

function remoteQueue(chat: any): string {
  if (chat?.typeChat === 3 || chat?.type === 3 || chat?.isGroup || chat?.contact?.isGroup) return "group";
  if (Number(chat?.timeInOutOfHour ?? 0) > 0) return "out_of_hour";
  if (Number(chat?.timeInWaiting ?? 0) > 0) return "waiting";
  if (Number(chat?.timeInAutomatic ?? 0) > 0 || Number(chat?.status) === 0) return "automatic";
  return "manual";
}

function modeForStatus(status: string, assignedUserId?: string | null): "automatic" | "manual" {
  if (assignedUserId) return "manual";
  return ["in_progress", "manual", "transferred", "paused", "reopened"].includes(status) ? "manual" : "automatic";
}

function normalizeEventText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isExternalManualTransfer(body: unknown, payload: any): boolean {
  const text = normalizeEventText([
    body,
    payload?.text,
    payload?.message,
    payload?.description,
    payload?.event,
    payload?.type,
    payload?.status,
  ].filter(Boolean).join(" "));

  return (
    text.includes("chat transferido para o usuario") ||
    text.includes("atendimento transferido para o usuario") ||
    text.includes("transferido para atendimento humano") ||
    text.includes("transferido para humano") ||
    (text.includes("chat transferido") && text.includes("usuario"))
  );
}

function remoteMessageType(message: any): string {
  if (message?.isPrivate) return "whisper";
  if (message?.isSystemMessage) return "system";
  if (message?.dataLocation) return "location";
  if (Array.isArray(message?.dataVcard) && message.dataVcard.length > 0) return "contact";
  if (message?.dataMedia?.type) {
    const remoteType = String(message.dataMedia.type).toLowerCase();
    if (remoteType === "ptt") return "audio";
    if (remoteType === "vcard" || remoteType === "multi_vcard") return "contact";
    return remoteType;
  }
  const type = Number(message?.typeMessage);
  const map: Record<number, string> = {
    0: "text",
    1: "audio",
    2: "audio",
    3: "image",
    4: "video",
    5: "document",
    6: "sticker",
    7: "location",
    8: "vcard",
    9: "vcard",
    10: "revoked",
    12: "call",
  };
  return map[type] ?? "text";
}

function remoteMessageStatus(message: any): string {
  const status = Number(message?.statusMessage);
  if (message?.isDeleted) return "deleted";
  if (status === -1) return "failed";
  if (status === 5) return "played";
  if (status === 4) return "deleted";
  if (status === 3) return "read";
  if (status === 2) return "delivered";
  if (status === 1) return "sent";
  if (status === 0) return "queued";
  return message?.isSentByMe ? "sent" : "received";
}

async function syncConversationMessages(accountId: string, conversation: any): Promise<{ created: number; total: number }> {
  if (!conversation?.externalThreadId) return { created: 0, total: 0 };
  const token = await getWesccToken(accountId, conversation.connectionId ?? undefined);
  if (!token) return { created: 0, total: 0 };

  const remoteChat = await wescctech.getChat(token, conversation.externalThreadId);
  const messages = Array.isArray((remoteChat as any)?.messages) ? (remoteChat as any).messages : [];
  let created = 0;

  for (const remote of messages) {
    const externalMessageId = remoteMessageId(remote);
    if (!externalMessageId) continue;
    const existing = await storage.getMessageByExternalId(externalMessageId, accountId);
    if (existing) continue;

    const createdAt = remote?.utcDhMessage || remote?.dhMessage ? new Date(remote.utcDhMessage ?? remote.dhMessage) : new Date();
    const dataMedia = remote?.dataMedia ?? {};
    const dataLocation = remote?.dataLocation ?? null;
    const dataVcard = Array.isArray(remote?.dataVcard) ? remote.dataVcard : null;
    const body = remoteMessageText(remote);
    const msg = await storage.createMessage({
      accountId,
      conversationId: conversation.id,
      direction: remote?.isPrivate ? "internal" : remote?.isSentByMe ? "outbound" : "inbound",
      channel: conversation.channel,
      provider: conversation.provider,
      externalMessageId,
      body,
      messageType: remoteMessageType(remote),
      status: remoteMessageStatus(remote),
      mediaUrl: dataMedia.urlFile ?? null,
      mimeType: dataMedia.mimetype ?? null,
      metadata: { remote, dataMedia, dataLocation, dataVcard },
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    } as any);
    await recordSystemAttendanceEvent(accountId, "message.synced", {
      conversationId: conversation.id,
      messageId: msg.id,
      entityType: "message",
      entityId: msg.id,
      after: msg,
      metadata: { externalMessageId, direction: msg.direction },
      realtimeType: "attendance.message.created",
    });
    created++;
  }

  const latest = messages.reduce((current: any, candidate: any) => {
    if (!current) return candidate;
    const currentTime = new Date(current?.utcDhMessage ?? current?.dhMessage ?? 0).getTime();
    const candidateTime = new Date(candidate?.utcDhMessage ?? candidate?.dhMessage ?? 0).getTime();
    return candidateTime > currentTime ? candidate : current;
  }, null as any);
  const localMessages = await storage.getMessages(conversation.id, accountId);
  const latestLocal = localMessages[localMessages.length - 1];
  const lastCustomerActivityAt = resolveLastCustomerActivityAt({
    remoteChat,
    messages: localMessages,
    current: conversation.lastCustomerActivityAt,
  });
  if (latest || latestLocal) {
    const latestRemoteDate = new Date(latest?.utcDhMessage ?? latest?.dhMessage ?? 0);
    const remoteTime = Number.isNaN(latestRemoteDate.getTime()) ? 0 : latestRemoteDate.getTime();
    const localTime = latestLocal?.createdAt ? new Date(latestLocal.createdAt).getTime() : 0;
    const currentTime = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
    const localIsLatest = localTime >= remoteTime && localTime >= currentTime;
    const remoteIsLatest = remoteTime > localTime && remoteTime >= currentTime;
    await storage.updateConversation(conversation.id, accountId, {
      lastMessageAt: localIsLatest ? latestLocal.createdAt : remoteIsLatest ? latestRemoteDate : conversation.lastMessageAt,
      lastMessagePreview: localIsLatest
        ? (latestLocal.body ?? conversation.lastMessagePreview)
        : remoteIsLatest
          ? (remoteMessageText(latest) ?? remoteLastMessagePreview(remoteChat) ?? conversation.lastMessagePreview)
          : conversation.lastMessagePreview,
      lastCustomerActivityAt: lastCustomerActivityAt ?? conversation.lastCustomerActivityAt,
      metadata: {
        ...((conversation.metadata as any) ?? {}),
        remote: remoteChat,
        queue: remoteQueue(remoteChat),
      },
      updatedAt: new Date(),
    });
  }

  return { created, total: messages.length };
}

function normalizePhone(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]): string {
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function sendPdf(res: Response, filename: string, title: string, rows: unknown[][]) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  const doc = new PDFDocument({ margin: 36, size: "A4" });
  doc.pipe(res);
  doc.fontSize(15).text(title, { underline: true });
  doc.moveDown();
  rows.forEach((row, index) => {
    if (row.length === 0) {
      doc.moveDown(0.5);
      return;
    }
    const line = row.map(value => String(value ?? "")).join(" | ");
    doc.fontSize(index === 0 ? 9 : 8).text(line, { width: 520 });
  });
  doc.end();
}

function parseDelimitedRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = line.split(separator).map(value => value.trim());
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header || `col_${index}`] = values[index] ?? "";
      return row;
    }, {});
  });
}

async function uploadedRows(file?: { originalname: string; mimetype?: string; buffer: Buffer }): Promise<Record<string, string>[]> {
  if (!file) return [];
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return xlsxBufferToObjectRows(file.buffer);
  }
  return parseDelimitedRows(file.buffer.toString("utf8"));
}

function mapImportedContact(row: Record<string, string>, mapping: Record<string, string>) {
  const value = (key: string) => {
    const mapped = mapping[key] || key;
    return String(row[mapped] ?? row[key] ?? "").trim();
  };
  return {
    name: value("name") || value("Nome") || value("nome"),
    phone: value("phone") || value("Telefone") || value("telefone"),
    email: value("email") || value("Email") || value("email"),
    city: value("city") || value("Cidade") || value("cidade"),
    state: value("state") || value("Estado") || value("estado"),
    notes: value("notes") || value("Observacoes") || value("observacoes"),
    company: value("company") || value("Empresa") || value("empresa"),
    position: value("position") || value("Cargo") || value("cargo"),
    channel: value("channel") || value("Canal") || value("canal"),
    interests: (value("tags") || value("Etiquetas") || value("etiquetas"))
      .split(/[|,]/)
      .map(tag => tag.trim())
      .filter(Boolean),
  };
}

async function syncLegacyLabels(accountId: string) {
  const [contacts, conversations] = await Promise.all([
    storage.getContacts(accountId),
    storage.getConversations(accountId),
  ]);
  const names = new Set<string>();
  contacts.forEach(contact => (contact.interests ?? []).forEach(tag => names.add(tag)));
  conversations.forEach(conversation => (conversation.tags ?? []).forEach(tag => names.add(tag)));
  for (const name of names) await storage.upsertLabel(accountId, { name });
}

function isOfficialConnection(connection: any): boolean {
  return isOfficialAttendanceChannel({ connection });
}

function officialConfig(connection: any) {
  const metadata = (connection?.metadata as any) ?? {};
  return {
    businessAccountId: metadata.businessAccountId ?? metadata.whatsappBusinessAccountId ?? metadata.wabaId,
    phoneNumberId: metadata.phoneNumberId ?? metadata.whatsappPhoneNumberId,
    graphBaseUrl: metadata.graphBaseUrl ?? metadata.baseUrl,
  };
}

function templatePreview(template: any): string {
  const components = Array.isArray(template?.components) ? template.components : [];
  const body = components.find((component: any) => String(component?.type ?? "").toUpperCase() === "BODY");
  return body?.text ?? template?.message ?? template?.title ?? template?.name ?? "";
}

async function syncAttendanceContact(accountId: string, userId: string, conversation: AttConversation) {
  const phone = normalizePhone(conversation.contactPhone ?? conversation.externalContactId);
  if (!phone) return null;
  const all = await storage.getContacts(accountId);
  const existing = all.find(contact => normalizePhone(contact.phone) === phone);
  const payload = {
    name: conversation.contactName ?? conversation.contactPhone ?? phone,
    phone,
    email: conversation.contactEmail ?? undefined,
    source: "Atendimento",
    notes: (conversation.summary ?? undefined) as any,
  };
  if (existing) return storage.updateContact(existing.id, accountId, payload);
  return storage.createContact({ ...payload, userId, accountId } as any);
}

async function syncAttendanceContacts(accountId: string, userId: string) {
  const conversations = await storage.getConversations(accountId);
  let imported = 0;
  for (const conversation of conversations) {
    const before = await storage.getContacts(accountId);
    const phone = normalizePhone(conversation.contactPhone ?? conversation.externalContactId);
    if (!phone || before.some(contact => normalizePhone(contact.phone) === phone)) continue;
    await syncAttendanceContact(accountId, userId, conversation);
    imported++;
  }
  return { imported, total: conversations.length };
}

async function sendTemplateToConversation(req: AuthRequest, conv: AttConversation, options: {
  connection?: any;
  templateId?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: any[];
  fallbackText?: string;
}) {
  const initialConnection = options.connection ?? (conv.connectionId ? await storage.getChannelConnection(conv.connectionId, req.accountId!) : null);
  const templates = await resolveAttendanceTemplates(req.accountId!, initialConnection?.id);
  const selected = templates.find((template: any) => template.id === options.templateId || template.name === options.templateName);
  if (!selected) throw new Error("Template não encontrado ou indisponível para esta conexão");
  const prepared = prepareAttendanceTemplateSend(selected, options.templateComponents, options.fallbackText);
  const connection = initialConnection ?? (selected?.connectionId ? await storage.getChannelConnection(selected.connectionId, req.accountId!) : null);
  const token = await getWesccToken(req.accountId!, connection?.id ?? conv.connectionId ?? undefined);
  const name = options.templateName ?? selected?.name;
  const language = options.templateLanguage ?? selected?.language ?? "pt_BR";
  const body = prepared.preview;
  let externalMsgId: string | null = null;
  let sendError: string | null = null;

  if (token && selected?.source === "whu_action_card" && selected?.id && conv.externalContactId) {
    try {
      const sent = connection && isOfficialConnection(connection)
        ? await wescctech.sendCloudTemplate(token, {
          number: conv.externalContactId,
          templateId: selected.id,
          templateComponents: prepared.components,
        })
        : await wescctech.sendActionCard(token, {
          number: conv.externalContactId,
          actionCardId: selected.id,
        });
      externalMsgId = remoteMessageId(sent);
    } catch (err: any) {
      sendError = err.message;
    }
  } else if (token && connection && isOfficialConnection(connection) && name && conv.externalContactId) {
    const cfg = officialConfig(connection);
    if (cfg.phoneNumberId) {
      try {
        const sent = await wescctech.sendOfficialTemplate(token, {
          phoneNumberId: cfg.phoneNumberId,
          to: conv.externalContactId,
          name,
          language,
          components: prepared.components,
          graphBaseUrl: cfg.graphBaseUrl,
        });
        externalMsgId = String(sent?.messages?.[0]?.id ?? sent?.id ?? "").trim() || null;
      } catch (err: any) {
        sendError = err.message;
      }
    } else {
      sendError = "ConexÃ£o oficial sem phoneNumberId configurado";
    }
  } else if (token && conv.externalContactId && body) {
    try {
      const sent = await wescctech.sendText(token, { number: conv.externalContactId, message: body });
      externalMsgId = remoteMessageId(sent);
    } catch (err: any) {
      sendError = err.message;
    }
  }

  const msg = await storage.createMessage({
    accountId: req.accountId!,
    conversationId: conv.id,
    userId: req.userId!,
    direction: "outbound",
    channel: conv.channel,
    provider: conv.provider,
    externalMessageId: externalMsgId,
    body,
    messageType: "template",
    status: sendError ? "failed" : "sent",
    errorMessage: sendError,
    metadata: {
      templateId: options.templateId,
      templateName: name,
      templateSource: selected?.source,
      language,
      official: Boolean(connection && isOfficialConnection(connection)),
    },
  });

  await storage.updateConversation(conv.id, req.accountId!, {
    lastMessageAt: new Date(),
    lastMessagePreview: body.slice(0, 100),
    lastOperatorActivityAt: new Date(),
    firstResponseAt: conv.firstResponseAt ?? new Date(),
    updatedAt: new Date(),
  });

  await recordAttendanceEvent(req, "message.template.sent", {
    conversationId: conv.id,
    messageId: msg.id,
    entityType: "message",
    entityId: msg.id,
    after: msg,
    metadata: { sendError, externalMessageId: externalMsgId },
    realtimeType: "attendance.message.created",
  });

  return msg;
}

async function resolveAttendanceTemplates(accountId: string, connectionId?: string) {
  const quickReplies = await storage.getQuickReplies(accountId);
  const internal = quickReplies.map(reply => ({
    id: reply.id,
    name: reply.title,
    title: reply.title,
    preview: reply.message,
    message: reply.message,
    source: "quick_reply",
  }));

  const connections = selectTemplateConnections(await storage.getChannelConnections(accountId), connectionId);
  const collected: any[] = [];

  for (const connection of connections) {
    const metadata = (connection.metadata as any) ?? {};
    const configured = Array.isArray(metadata.templates)
      ? metadata.templates.map((template: any) => ({
        id: template.id ?? template.name,
        name: template.name,
        title: template.title ?? template.name,
        preview: templatePreview(template),
        language: template.language ?? template.languageCode ?? "pt_BR",
        components: template.components,
        source: "official",
        connectionId: connection.id,
        status: template.status,
        category: template.category,
      }))
      : [];
    const token = decryptTokenIfNeeded(connection.token);

    if (token && isDirectMetaConnection(connection)) {
      const cfg = officialConfig(connection);
      if (cfg.businessAccountId) {
        try {
          const remote = await wescctech.listOfficialTemplates(token, cfg);
          collected.push(...remote
            .filter(template => !template.status || String(template.status).toUpperCase() === "APPROVED")
            .map(template => ({
              id: template.id ?? template.name,
              name: template.name,
              title: template.name,
              preview: templatePreview(template),
              language: template.language ?? "pt_BR",
              components: template.components,
              source: "official",
              connectionId: connection.id,
              status: template.status,
              category: template.category,
            })));
        } catch (err: any) {
          console.error("[ATT] official templates error:", String(err.message ?? "Falha ao listar templates").slice(0, 300));
        }
      }
    } else if (token) {
      try {
        const remote = await wescctech.listActionCardTemplates(token);
        collected.push(...remote.filter(template => Boolean(template.id)).map(template => ({
          ...normalizeActionCardTemplate(template),
          connectionId: connection.id,
        })));
      } catch (err: any) {
        console.error("[ATT] WHU action-card templates error:", String(err.message ?? "Falha ao listar templates").slice(0, 300));
      }
    }

    collected.push(...configured);
  }

  const unique = new Map<string, any>();
  for (const template of [...collected, ...internal]) {
    unique.set(`${template.source ?? "template"}:${template.id}`, template);
  }
  return Array.from(unique.values());
}

/** Get Wescctech token for an account (from channelConnections or integrations fallback) */
async function resolveAttendanceConnection(accountId: string, connectionId?: string) {
  if (connectionId) return storage.getChannelConnection(connectionId, accountId);
  const connections = await storage.getChannelConnections(accountId).catch(() => []);
  return connections.find(connection => connection.status !== "disabled" && (connection.metadata as any)?.source === "settings-omni")
    ?? connections.find(connection => connection.status !== "disabled" && String(connection.channel).toLowerCase().includes("whatsapp"))
    ?? null;
}

async function getWesccToken(accountId: string, connectionId?: string): Promise<string | null> {
  const connection = await resolveAttendanceConnection(accountId, connectionId);
  const connectionToken = decryptTokenIfNeeded(connection?.token);
  if (connectionToken) return connectionToken;
  const whatsappIntegration = await storage
    .getIntegrationByAccount(accountId, "whatsapp")
    .catch(() => null);
  return decryptTokenIfNeeded((whatsappIntegration as any)?.whatsappToken);
}

// ─── route registration ───────────────────────────────────────────────────────

export function registerAttendanceRoutes(app: Express) {

  // ===================== CHANNEL CONNECTIONS =====================

  app.get("/api/attendance/connections", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const connections = await storage.getChannelConnections(req.accountId!);
      res.json(connections.map(c => ({ ...c, token: maskToken(c.token) })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/connections/available", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const connections = await storage.getChannelConnections(req.accountId!);
      res.json(connections.filter(c => c.status !== "disabled").map(c => ({ ...c, token: maskToken(c.token) })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/connections", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const data = insertChannelConnectionSchema.parse(req.body);
      const token = encryptTokenIfProvided(data.token);
      const conn = await storage.createChannelConnection({ ...data, token: token ?? null, accountId: req.accountId! });
      await recordAttendanceEvent(req, "connection.created", {
        entityType: "connection",
        entityId: conn.id,
        after: { ...conn, token: maskToken(conn.token) },
        realtimeType: "attendance.settings.updated",
      });
      res.json({ ...conn, token: maskToken(conn.token) });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/connections/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const token = encryptTokenIfProvided(req.body.token);
      const { token: _token, ...rest } = req.body;
      const before = await storage.getChannelConnection(req.params.id, req.accountId!);
      const conn = await storage.updateChannelConnection(req.params.id, req.accountId!, {
        ...rest,
        ...(token ? { token } : {}),
      });
      await recordAttendanceEvent(req, "connection.updated", {
        entityType: "connection",
        entityId: conn.id,
        before: before ? { ...before, token: maskToken(before.token) } : null,
        after: { ...conn, token: maskToken(conn.token) },
        realtimeType: "attendance.settings.updated",
      });
      res.json({ ...conn, token: maskToken(conn.token) });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/connections/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getChannelConnection(req.params.id, req.accountId!);
      await storage.deleteChannelConnection(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "connection.deleted", {
        entityType: "connection",
        entityId: req.params.id,
        before: before ? { ...before, token: maskToken(before.token) } : null,
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  /** Test connection against the configured provider without exposing credentials. */
  app.post("/api/attendance/connections/:id/test", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const conn = await storage.getChannelConnection(req.params.id, req.accountId!);
      const token = decryptTokenIfNeeded(conn?.token);
      if (!conn || !token) return res.status(400).json({ error: "Conexão não encontrada ou token ausente" });

      let status = "error";
      let error: string | undefined;
      try {
        if (isDirectMetaConnection(conn)) {
          const cfg = officialConfig(conn);
          if (!cfg.businessAccountId || !cfg.phoneNumberId) {
            throw new Error("Business Account ID e Phone Number ID são obrigatórios para WhatsApp Cloud");
          }
          await wescctech.listOfficialTemplates(token, cfg);
          status = "connected";
        } else {
          const result = await wescctech.getStatus(token);
          status = result.status === "CONNECTED" ? "connected" : "error";
          if (status === "error") error = `Status remoto: ${result.status}`;
        }
      } catch (err: any) {
        error = String(err.message ?? "Falha de conexão").replace(/(access_token|token)=[^&\s]+/gi, "$1=***");
      }

      const updated = await storage.updateChannelConnection(conn.id, req.accountId!, {
        status,
        lastTestedAt: new Date(),
        lastError: error ?? null,
      });
      await recordAttendanceEvent(req, "connection.tested", {
        entityType: "connection",
        entityId: updated.id,
        after: { ...updated, token: maskToken(updated.token) },
        metadata: { status, error },
        realtimeType: "attendance.settings.updated",
      });
      res.json({ ...updated, token: maskToken(updated.token) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== PROVIDER PROXY =====================

  app.get("/api/attendance/provider/channel", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const token = await getWesccToken(req.accountId!, req.query.connectionId as string);
      if (!token) return res.status(400).json({ error: "Token não configurado" });
      const data = await wescctech.getChannel(token);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/provider/users", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const token = await getWesccToken(req.accountId!, req.query.connectionId as string);
      if (!token) return res.status(400).json({ error: "Token não configurado" });
      const users = await wescctech.getUsers(token);
      res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/provider/sectors", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const token = await getWesccToken(req.accountId!, req.query.connectionId as string);
      if (!token) return res.status(400).json({ error: "Token não configurado" });
      const sectors = await wescctech.getSectors(token);
      res.json(sectors);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== CONVERSATION SYNC =====================

  /** Sync conversations from Wescctech into local DB */
  app.post("/api/attendance/sync", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, page = 0, status: requestedStatus } = req.body;
      let effectiveConnection = await resolveAttendanceConnection(req.accountId!, connectionId);
      const effectiveConnectionId = effectiveConnection?.id ?? connectionId ?? null;
      const token = await getWesccToken(req.accountId!, effectiveConnectionId ?? undefined);
      if (!token) return res.status(400).json({ error: "Token não configurado" });

      if (effectiveConnection && !isDirectMetaConnection(effectiveConnection)) {
        try {
          const channelResult: any = await wescctech.getChannel(token);
          const channelInfo = channelResult?.data ?? channelResult?.result ?? channelResult;
          const channelType = Number(channelInfo?.type ?? channelInfo?.channelType ?? channelInfo?.typeChannel);
          if (Number.isFinite(channelType)) {
            const official = channelType === 3 || isWhuCloudChannelInfo(channelInfo);
            const metadata = {
              ...((effectiveConnection.metadata as any) ?? {}),
              channelType,
              official,
              whatsappOfficial: official,
              apiType: official ? "official" : "whu",
              externalChannelId: channelInfo?.id ?? null,
              businessAccountId: channelInfo?.wabaId ?? (effectiveConnection.metadata as any)?.businessAccountId ?? null,
              phoneNumberId: channelInfo?.numberId ?? (effectiveConnection.metadata as any)?.phoneNumberId ?? null,
            };
            effectiveConnection = await storage.updateChannelConnection(effectiveConnection.id, req.accountId!, {
              provider: official ? "wescctech_cloud" : "wescctech",
              metadata,
            });
          }
        } catch (err: any) {
          console.error("[ATT] channel type detection error:", String(err.message ?? "Falha ao identificar canal").slice(0, 300));
        }
      }

      const statuses = requestedStatus === undefined || requestedStatus === null || requestedStatus === "all"
        ? [0, 1, 2, 3, 4, 5]
        : [Number(requestedStatus)];
      const typeChats = [2, 3];
      const byExternalId = new Map<string, any>();
      const remoteResults: Array<{ typeChat: number; status: number; count: number }> = [];

      for (const typeChat of typeChats) {
        for (const remoteStatus of statuses) {
          const resp = await wescctech.listChats(token, { typeChat, status: remoteStatus, page });
          const batch = extractRemoteChats(resp).map(chat => ({ ...chat, typeChat }));
          remoteResults.push({ typeChat, status: remoteStatus, count: batch.length });
          for (const chat of batch) {
            const id = remoteChatId(chat);
            if (id) byExternalId.set(id, chat);
          }
        }
      }

      const chats = Array.from(byExternalId.values());

      let created = 0;
      let updated = 0;

      for (const chat of chats) {
        const externalThreadId = remoteChatId(chat);
        if (!externalThreadId) continue;
        const contactNumber = remoteContactNumber(chat);
        const existing = await storage.getConversationByExternal(req.accountId!, externalThreadId);
        const remoteStatus = mapWesccStatus(Number(chat.status ?? chat.attendance?.status ?? 1));

        if (existing) {
          const localStatus = statusForSyncedConversation(remoteStatus, existing.assignedUserId);
          await storage.updateConversation(existing.id, req.accountId!, {
            connectionId: existing.connectionId ?? effectiveConnectionId,
            provider: effectiveConnection?.provider ?? existing.provider,
            status: localStatus,
            mode: modeForStatus(localStatus, existing.assignedUserId),
            lastMessagePreview: remoteLastMessagePreview(chat) ?? existing.lastMessagePreview,
            lastMessageAt: remoteLastMessageDate(chat) ?? existing.lastMessageAt,
            lastCustomerActivityAt: resolveLastCustomerActivityAt({ remoteChat: chat, current: existing.lastCustomerActivityAt }) ?? existing.lastCustomerActivityAt,
            unreadCount: chat.unread ?? chat.countUnreadMessages ?? 0,
            contactName: remoteContactName(chat) ?? existing.contactName,
            contactPhone: contactNumber ?? existing.contactPhone,
            contactAvatar: chat.photo ?? chat.linkImage ?? chat.contact?.linkImage ?? existing.contactAvatar,
            protocol: chat.protocol ?? existing.protocol,
            sectorId: chat.currentSector?.id ?? existing.sectorId,
            metadata: {
              ...((existing.metadata as any) ?? {}),
              remote: chat,
              queue: remoteQueue(chat),
              connection: effectiveConnection ? {
                id: effectiveConnection.id,
                provider: effectiveConnection.provider,
                channel: effectiveConnection.channel,
                official: isOfficialConnection(effectiveConnection),
              } : undefined,
            },
            updatedAt: new Date(),
          });
          updated++;
        } else {
          const localStatus = remoteStatus;
          await storage.createConversation({
            accountId: req.accountId!,
            connectionId: effectiveConnectionId,
            channel: "whatsapp",
            provider: effectiveConnection?.provider ?? "wescctech",
            externalThreadId,
            externalContactId: contactNumber ?? externalThreadId,
            contactName: remoteContactName(chat) ?? "Desconhecido",
            contactPhone: contactNumber,
            contactAvatar: chat.photo ?? chat.linkImage ?? chat.contact?.linkImage ?? null,
            status: localStatus,
            mode: modeForStatus(localStatus),
            lastMessagePreview: remoteLastMessagePreview(chat),
            lastMessageAt: remoteLastMessageDate(chat),
            lastCustomerActivityAt: resolveLastCustomerActivityAt({ remoteChat: chat }),
            unreadCount: chat.unread ?? chat.countUnreadMessages ?? 0,
            protocol: chat.protocol ?? null,
            sectorId: chat.currentSector?.id ?? null,
            metadata: {
              remote: chat,
              queue: remoteQueue(chat),
              connection: effectiveConnection ? {
                id: effectiveConnection.id,
                provider: effectiveConnection.provider,
                channel: effectiveConnection.channel,
                official: isOfficialConnection(effectiveConnection),
              } : undefined,
            },
          });
          created++;
        }
      }

      const result = { synced: chats.length, created, updated, remoteResults };
      await recordAttendanceEvent(req, "sync.completed", {
        entityType: "sync",
        metadata: result,
        realtimeType: "attendance.sync.completed",
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== CONVERSATIONS =====================

  app.get("/api/attendance/conversations", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const { channel, status, search, assignedUserId, sectorId, queueId, mode, priority, from, to, queue, includeArchived, page, pageSize } = req.query as Record<string, string>;
      const requestedPage = Math.max(1, Number(page) || 1);
      const requestedPageSize = pageSize ? Math.min(200, Math.max(1, Number(pageSize) || 50)) : null;
      const offset = requestedPageSize ? (requestedPage - 1) * requestedPageSize : undefined;
      let convs = await storage.getConversations(req.accountId!, { channel, status, search, assignedUserId, sectorId, queueId, mode, priority, from, to, limit: requestedPageSize ? requestedPageSize + 1 : undefined, offset });
      if (includeArchived !== "true") {
        convs = convs.filter(conv => !((conv.metadata as any)?.flags?.archived));
      }
      if (queue && queue !== "all") {
        convs = convs.filter(conv => ((conv.metadata as any)?.queue ?? remoteQueue((conv.metadata as any)?.remote)) === queue);
      }
      convs = convs.sort((a, b) => Number(Boolean((b.metadata as any)?.flags?.pinned)) - Number(Boolean((a.metadata as any)?.flags?.pinned)));
      if (requestedPageSize) {
        const hasNextPage = convs.length > requestedPageSize;
        return res.json({ data: convs.slice(0, requestedPageSize), page: requestedPage, pageSize: requestedPageSize, hasNextPage });
      }
      res.json(convs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/create-new", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const { phone, name, connectionId, sectorId, message, sendInitialMessage, templateId, templateName, templateLanguage, templateComponents } = req.body;
      if (!phone) return res.status(400).json({ error: "Telefone obrigatório" });

      if (templateId || templateName) {
        const availableTemplates = await resolveAttendanceTemplates(req.accountId!, connectionId);
        const selectedTemplate = availableTemplates.find((template: any) => template.id === templateId || template.name === templateName);
        if (!selectedTemplate) return res.status(400).json({ error: "Template não encontrado ou indisponível para esta conexão" });
        prepareAttendanceTemplateSend(selectedTemplate, templateComponents, message);
      }

      let externalId: string | null = null;
      const token = await getWesccToken(req.accountId!, connectionId);
      const connection = connectionId ? await storage.getChannelConnection(connectionId, req.accountId!) : null;
      if (token) {
        try {
          const chat = await wescctech.createChat(token, phone);
          externalId = remoteChatId(chat);
        } catch (err: any) {
          console.error("[ATT] create-new remote error:", err.message);
        }
      }

      const initiatedAt = new Date();
      const conv = await storage.createConversation({
        accountId: req.accountId!,
        connectionId: connectionId ?? null,
        channel: connection?.channel ?? "whatsapp",
        provider: connection?.provider ?? (token ? "wescctech" : null),
        externalThreadId: externalId,
        externalContactId: phone,
        contactName: name ?? phone,
        contactPhone: phone,
        sectorId: sectorId || null,
        mode: "manual",
        status: "in_progress",
        assignedUserId: req.userId!,
        assignedByUserId: req.userId!,
        assignedAt: initiatedAt,
        lastOperatorActivityAt: initiatedAt,
        metadata: connection ? {
          connection: {
            id: connection.id,
            name: connection.name,
            channel: connection.channel,
            provider: connection.provider,
            official: isOfficialConnection(connection),
          },
        } : undefined,
      });
      await syncAttendanceContact(req.accountId!, req.userId!, conv);

      const initialText = String(message ?? "").trim();
      if (templateId || templateName) {
        await sendTemplateToConversation(req, conv, {
          connection,
          templateId,
          templateName,
          templateLanguage,
          templateComponents,
          fallbackText: initialText,
        });
      } else if (sendInitialMessage && initialText) {
        const msg = await storage.createMessage({
          accountId: req.accountId!,
          conversationId: conv.id,
          userId: req.userId!,
          direction: "outbound",
          channel: conv.channel,
          provider: conv.provider,
          body: initialText,
          messageType: "text",
          status: "sent",
        });
        if (token) {
          wescctech.sendText(token, { number: phone, message: initialText }).catch((err: any) => {
            console.error("[ATT] create-new initial send error:", err.message);
          });
        }
        await storage.updateConversation(conv.id, req.accountId!, {
          lastMessageAt: new Date(),
          lastMessagePreview: initialText.slice(0, 100),
          lastOperatorActivityAt: new Date(),
          firstResponseAt: new Date(),
        });
        await recordAttendanceEvent(req, "message.sent", {
          conversationId: conv.id,
          messageId: msg.id,
          entityType: "message",
          entityId: msg.id,
          after: msg,
          realtimeType: "attendance.message.created",
        });
      }
      await recordAttendanceEvent(req, "conversation.created", {
        conversationId: conv.id,
        after: conv,
        metadata: { source: "manual" },
        realtimeType: "attendance.conversation.created",
      });
      res.json(conv);
    } catch (e: any) {
      if (e instanceof TemplateVariablesRequiredError || e?.code === "TEMPLATE_VARIABLES_REQUIRED") {
        return res.status(400).json({ error: e.message, code: "TEMPLATE_VARIABLES_REQUIRED", missingVariables: e.missingVariables ?? [] });
      }
      res.status(400).json({ error: e.message });
    }
  });

  /**
   * GET /api/attendance/templates?connectionId=<uuid>
   * Lists templates normalized for the attendance UI. The selected connection
   * determines whether the source is Meta Official, WHU action cards, or local
   * quick replies. Requires an authenticated user with attendance read access.
   */
  app.get("/api/attendance/templates", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : undefined;
      const templates = await resolveAttendanceTemplates(req.accountId!, connectionId);
      res.json(templates);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/contacts", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      await syncAttendanceContacts(req.accountId!, req.userId!);
      const tag = typeof req.query.tag === "string" ? req.query.tag : "";
      const contacts = await storage.getContacts(req.accountId!);
      res.json(contacts
        .filter(contact => contact.source === "Atendimento" || contact.phone)
        .filter(contact => !tag || (contact.interests ?? []).includes(tag))
      );
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/contacts/import-platform", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncAttendanceContacts(req.accountId!, req.userId!);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/contacts/import-list", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const contacts = z.array(z.object({
        name: z.string().min(1),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        interests: z.array(z.string()).optional().nullable(),
        notes: z.string().optional().nullable(),
      })).min(1).parse(req.body.contacts);

      let imported = 0;
      let updated = 0;
      const existing = await storage.getContacts(req.accountId!);
      for (const item of contacts) {
        const phone = normalizePhone(item.phone);
        const current = phone ? existing.find(contact => normalizePhone(contact.phone) === phone) : null;
        const payload = {
          name: item.name.trim(),
          phone: phone || item.phone || undefined,
          email: item.email || undefined,
          city: item.city || undefined,
          state: item.state || undefined,
          interests: item.interests?.filter(Boolean) ?? undefined,
          notes: item.notes || undefined,
          source: "Atendimento",
        };
        if (current) {
          await storage.updateContact(current.id, req.accountId!, payload as any);
          await storage.setContactLabels(req.accountId!, current.id, item.interests?.filter(Boolean) ?? []);
          updated++;
        } else {
          const created = await storage.createContact({ ...payload, userId: req.userId!, accountId: req.accountId! } as any);
          await storage.setContactLabels(req.accountId!, created.id, item.interests?.filter(Boolean) ?? []);
          existing.push(created);
          imported++;
        }
      }
      res.json({ imported, updated, total: contacts.length });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/contacts/import-file", authenticateToken, requireAttendanceRead(), attendanceUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      const mapping = typeof req.body.mapping === "string"
        ? JSON.parse(req.body.mapping || "{}")
        : (req.body.mapping ?? {});
      const rows = await uploadedRows(req.file);
      const job = await storage.createImportJob({
        accountId: req.accountId!,
        userId: req.userId!,
        type: "contacts",
        fileName: req.file?.originalname,
        status: "processing",
        totalRows: rows.length,
        processedRows: 0,
        mapping,
        metadata: { mimeType: req.file?.mimetype },
      } as any);

      let imported = 0;
      let updated = 0;
      let failed = 0;
      const errors: any[] = [];
      const existing = await storage.getContacts(req.accountId!);

      for (let index = 0; index < rows.length; index++) {
        try {
          const item = mapImportedContact(rows[index], mapping);
          if (!item.name && !item.phone && !item.email) throw new Error("Linha sem nome, telefone ou email");
          const phone = normalizePhone(item.phone);
          const current = existing.find(contact =>
            (phone && normalizePhone(contact.phone) === phone) ||
            (item.email && contact.email?.toLowerCase() === item.email.toLowerCase())
          );
          const payload = {
            name: item.name || item.phone || item.email || "Contato sem nome",
            phone: phone || item.phone || undefined,
            email: item.email || undefined,
            city: item.city || undefined,
            state: item.state || undefined,
            interests: item.interests,
            source: item.channel || "Atendimento",
            notes: [item.notes, item.company ? `Empresa: ${item.company}` : "", item.position ? `Cargo: ${item.position}` : ""].filter(Boolean).join("\n"),
          };
          if (current) {
            await storage.updateContact(current.id, req.accountId!, payload as any);
            await storage.setContactLabels(req.accountId!, current.id, item.interests);
            updated++;
          } else {
            const created = await storage.createContact({ ...payload, userId: req.userId!, accountId: req.accountId! } as any);
            await storage.setContactLabels(req.accountId!, created.id, item.interests);
            existing.push(created);
            imported++;
          }
        } catch (error: any) {
          failed++;
          errors.push({ row: index + 2, error: error.message });
        }
      }

      const done = await storage.updateImportJob(job.id, req.accountId!, {
        status: failed > 0 ? "completed_with_errors" : "completed",
        processedRows: rows.length,
        importedRows: imported,
        updatedRows: updated,
        failedRows: failed,
        errors,
      } as any);
      await recordAttendanceEvent(req, "contacts.imported", {
        entityType: "import_job",
        entityId: done.id,
        after: done,
        metadata: { imported, updated, failed },
        realtimeType: "attendance.contacts.updated",
      });
      res.json(done);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/import-jobs/:id", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const job = await storage.getImportJob(req.params.id, req.accountId!);
      if (!job) return res.status(404).json({ error: "ImportaÃ§Ã£o nÃ£o encontrada" });
      res.json(job);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/contacts/export", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      await syncAttendanceContacts(req.accountId!, req.userId!);
      const tag = typeof req.query.tag === "string" ? req.query.tag : "";
      const contacts = await storage.getContacts(req.accountId!);
      const rows = contacts
        .filter(contact => contact.source === "Atendimento" || contact.phone)
        .filter(contact => !tag || (contact.interests ?? []).includes(tag))
        .map(contact => [
          contact.name,
          contact.phone ?? "",
          contact.email ?? "",
          contact.city ?? "",
          contact.state ?? "",
          (contact.interests ?? []).join("|"),
          contact.source ?? "",
          contact.notes ?? "",
        ]);
      const csv = [
        ["Nome", "Telefone", "Email", "Cidade", "Estado", "Etiquetas", "Origem", "Observacoes"],
        ...rows,
      ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=contatos-atendimento.csv");
      res.send(csv);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/contacts", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact({ ...validated, userId: req.userId!, accountId: req.accountId! });
      if (validated.interests) await storage.setContactLabels(req.accountId!, contact.id, validated.interests);
      res.json(contact);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/contacts/:id", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const validated = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(req.params.id, req.accountId!, validated);
      if (validated.interests) await storage.setContactLabels(req.accountId!, req.params.id, validated.interests);
      res.json(contact);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/contacts/:id/labels", authenticateToken, requireAnyPermission("attendanceManageTags", "attendanceView"), async (req: AuthRequest, res: Response) => {
    try {
      const tags = z.array(z.string()).parse(req.body.tags ?? req.body.labels ?? []);
      const labels = await storage.setContactLabels(req.accountId!, req.params.id, tags);
      await recordAttendanceEvent(req, "contact.labels.updated", {
        entityType: "contact",
        entityId: req.params.id,
        after: labels,
        realtimeType: "attendance.contacts.updated",
      });
      res.json(labels);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/labels", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      await syncLegacyLabels(req.accountId!);
      res.json(await storage.getLabels(req.accountId!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/labels", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const data = z.object({
        name: z.string().min(1),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14b8a6"),
      }).parse(req.body);
      const label = await storage.upsertLabel(req.accountId!, data);
      await recordAttendanceEvent(req, "label.created", {
        entityType: "label",
        entityId: label.id,
        after: label,
        realtimeType: "attendance.settings.updated",
      });
      res.json(label);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.put("/api/attendance/labels", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const labels = z.array(z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })).parse(req.body.labels).map(label => ({
        id: label.id,
        name: label.name.trim(),
        color: label.color,
      }));
      const previous = await storage.getLabels(req.accountId!);
      const saved = [];
      for (const label of labels) {
        saved.push(label.id
          ? await storage.updateLabel(label.id, req.accountId!, { name: label.name, color: label.color, active: true } as any)
          : await storage.upsertLabel(req.accountId!, label));
      }
      for (const old of previous) {
        if (!labels.some(label => label.id === old.id || label.name.toLowerCase() === old.name.toLowerCase())) {
          await storage.deleteLabel(old.id, req.accountId!);
        }
      }
      await recordAttendanceEvent(req, "labels.updated", {
        entityType: "label",
        after: saved,
        realtimeType: "attendance.settings.updated",
      });
      res.json(saved);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/labels/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const data = z.object({
        name: z.string().min(1).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }).parse(req.body);
      const label = await storage.updateLabel(req.params.id, req.accountId!, data as any);
      await recordAttendanceEvent(req, "label.updated", {
        entityType: "label",
        entityId: label.id,
        after: label,
        realtimeType: "attendance.settings.updated",
      });
      res.json(label);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/labels/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteLabel(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "label.deleted", {
        entityType: "label",
        entityId: req.params.id,
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/history", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const conversations = await storage.getConversations(req.accountId!, {
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      });
      const finished = conversations.filter(conv => ["resolved", "finalized", "closed"].includes(conv.status));
      res.json(finished);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/history/export", authenticateToken, requireAnyPermission("attendanceFullHistory", "attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const format = String(req.query.format ?? "csv").toLowerCase();
      const conversations = await storage.getConversations(req.accountId!, {
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      });
      const finished = conversations.filter(conv => ["resolved", "finalized", "closed"].includes(conv.status));
      const rows = [
        ["Codigo", "Contato", "Telefone", "Email", "Canal", "Status", "Modo", "Etiquetas", "Aberto em", "Finalizado em", "Responsavel"],
        ...finished.map(conv => [
          conv.attendanceCode ?? conv.protocol ?? conv.id,
          conv.contactName ?? "",
          conv.contactPhone ?? "",
          conv.contactEmail ?? "",
          conv.channel,
          conv.status,
          conv.mode,
          (conv.tags ?? []).join("|"),
          conv.createdAt ? new Date(conv.createdAt).toISOString() : "",
          (conv.closedAt ?? conv.resolvedAt) ? new Date((conv.closedAt ?? conv.resolvedAt) as any).toISOString() : "",
          conv.assignedUserId ?? "",
        ]),
      ];

      if (format === "json") return res.json(finished);
      if (format === "xlsx" || format === "excel") {
        const buffer = await rowsToXlsxBuffer(rows, "Historico");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=historico-atendimentos.xlsx");
        return res.send(buffer);
      }
      if (format === "pdf") return sendPdf(res, "historico-atendimentos.pdf", "Historico de atendimentos", rows);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=historico-atendimentos.csv");
      res.send(toCsv(rows));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/history/import", authenticateToken, requirePermission("attendanceSettings"), attendanceUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      const rows = await uploadedRows(req.file);
      const job = await storage.createImportJob({
        accountId: req.accountId!,
        userId: req.userId!,
        type: "history",
        fileName: req.file?.originalname,
        status: "completed",
        totalRows: rows.length,
        processedRows: rows.length,
        metadata: { rowsPreview: rows.slice(0, 20), mimeType: req.file?.mimetype },
      } as any);
      await recordAttendanceEvent(req, "history.imported", {
        entityType: "import_job",
        entityId: job.id,
        after: job,
        realtimeType: "attendance.history.imported",
      });
      res.json(job);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/history/:conversationId", authenticateToken, requireAnyPermission("attendanceFullHistory", "attendanceAudit", "attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.conversationId, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa nao encontrada" });
      const [messages, notes, events, transfers] = await Promise.all([
        storage.getMessages(conv.id, req.accountId!),
        storage.getNotes(conv.id, req.accountId!),
        storage.getAttendanceEvents(req.accountId!, { conversationId: conv.id, limit: 1000 }),
        storage.getTransfers(conv.id, req.accountId!),
      ]);
      res.json({ conversation: conv, messages, notes, events, transfers });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/archived", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const { search, channel, status, from, to } = req.query as Record<string, string>;
      const conversations = await storage.getConversations(req.accountId!, {
        archived: true,
        search,
        channel,
        status,
        from,
        to,
      });
      res.json(conversations);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/archive", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa nao encontrada" });
      const metadata = before.metadata as any ?? {};
      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        metadata: {
          ...metadata,
          flags: { ...(metadata.flags ?? {}), archived: true },
          archivedAt: new Date().toISOString(),
          archivedByUserId: req.userId,
          archiveReason: req.body?.reason ?? null,
        },
        updatedAt: new Date(),
      } as any);
      await recordAttendanceEvent(req, "conversation.archived", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/restore", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa nao encontrada" });
      const metadata = before.metadata as any ?? {};
      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        metadata: {
          ...metadata,
          flags: { ...(metadata.flags ?? {}), archived: false },
          restoredAt: new Date().toISOString(),
          restoredByUserId: req.userId,
        },
        updatedAt: new Date(),
      } as any);
      await recordAttendanceEvent(req, "conversation.restored", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/conversations/:id", authenticateToken, requireAnyPermission("attendanceAudit", "attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa nao encontrada" });
      const metadata = before.metadata as any ?? {};
      const tombstone = {
        deletedAt: new Date().toISOString(),
        deletedByUserId: req.userId,
        reason: req.body?.reason ?? null,
        preserved: {
          id: before.id,
          attendanceCode: before.attendanceCode,
          protocol: before.protocol,
          contactPhone: before.contactPhone,
          channel: before.channel,
          status: before.status,
          createdAt: before.createdAt,
        },
      };
      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        metadata: {
          ...metadata,
          flags: { ...(metadata.flags ?? {}), archived: true },
          tombstone,
        },
        updatedAt: new Date(),
      } as any);
      await recordAttendanceEvent(req, "conversation.tombstoned", {
        conversationId: updated.id,
        before,
        after: updated,
        metadata: { tombstone },
        realtimeType: "attendance.conversation.deleted",
      });
      res.json({ success: true, tombstone });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/conversations/:id/messages", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      const beforeRaw = typeof req.query.before === "string" ? req.query.before : undefined;
      const before = beforeRaw ? new Date(beforeRaw) : undefined;
      if (before && Number.isNaN(before.getTime())) return res.status(400).json({ error: "Cursor de mensagens inválido" });
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      res.json(await storage.getMessagesPage(conv.id, req.accountId!, { before, limit }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/attendance/conversations/:id", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      let conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      const requestedMessagePageSize = req.query.messagePageSize ? Math.min(100, Math.max(1, Number(req.query.messagePageSize) || 50)) : null;
      if (conv.externalThreadId) {
        await syncConversationMessages(req.accountId!, conv).catch((err) => {
          console.error("[ATT] message sync error:", err.message);
        });
        conv = await storage.getConversation(req.params.id, req.accountId!) ?? conv;
      }
      const [messageResult, notes, connection] = await Promise.all([
        requestedMessagePageSize
          ? storage.getMessagesPage(req.params.id, req.accountId!, { limit: requestedMessagePageSize })
          : storage.getMessages(req.params.id, req.accountId!),
        storage.getNotes(req.params.id, req.accountId!),
        conv.connectionId ? storage.getChannelConnection(conv.connectionId, req.accountId!) : Promise.resolve(null),
      ]);
      const metaWindow = getMetaWindowState({ connection, conversation: conv });
      if (requestedMessagePageSize) {
        const page = messageResult as { data: AttMessage[]; hasMore: boolean; nextCursor: string | null };
        res.json({ ...conv, metaWindow, messages: page.data, notes, hasOlderMessages: page.hasMore, messageCursor: page.nextCursor });
      } else {
        res.json({ ...conv, metaWindow, messages: messageResult, notes });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/assume", authenticateToken, requirePermission("attendanceAssume"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      assertAttendanceTransition(before.status, "in_progress");
      if (before.assignedUserId === req.userId) return res.json(before);
      const { conversation: conv, conflict } = await storage.assumeConversation(req.params.id, req.accountId!, req.userId!, req.userId!);
      if (!conv) {
        return res.status(409).json({
          error: "Este atendimento já foi assumido por outro operador.",
          assignedUserId: conflict?.assignedUserId ?? null,
        });
      }
      await recordAttendanceEvent(req, "conversation.assumed", {
        conversationId: conv.id,
        before,
        after: conv,
        metadata: { assignedUserId: req.userId },
        realtimeType: "attendance.conversation.updated",
      });
      const user = req.userId ? await storage.getUser(req.userId) : null;
      const systemBody = `Atendimento assumido por ${user?.name ?? "operador"}`;
      const systemMsg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: conv.id,
        userId: req.userId!,
        direction: "internal",
        channel: conv.channel,
        provider: conv.provider,
        body: systemBody,
        messageType: "system",
        status: "sent",
        metadata: { action: "conversation.assumed", userId: req.userId, userName: user?.name ?? null },
      });
      await recordAttendanceEvent(req, "message.system.created", {
        conversationId: conv.id,
        messageId: systemMsg.id,
        entityType: "message",
        entityId: systemMsg.id,
        after: systemMsg,
        metadata: { action: "conversation.assumed", userId: req.userId, userName: user?.name ?? null },
        realtimeType: "attendance.message.created",
      });
      res.json(conv);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/release", authenticateToken, requirePermission("attendanceRelease"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      assertAttendanceTransition(before.status, "waiting_agent");
      if (before.assignedUserId && before.assignedUserId !== req.userId && !hasPermission(req, "attendanceReplyAny")) {
        return res.status(403).json({ error: "Somente o responsável ou supervisor pode liberar este atendimento" });
      }
      const metadata = { ...((before.metadata as any) ?? {}), releasedAt: new Date().toISOString(), releasedBy: req.userId };
      let updated = await storage.releaseConversation(req.params.id, req.accountId!, { status: "waiting_agent", metadata });
      updated = await autoRouteConversation(req.accountId!, updated);
      await recordAttendanceEvent(req, "conversation.released", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/pause", authenticateToken, requirePermission("attendancePause"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      assertAttendanceTransition(before.status, "paused");
      if (before.assignedUserId && before.assignedUserId !== req.userId && !hasPermission(req, "attendanceReplyAny")) {
        return res.status(403).json({ error: "Somente o responsável ou supervisor pode pausar este atendimento" });
      }
      const metadata = { ...((before.metadata as any) ?? {}), paused: true, pausedAt: new Date().toISOString(), pausedBy: req.userId };
      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        mode: "manual",
        status: "paused",
        metadata,
        updatedAt: new Date(),
      });
      await recordAttendanceEvent(req, "conversation.paused", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/attendance/conversations/:id/flags", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        favorite: z.boolean().optional(),
      });
      const flags = schema.parse(req.body);
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      const previousMetadata = (before.metadata as any) ?? {};
      const metadata = { ...previousMetadata, flags: { ...(previousMetadata.flags ?? {}), ...flags } };
      const updated = await storage.updateConversation(req.params.id, req.accountId!, { metadata, updatedAt: new Date() });
      await recordAttendanceEvent(req, "conversation.flags.updated", {
        conversationId: updated.id,
        before,
        after: updated,
        metadata: flags,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/send", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const { message, isWhisper = false } = req.body;
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }

      const normalizedMessage = String(message ?? "").trim();
      if (!normalizedMessage) {
        return res.status(400).json({ error: "Mensagem não pode ser vazia" });
      }

      const connection = conv.connectionId
        ? await storage.getChannelConnection(conv.connectionId, req.accountId!)
        : null;
      const replyPolicy = evaluatePublicReplyPolicy({ conversation: conv, connection, isWhisper });
      if (!replyPolicy.allowed) {
        return res.status(409).json({
          error: replyPolicy.error,
          code: replyPolicy.code,
          metaWindow: replyPolicy.metaWindow,
        });
      }

      let externalMessageId: string | null = null;
      if (!isWhisper) {
        if (!conv.externalContactId) {
          return res.status(400).json({ error: "Contato externo não identificado para envio" });
        }
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (!token) {
          return res.status(400).json({ error: "Conexão WHU não configurada para este atendimento" });
        }
        try {
          const remoteMessage = await wescctech.sendText(token, {
            number: conv.externalContactId,
            message: normalizedMessage,
            isWhisper: false,
          });
          externalMessageId = remoteMessageId(remoteMessage);
        } catch (error: any) {
          console.error("[ATT] send error:", error.message);
          return res.status(502).json({ error: "Não foi possível enviar a mensagem pelo WHU. Tente novamente." });
        }
      }

      const existingRemoteMessage = externalMessageId
        ? await storage.getMessageByExternalId(externalMessageId, req.accountId!)
        : null;
      const msg = existingRemoteMessage ?? await storage.createMessage({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        direction: isWhisper ? "internal" : "outbound",
        channel: conv.channel,
        provider: conv.provider,
        externalMessageId,
        body: normalizedMessage,
        messageType: isWhisper ? "whisper" : "text",
        status: "sent",
        errorMessage: null,
      });

      await storage.updateConversation(req.params.id, req.accountId!, {
        lastMessageAt: new Date(),
        lastMessagePreview: normalizedMessage.slice(0, 100),
        lastOperatorActivityAt: new Date(),
        firstResponseAt: conv.firstResponseAt ?? new Date(),
        updatedAt: new Date(),
      });

      await recordAttendanceEvent(req, isWhisper ? "message.internal.created" : "message.sent", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        metadata: {},
        realtimeType: "attendance.message.created",
      });

      res.json(msg);

    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/send-template", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }
      const msg = await sendTemplateToConversation(req, conv, {
        templateId: req.body.templateId,
        templateName: req.body.templateName,
        templateLanguage: req.body.templateLanguage,
        templateComponents: req.body.templateComponents,
        fallbackText: req.body.message,
      });
      res.json(msg);
    } catch (e: any) {
      if (e instanceof TemplateVariablesRequiredError || e?.code === "TEMPLATE_VARIABLES_REQUIRED") {
        return res.status(400).json({ error: e.message, code: "TEMPLATE_VARIABLES_REQUIRED", missingVariables: e.missingVariables ?? [] });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/attendance/conversations/:id/send-whisper", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    req.body.isWhisper = true;
    // delegate to /send handler inline
    try {
      const { message } = req.body;
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }
      const msg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        direction: "internal",
        channel: conv.channel,
        externalMessageId: null,
        body: message,
        messageType: "whisper",
        status: "internal",
      });
      await storage.updateConversation(req.params.id, req.accountId!, {
        lastOperatorActivityAt: new Date(),
        updatedAt: new Date(),
      });
      await recordAttendanceEvent(req, "message.internal.created", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        realtimeType: "attendance.message.created",
      });
      res.json(msg);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/send-media", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const { mediaUrl, linkUrl, base64, caption, mimeType, fileName, extension } = req.body;
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }

      let externalMsgId: string | null = null;
      let sendError: string | null = null;
      if (conv.externalContactId) {
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (token) {
          try {
            const sent = await wescctech.sendMedia(token, {
              number: conv.externalContactId,
              linkUrl: linkUrl ?? mediaUrl,
              base64,
              caption,
              mimeType,
              fileName,
              extension,
            });
            externalMsgId = remoteMessageId(sent);
          } catch (err: any) {
            sendError = err.message;
          }
        }
      }
      const resolvedUrl = linkUrl ?? mediaUrl ?? null;
      const messageType = mimeType?.startsWith("image/")
        ? "image"
        : mimeType?.startsWith("video/")
          ? "video"
          : mimeType?.startsWith("audio/")
            ? "audio"
            : "document";

      const msg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        direction: "outbound",
        channel: conv.channel,
        provider: conv.provider,
        externalMessageId: externalMsgId,
        body: caption ?? null,
        messageType,
        mediaUrl: resolvedUrl,
        mimeType: mimeType ?? null,
        status: sendError ? "failed" : "sent",
        errorMessage: sendError,
      });

      await storage.createAttachment({
        accountId: req.accountId!,
        conversationId: req.params.id,
        messageId: msg.id,
        fileName: fileName ?? resolvedUrl?.split("/").pop() ?? "file",
        mimeType: mimeType ?? null,
        url: resolvedUrl ?? "base64",
      });

      await storage.updateConversation(req.params.id, req.accountId!, {
        lastMessageAt: new Date(),
        lastMessagePreview: caption ?? `[${messageType}]`,
        lastOperatorActivityAt: new Date(),
        firstResponseAt: conv.firstResponseAt ?? new Date(),
        updatedAt: new Date(),
      });

      await recordAttendanceEvent(req, "message.media.sent", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        metadata: { sendError, externalMessageId: externalMsgId, messageType },
        realtimeType: "attendance.message.created",
      });

      res.json(msg);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/send-location", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        description: z.string().min(1),
        latitude: z.coerce.number(),
        longitude: z.coerce.number(),
      });
      const data = schema.parse(req.body);
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }

      let externalMsgId: string | null = null;
      let sendError: string | null = null;
      if (conv.externalContactId) {
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (token) {
          try {
            const sent = await wescctech.sendLocation(token, {
              number: conv.externalContactId,
              ...data,
            });
            externalMsgId = remoteMessageId(sent);
          } catch (err: any) {
            sendError = err.message;
          }
        }
      }

      const msg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        direction: "outbound",
        channel: conv.channel,
        provider: conv.provider,
        externalMessageId: externalMsgId,
        body: data.description,
        messageType: "location",
        status: sendError ? "failed" : "sent",
        errorMessage: sendError,
        metadata: { location: data },
      });

      await storage.updateConversation(req.params.id, req.accountId!, {
        lastMessageAt: new Date(),
        lastMessagePreview: `[Localização] ${data.description}`,
        lastOperatorActivityAt: new Date(),
        firstResponseAt: conv.firstResponseAt ?? new Date(),
        updatedAt: new Date(),
      });

      await recordAttendanceEvent(req, "message.location.sent", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        metadata: { sendError, externalMessageId: externalMsgId },
        realtimeType: "attendance.message.created",
      });

      res.json(msg);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/send-contacts", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        contacts: z.array(z.object({ name: z.string().min(1), number: z.string().min(1) })).min(1),
      });
      const data = schema.parse(req.body);
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: replyBlockedMessage(conv) });
      }

      let externalMsgId: string | null = null;
      let sendError: string | null = null;
      if (conv.externalContactId) {
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (token) {
          try {
            const sent = await wescctech.sendContacts(token, {
              number: conv.externalContactId,
              contacts: data.contacts,
            });
            externalMsgId = remoteMessageId(sent);
          } catch (err: any) {
            sendError = err.message;
          }
        }
      }

      const preview = data.contacts.map((contact) => contact.name).join(", ");
      const msg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        direction: "outbound",
        channel: conv.channel,
        provider: conv.provider,
        externalMessageId: externalMsgId,
        body: preview,
        messageType: "contact",
        status: sendError ? "failed" : "sent",
        errorMessage: sendError,
        metadata: { contacts: data.contacts },
      });

      await storage.updateConversation(req.params.id, req.accountId!, {
        lastMessageAt: new Date(),
        lastMessagePreview: `[Contato] ${preview}`,
        lastOperatorActivityAt: new Date(),
        firstResponseAt: conv.firstResponseAt ?? new Date(),
        updatedAt: new Date(),
      });

      await recordAttendanceEvent(req, "message.contacts.sent", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        metadata: { sendError, externalMessageId: externalMsgId },
        realtimeType: "attendance.message.created",
      });

      res.json(msg);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/transfer", authenticateToken, requirePermission("attendanceTransfer"), async (req: AuthRequest, res: Response) => {
    try {
      const { sectorId, queueId, userId: targetUserId, reason } = req.body;
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canManageConversation(req, conv)) {
        return res.status(403).json({ error: manageBlockedMessage(conv) });
      }
      assertAttendanceTransition(conv.status, "transferred");
      if (targetUserId) {
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser || targetUser.accountId !== req.accountId) {
          return res.status(400).json({ error: "Responsável de destino inválido para esta conta" });
        }
      }
      if (queueId && !(await storage.getQueue(queueId, req.accountId!))) {
        return res.status(400).json({ error: "Fila de destino inválida para esta conta" });
      }
      if (sectorId) {
        const sectors = await storage.getSectors(req.accountId!);
        if (!sectors.some(sector => sector.id === sectorId)) {
          return res.status(400).json({ error: "Setor de destino inválido para esta conta" });
        }
      }
      if (!sectorId && conv.provider === "wescctech") {
        return res.status(400).json({ error: "Setor de destino é obrigatório para transferência WHU" });
      }

      if (conv.externalThreadId) {
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (token) {
          try {
            await wescctech.transferChat(token, conv.externalThreadId, { sectorId, userId: targetUserId });
          } catch (err: any) {
            console.error("[ATT] transfer remote error:", err.message);
            return res.status(502).json({ error: "Não foi possível transferir o atendimento no WHU. Nenhuma alteração local foi realizada." });
          }
        }
      }

      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        sectorId: sectorId ?? conv.sectorId,
        queueId: queueId ?? conv.queueId,
        assignedUserId: targetUserId ?? null,
        assignedAt: targetUserId ? new Date() : null,
        assignedByUserId: targetUserId ? req.userId! : null,
        mode: targetUserId ? "manual" : "automatic",
        status: "transferred",
        updatedAt: new Date(),
      });
      const transfer = await storage.createTransfer({
        accountId: req.accountId!,
        conversationId: conv.id,
        fromUserId: conv.assignedUserId,
        toUserId: targetUserId ?? null,
        fromSectorId: conv.sectorId,
        toSectorId: sectorId ?? conv.sectorId,
        fromQueueId: conv.queueId,
        toQueueId: queueId ?? conv.queueId,
        reason: reason ?? null,
        createdByUserId: req.userId!,
      } as any);
      await recordAttendanceEvent(req, "conversation.transferred", {
        conversationId: conv.id,
        before: conv,
        after: updated,
        metadata: { sectorId, queueId, targetUserId, reason, transferId: transfer.id },
        realtimeType: "attendance.conversation.updated",
      });
      const transferUser = req.userId ? await storage.getUser(req.userId) : null;
      const targetUser = targetUserId ? await storage.getUser(targetUserId) : null;
      const transferBody = targetUser
        ? `Atendimento transferido para ${targetUser.name ?? targetUserId}`
        : sectorId
          ? "Atendimento transferido para o setor"
          : "Atendimento transferido para a fila";
      const transferMsg = await storage.createMessage({
        accountId: req.accountId!,
        conversationId: conv.id,
        userId: req.userId!,
        direction: "internal",
        channel: conv.channel,
        provider: conv.provider,
        body: transferBody,
        messageType: "system",
        status: "sent",
        metadata: { action: "conversation.transferred", userId: req.userId, userName: transferUser?.name ?? null, targetUserId, targetUserName: targetUser?.name ?? null },
      });
      await recordAttendanceEvent(req, "message.system.created", {
        conversationId: conv.id,
        messageId: transferMsg.id,
        entityType: "message",
        entityId: transferMsg.id,
        after: transferMsg,
        metadata: { action: "conversation.transferred", userId: req.userId, targetUserId },
        realtimeType: "attendance.message.created",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/close", authenticateToken, requirePermission("attendanceClose"), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canManageConversation(req, conv)) {
        return res.status(403).json({ error: manageBlockedMessage(conv) });
      }
      assertAttendanceTransition(conv.status, "finalized");

      if (conv.externalThreadId) {
        const token = await getWesccToken(req.accountId!, conv.connectionId ?? undefined);
        if (token) {
          try {
            await wescctech.finalizeChat(token, conv.externalThreadId);
          } catch (err: any) {
            console.error("[ATT] finalize remote error:", err.message);
            return res.status(502).json({ error: "Não foi possível finalizar o atendimento no WHU. Nenhuma alteração local foi realizada." });
          }
        }
      }

      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        status: "finalized",
        mode: "manual",
        resolvedAt: new Date(),
        closedAt: new Date(),
        updatedAt: new Date(),
      });
      await recordAttendanceEvent(req, "conversation.closed", {
        conversationId: conv.id,
        before: conv,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/reopen", authenticateToken, requirePermission("attendanceReopen"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canManageConversation(req, before)) {
        return res.status(403).json({ error: manageBlockedMessage(before) });
      }
      if (!isFinalAttendanceStatus(before.status)) {
        return res.status(409).json({ error: "Somente atendimentos finalizados podem ser reabertos" });
      }
      assertAttendanceTransition(before.status, "reopened");
      const updated = await storage.updateConversation(req.params.id, req.accountId!, {
        status: "reopened",
        mode: "manual",
        resolvedAt: null,
        closedAt: null,
        updatedAt: new Date(),
      });
      await recordAttendanceEvent(req, "conversation.reopened", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/protocol", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      if (before.protocol) return res.json(before);
      const protocol = `ATD-${Date.now().toString(36).toUpperCase()}`;
      const updated = await storage.updateConversation(req.params.id, req.accountId!, { protocol, updatedAt: new Date() });
      await recordAttendanceEvent(req, "conversation.protocol.generated", {
        conversationId: updated.id,
        before,
        after: updated,
        metadata: { protocol },
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/summary", authenticateToken, requireAnyPermission("attendanceFullHistory", "attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const { summary } = req.body;
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      const updated = await storage.updateConversation(req.params.id, req.accountId!, { summary, updatedAt: new Date() });
      await recordAttendanceEvent(req, "conversation.summary.updated", {
        conversationId: updated.id,
        before,
        after: updated,
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/attendance/conversations/:id/metadata", authenticateToken, requireAnyPermission("attendanceChangePriority", "attendanceChangeAssignee", "attendanceManageTags"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      const allowed = ["priority", "tags", "sectorId", "assignedUserId", "aiEnabled", "sentiment", "summary"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      }
      if (patch.priority !== undefined && !hasPermission(req, "attendanceChangePriority")) {
        return res.status(403).json({ error: "Sem permissão para alterar prioridade" });
      }
      if ((patch.assignedUserId !== undefined || patch.sectorId !== undefined) && !hasPermission(req, "attendanceChangeAssignee")) {
        return res.status(403).json({ error: "Sem permissão para alterar responsável ou setor" });
      }
      if (patch.tags !== undefined && !hasPermission(req, "attendanceManageTags")) {
        return res.status(403).json({ error: "Sem permissão para alterar etiquetas" });
      }
      patch.updatedAt = new Date();
      let updated = await storage.updateConversation(req.params.id, req.accountId!, patch);
      if (patch.tags !== undefined) {
        await storage.setConversationLabels(req.accountId!, req.params.id, patch.tags);
        if (updated.contactId) await storage.setContactLabels(req.accountId!, updated.contactId, patch.tags);
        updated = await storage.getConversation(req.params.id, req.accountId!) ?? updated;
      }
      await recordAttendanceEvent(req, "conversation.metadata.updated", {
        conversationId: updated.id,
        before,
        after: updated,
        metadata: { changedKeys: Object.keys(patch).filter(key => key !== "updatedAt") },
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/attendance/conversations/:id/labels", authenticateToken, requirePermission("attendanceManageTags"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getConversation(req.params.id, req.accountId!);
      if (!before) return res.status(404).json({ error: "Conversa não encontrada" });
      const tags = z.array(z.string()).parse(req.body.tags ?? req.body.labels ?? []);
      const labels = await storage.setConversationLabels(req.accountId!, req.params.id, tags);
      if (before.contactId) await storage.setContactLabels(req.accountId!, before.contactId, tags);
      const updated = await storage.getConversation(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "conversation.labels.updated", {
        conversationId: req.params.id,
        entityType: "conversation",
        entityId: req.params.id,
        before,
        after: updated,
        metadata: { labels },
        realtimeType: "attendance.conversation.updated",
      });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/contact", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });

      const { name, phone, email, city, state, notes } = req.body;
      const tags = Array.isArray(req.body.tags)
        ? req.body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
        : undefined;
      let contactId = conv.contactId;

      if (contactId) {
        await storage.updateContact(contactId, req.accountId!, { name, phone, email, city, state, notes, ...(tags ? { interests: tags } : {}) });
      } else {
        const contact = await storage.createContact({
          name: name ?? conv.contactName ?? "Desconhecido",
          phone: phone ?? conv.contactPhone,
          email: email ?? conv.contactEmail,
          city, state, notes,
          interests: tags,
          accountId: req.accountId!,
          userId: req.userId!,
        });
        contactId = contact.id;
      }

      let updated = await storage.updateConversation(req.params.id, req.accountId!, {
        contactId,
        contactName: name ?? conv.contactName,
        contactPhone: phone ?? conv.contactPhone,
        contactEmail: email ?? conv.contactEmail,
        tags: tags ?? conv.tags,
        metadata: {
          ...((conv.metadata as any) ?? {}),
          contactProfile: { city, state, notes },
        },
        updatedAt: new Date(),
      });
      if (tags !== undefined) {
        await storage.setContactLabels(req.accountId!, contactId, tags);
        await storage.setConversationLabels(req.accountId!, req.params.id, tags);
        updated = await storage.getConversation(req.params.id, req.accountId!) ?? updated;
      }

      await recordAttendanceEvent(req, "conversation.contact.updated", {
        conversationId: req.params.id,
        before: conv,
        after: updated,
        entityType: "contact",
        entityId: contactId,
        metadata: { contactId },
        realtimeType: "attendance.conversation.updated",
      });
      res.json({ success: true, contactId, conversation: updated });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/conversations/:id/history", authenticateToken, requireAnyPermission("attendanceFullHistory", "attendanceAudit", "attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      const [messages, notes, events, transfers] = await Promise.all([
        storage.getMessages(req.params.id, req.accountId!),
        storage.getNotes(req.params.id, req.accountId!),
        storage.getAttendanceEvents(req.accountId!, { conversationId: req.params.id, limit: 1000 }),
        storage.getTransfers(req.params.id, req.accountId!),
      ]);
      res.json({ conversation: conv, messages, notes, events, transfers });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/messages/search", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const { q, conversationId, from, to, limit } = req.query as Record<string, string>;
      const messages = await storage.searchMessages(req.accountId!, {
        q,
        conversationId,
        from,
        to,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(messages);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/audit", authenticateToken, requireAnyPermission("attendanceAudit", "attendanceFullHistory"), async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId, userId, action, from, to, limit } = req.query as Record<string, string>;
      const events = await storage.getAttendanceEvents(req.accountId!, {
        conversationId,
        userId,
        action,
        from,
        to,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(events);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== NOTES =====================

  app.get("/api/attendance/conversations/:id/notes", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const notes = await storage.getNotes(req.params.id, req.accountId!);
      res.json(notes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/conversations/:id/notes", authenticateToken, requirePermission("attendanceReply"), async (req: AuthRequest, res: Response) => {
    try {
      const { note } = req.body;
      if (!note?.trim()) return res.status(400).json({ error: "Nota não pode ser vazia" });
      const conv = await storage.getConversation(req.params.id, req.accountId!);
      if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
      if (!canReplyConversation(req, conv)) {
        return res.status(403).json({ error: "Somente o responsável pode adicionar notas neste atendimento" });
      }
      const created = await storage.createNote({
        accountId: req.accountId!,
        conversationId: req.params.id,
        userId: req.userId!,
        note,
      });
      await recordAttendanceEvent(req, "note.created", {
        conversationId: req.params.id,
        entityType: "note",
        entityId: created.id,
        after: created,
        realtimeType: "attendance.note.created",
      });
      res.json(created);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== QUICK REPLIES =====================

  app.get("/api/attendance/quick-replies", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const qrs = await storage.getQuickReplies(req.accountId!);
      res.json(qrs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/quick-replies", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const data = insertQuickReplySchema.parse(req.body);
      const qr = await storage.createQuickReply({ ...data, accountId: req.accountId!, userId: req.userId! });
      await recordAttendanceEvent(req, "quick_reply.created", {
        entityType: "quick_reply",
        entityId: qr.id,
        after: qr,
        realtimeType: "attendance.settings.updated",
      });
      res.json(qr);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/quick-replies/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const before = (await storage.getQuickReplies(req.accountId!)).find((qr) => qr.id === req.params.id) ?? null;
      const qr = await storage.updateQuickReply(req.params.id, req.accountId!, req.body);
      await recordAttendanceEvent(req, "quick_reply.updated", {
        entityType: "quick_reply",
        entityId: qr.id,
        before,
        after: qr,
        realtimeType: "attendance.settings.updated",
      });
      res.json(qr);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/quick-replies/:id", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const before = (await storage.getQuickReplies(req.accountId!)).find((qr) => qr.id === req.params.id) ?? null;
      await storage.deleteQuickReply(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "quick_reply.deleted", {
        entityType: "quick_reply",
        entityId: req.params.id,
        before,
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ===================== SECTORS =====================

  app.get("/api/attendance/sectors", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const sectors = await storage.getSectors(req.accountId!);
      res.json(sectors);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/sectors", authenticateToken, requirePermission("attendanceManageDepartments"), async (req: AuthRequest, res: Response) => {
    try {
      const data = insertAttSectorSchema.parse(req.body);
      const sector = await storage.createSector({ ...data, accountId: req.accountId! });
      await recordAttendanceEvent(req, "sector.created", {
        entityType: "sector",
        entityId: sector.id,
        after: sector,
        realtimeType: "attendance.settings.updated",
      });
      res.json(sector);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/sectors/:id", authenticateToken, requirePermission("attendanceManageDepartments"), async (req: AuthRequest, res: Response) => {
    try {
      const before = (await storage.getSectors(req.accountId!)).find((sector) => sector.id === req.params.id) ?? null;
      const sector = await storage.updateSector(req.params.id, req.accountId!, req.body);
      await recordAttendanceEvent(req, "sector.updated", {
        entityType: "sector",
        entityId: sector.id,
        before,
        after: sector,
        realtimeType: "attendance.settings.updated",
      });
      res.json(sector);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/sectors/:id", authenticateToken, requirePermission("attendanceManageDepartments"), async (req: AuthRequest, res: Response) => {
    try {
      const before = (await storage.getSectors(req.accountId!)).find((sector) => sector.id === req.params.id) ?? null;
      await storage.deleteSector(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "sector.deleted", {
        entityType: "sector",
        entityId: req.params.id,
        before,
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ===================== QUEUES =====================

  app.get("/api/attendance/queues", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const queues = await storage.getQueues(req.accountId!);
      res.json(queues.filter((q) => q.active !== false));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/queues", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      const data = insertAttQueueSchema.parse(req.body);
      const queue = await storage.createQueue({ ...data, accountId: req.accountId! });
      await recordAttendanceEvent(req, "queue.created", {
        entityType: "queue",
        entityId: queue.id,
        after: queue,
        realtimeType: "attendance.settings.updated",
      });
      res.json(queue);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/attendance/queues/:id", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getQueue(req.params.id, req.accountId!);
      const queue = await storage.updateQueue(req.params.id, req.accountId!, req.body);
      await recordAttendanceEvent(req, "queue.updated", {
        entityType: "queue",
        entityId: queue.id,
        before,
        after: queue,
        realtimeType: "attendance.settings.updated",
      });
      res.json(queue);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/queues/:id", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      const before = await storage.getQueue(req.params.id, req.accountId!);
      await storage.deleteQueue(req.params.id, req.accountId!);
      await recordAttendanceEvent(req, "queue.deleted", {
        entityType: "queue",
        entityId: req.params.id,
        before,
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/attendance/operators", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getAllUsers(req.accountId!);
      res.json(users.filter(user => user.role === "admin" || Boolean((user.permissions as any)?.attendanceReply)).map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role })));
    } catch (e: any) {
      res.status(500).json({ error: "Não foi possível carregar os atendentes" });
    }
  });

  app.get("/api/attendance/queues/:id/members", authenticateToken, requireAttendanceRead(), async (req: AuthRequest, res: Response) => {
    try {
      const members = await storage.getQueueMembers(req.params.id, req.accountId!);
      res.json(members);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/attendance/queues/:id/members", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      const queue = await storage.getQueue(req.params.id, req.accountId!);
      if (!queue || queue.active === false) return res.status(404).json({ error: "Fila não encontrada" });
      const targetUser = await storage.getUser(String(req.body?.userId ?? ""));
      if (!targetUser || targetUser.accountId !== req.accountId) return res.status(400).json({ error: "Atendente inválido para esta conta" });
      if (targetUser.role !== "admin" && !(targetUser.permissions as any)?.attendanceReply) return res.status(400).json({ error: "O usuário não possui permissão para responder atendimentos" });
      const existingMembers = await storage.getQueueMembers(queue.id, req.accountId!);
      if (existingMembers.some(member => member.userId === targetUser.id)) return res.status(409).json({ error: "Atendente já pertence a esta fila" });
      const data = insertAttQueueMemberSchema.parse({ ...req.body, queueId: req.params.id });
      const member = await storage.createQueueMember({ ...data, accountId: req.accountId!, queueId: req.params.id });
      await recordAttendanceEvent(req, "queue.member.created", {
        entityType: "queue_member",
        entityId: member.id,
        after: member,
        realtimeType: "attendance.settings.updated",
      });
      res.json(member);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/attendance/queues/:queueId/members/:memberId", authenticateToken, requirePermission("attendanceManageQueues"), async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteQueueMember(req.params.memberId, req.accountId!);
      await recordAttendanceEvent(req, "queue.member.deleted", {
        entityType: "queue_member",
        entityId: req.params.memberId,
        metadata: { queueId: req.params.queueId },
        realtimeType: "attendance.settings.updated",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ===================== AUTOMATION =====================

  app.get("/api/attendance/automation-settings", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAutomation(req.accountId!);
      res.json(settings ?? { welcomeEnabled: false, awayEnabled: false, inactivityEnabled: false, inactivityMinutes: 60, keywordRules: [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/attendance/automation-settings", authenticateToken, requirePermission("attendanceSettings"), async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.upsertAutomation({ ...req.body, accountId: req.accountId! });
      await recordAttendanceEvent(req, "automation.updated", {
        entityType: "automation",
        entityId: settings.id,
        after: settings,
        realtimeType: "attendance.settings.updated",
      });
      res.json(settings);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ===================== REPORTS =====================

  app.get("/api/attendance/supervision", authenticateToken, requirePermission("attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.getAttendanceSupervision(req.accountId!));
    } catch (e: any) {
      res.status(500).json({ error: "Não foi possível carregar a supervisão de atendimentos" });
    }
  });

  app.get("/api/attendance/reports/summary", authenticateToken, requirePermission("attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const { channel, from, to } = req.query as Record<string, string>;
      const report = await storage.getAttendanceReport(req.accountId!, { channel, from, to });
      res.json(report);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/reports/export", authenticateToken, requirePermission("attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const { channel, from, to, format = "csv" } = req.query as Record<string, string>;
      const report = await storage.getAttendanceReport(req.accountId!, { channel, from, to });
      const normalizedFormat = String(format).toLowerCase();
      const rows = [
        ["Metrica", "Valor"],
        ["Total", report.total ?? 0],
        ["Resolvidos", report.resolved ?? 0],
        ["Em andamento", report.inProgress ?? 0],
        ["Aguardando", report.waiting ?? 0],
        ["Tempo medio de espera (s)", report.avgWaitSeconds ?? 0],
        ["Tempo medio de atendimento (s)", report.avgServiceSeconds ?? 0],
        ["SLA violado", report.slaBreached ?? 0],
        ["Taxa de resolucao", report.resolutionRate ?? 0],
        [],
        ["Status", "Quantidade"],
        ...Object.entries(report.byStatus ?? {}),
        [],
        ["Canal", "Quantidade"],
        ...Object.entries(report.byChannel ?? {}),
        [],
        ["Setor", "Quantidade"],
        ...Object.entries(report.bySector ?? {}),
        [],
        ["Prioridade", "Quantidade"],
        ...Object.entries(report.byPriority ?? {}),
      ];

      if (normalizedFormat === "json") return res.json(report);
      if (normalizedFormat === "xlsx" || normalizedFormat === "excel") {
        const buffer = await rowsToXlsxBuffer(rows, "Relatorio");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=relatorio-atendimentos.xlsx");
        return res.send(buffer);
      }
      if (normalizedFormat === "pdf") return sendPdf(res, "relatorio-atendimentos.pdf", "Relatorio de atendimentos", rows);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=relatorio-atendimentos.csv");
      res.send(toCsv(rows));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/attendance/dashboard", authenticateToken, requirePermission("attendanceReports"), async (req: AuthRequest, res: Response) => {
    try {
      const { channel, from, to } = req.query as Record<string, string>;
      const report = await storage.getAttendanceReport(req.accountId!, { channel, from, to });
      res.json(report);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===================== WEBHOOK =====================

  app.post("/api/webhooks/attendance/:channel/:connectionId", async (req, res) => {
    try {
      const { channel, connectionId } = req.params;
      const conn = await storage.getChannelConnection(connectionId, undefined);
      if (!conn) return res.status(404).json({ error: "Connection not found" });
      if (conn.channel !== channel) return res.status(400).json({ error: "Channel mismatch" });

      if (attendancePayloadSize(req) > ATTENDANCE_WEBHOOK_MAX_BODY_BYTES) {
        return res.status(413).json({ error: "Payload too large" });
      }
      const rateKey = connectionId + ":" + (requestIp(req as AuthRequest) ?? "unknown");
      if (!consumeAttendanceWebhookRate(rateKey)) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "Too many webhook requests" });
      }

      const secret = req.headers["x-attendance-secret"];
      if ((conn.metadata as any)?.webhookSecret && secret !== (conn.metadata as any).webhookSecret) {
        return res.status(401).json({ error: "Invalid secret" });
      }

      const remotePayload = req.body?.message ?? req.body;
      const externalThreadId = req.body.externalThreadId ?? req.body.attendanceId ?? req.body.chatId ?? req.body.currentChatId ?? remotePayload?.attendanceId ?? remotePayload?.chatId;
      const externalContactId = req.body.externalContactId ?? req.body.number ?? req.body.contactId ?? remoteContactNumber(req.body.chat ?? req.body);
      const body = req.body.body ?? remoteMessageText(remotePayload);
      const messageType = req.body.messageType ?? remoteMessageType(remotePayload);
      const externalMessageId = req.body.externalMessageId ?? remoteMessageId(remotePayload);
      const isManualTransfer = isExternalManualTransfer(body, remotePayload);
      if (!externalThreadId || !externalContactId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let conv = await storage.getConversationByExternal(conn.accountId, externalThreadId);
      if (!conv) {
        conv = await storage.createConversation({
          accountId: conn.accountId,
          connectionId: conn.id,
          channel,
          provider: conn.provider,
          externalThreadId,
          externalContactId,
          contactPhone: externalContactId,
          contactName: externalContactId,
          mode: "automatic",
          status: "automatic",
        });
        await recordSystemAttendanceEvent(conn.accountId, "conversation.created", {
          conversationId: conv.id,
          after: conv,
          metadata: { source: "webhook" },
          realtimeType: "attendance.conversation.created",
        });
      }

      const nextStatus = isManualTransfer
        ? (conv.assignedUserId ? "in_progress" : "waiting_agent")
        : (conv.assignedUserId ? "in_progress" : conv.mode === "manual" ? "waiting_agent" : "automatic");
      const nextMode = isManualTransfer || conv.mode === "manual" || conv.assignedUserId ? "manual" : "automatic";
      const previousConversation = conv;

      // Deduplicate by externalMessageId
      if (externalMessageId) {
        const dup = await storage.getMessageByExternalId(externalMessageId, conn.accountId);
        if (dup) return res.json({ success: true, duplicate: true });
      }

      const dataMedia = remotePayload?.dataMedia ?? {};
      const msg = await storage.createMessage({
        accountId: conn.accountId,
        conversationId: conv.id,
        direction: remotePayload?.isPrivate ? "internal" : remotePayload?.isSentByMe ? "outbound" : "inbound",
        channel,
        provider: conn.provider,
        externalMessageId: externalMessageId ?? null,
        body: body ?? null,
        messageType,
        status: remotePayload?.isSentByMe ? remoteMessageStatus(remotePayload) : "received",
        mediaUrl: dataMedia.urlFile ?? req.body.mediaUrl ?? null,
        mimeType: dataMedia.mimetype ?? req.body.mimeType ?? null,
        metadata: { remote: req.body },
      });

      conv = await storage.updateConversation(conv.id, conn.accountId, {
        lastMessageAt: new Date(),
        lastMessagePreview: (body ?? `[${messageType}]`).slice(0, 100),
        unreadCount: (conv.unreadCount ?? 0) + 1,
        lastCustomerActivityAt: new Date(),
        status: nextStatus,
        mode: nextMode,
        metadata: isManualTransfer
          ? {
              ...((conv.metadata as any) ?? {}),
              externalManualTransfer: {
                detectedAt: new Date().toISOString(),
                source: "webhook",
                body,
              },
            }
          : conv.metadata,
        updatedAt: new Date(),
      });

      conv = await autoRouteConversation(conn.accountId, conv);

      if (isManualTransfer && (previousConversation.mode !== conv.mode || previousConversation.status !== conv.status)) {
        await recordSystemAttendanceEvent(conn.accountId, "conversation.external_manual_transfer", {
          conversationId: conv.id,
          after: conv,
          metadata: { source: "webhook", externalMessageId },
          realtimeType: "attendance.conversation.updated",
        });
      }

      await recordSystemAttendanceEvent(conn.accountId, "message.received", {
        conversationId: conv.id,
        messageId: msg.id,
        entityType: "message",
        entityId: msg.id,
        after: msg,
        metadata: { source: "webhook", externalMessageId },
        realtimeType: "attendance.message.created",
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error("[WEBHOOK]", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
