import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { demandAttachments, demandHistory, demands, users } from "@shared/schema";
import { db } from "../db";
import { DemandDomainError } from "./demands";
import { validateDemandAttachment } from "./demand-automation-domain";

const ATTACHMENT_ROOT = path.resolve(process.cwd(), "uploads", "demands");

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new DemandDomainError("Identificador de anexo invalido", "ATTACHMENT_INVALID", 400);
  return value;
}

function safeStoredName(value: string): string {
  if (!/^[a-f0-9-]+\.(pdf|jpg|png|webp)$/.test(value)) {
    throw new DemandDomainError("Identificador de arquivo invalido", "ATTACHMENT_INVALID", 400);
  }
  return value;
}

function attachmentPath(accountId: string, demandId: string, storedName: string): string {
  const directory = path.resolve(ATTACHMENT_ROOT, safeSegment(accountId), safeSegment(demandId));
  const target = path.resolve(directory, safeStoredName(storedName));
  if (!target.startsWith(`${directory}${path.sep}`)) throw new DemandDomainError("Caminho de anexo invalido", "ATTACHMENT_INVALID", 400);
  return target;
}

async function assertOwnedDemand(accountId: string, demandId: string) {
  const [owned] = await db.select({ id: demands.id }).from(demands)
    .where(and(eq(demands.id, demandId), eq(demands.accountId, accountId)));
  if (!owned) throw new DemandDomainError("Demanda nao encontrada", "DEMAND_NOT_FOUND", 404);
}

export async function listDemandAttachments(accountId: string, demandId: string) {
  await assertOwnedDemand(accountId, demandId);
  return db.select({
    id: demandAttachments.id,
    originalName: demandAttachments.originalName,
    mimeType: demandAttachments.mimeType,
    sizeBytes: demandAttachments.sizeBytes,
    createdAt: demandAttachments.createdAt,
    userName: users.name,
  }).from(demandAttachments)
    .leftJoin(users, eq(demandAttachments.userId, users.id))
    .where(and(eq(demandAttachments.accountId, accountId), eq(demandAttachments.demandId, demandId)))
    .orderBy(desc(demandAttachments.createdAt));
}

export async function createDemandAttachment(
  accountId: string,
  userId: string,
  demandId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
) {
  await assertOwnedDemand(accountId, demandId);
  let validated: ReturnType<typeof validateDemandAttachment>;
  try {
    validated = validateDemandAttachment({
      buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname, size: file.size,
    });
  } catch (error) {
    throw new DemandDomainError(error instanceof Error ? error.message : "Anexo invalido", "ATTACHMENT_INVALID", 400);
  }
  const storedName = `${randomUUID()}.${validated.extension}`;
  const target = attachmentPath(accountId, demandId, storedName);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.buffer, { flag: "wx" });

  try {
    return await db.transaction(async (tx: any) => {
      const [created] = await tx.insert(demandAttachments).values({
        accountId, demandId, userId, originalName: validated.safeOriginalName,
        storedName, mimeType: validated.mimeType, sizeBytes: file.size,
      }).returning();
      await tx.insert(demandHistory).values({
        accountId, demandId, userId, eventType: "attachment_uploaded",
        toValue: created.id, metadata: { originalName: created.originalName, sizeBytes: created.sizeBytes },
      });
      return created;
    });
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
}

export async function getDemandAttachment(accountId: string, demandId: string, attachmentId: string) {
  const [attachment] = await db.select().from(demandAttachments).where(and(
    eq(demandAttachments.id, attachmentId),
    eq(demandAttachments.demandId, demandId),
    eq(demandAttachments.accountId, accountId),
  ));
  if (!attachment) throw new DemandDomainError("Anexo nao encontrado", "ATTACHMENT_NOT_FOUND", 404);
  return { attachment, absolutePath: attachmentPath(accountId, demandId, attachment.storedName) };
}

export async function deleteDemandAttachment(accountId: string, userId: string, demandId: string, attachmentId: string) {
  const { attachment, absolutePath } = await getDemandAttachment(accountId, demandId, attachmentId);
  await db.transaction(async (tx: any) => {
    const deleted = await tx.delete(demandAttachments).where(and(
      eq(demandAttachments.id, attachmentId), eq(demandAttachments.accountId, accountId),
    )).returning({ id: demandAttachments.id });
    if (!deleted.length) throw new DemandDomainError("Anexo nao encontrado", "ATTACHMENT_NOT_FOUND", 404);
    await tx.insert(demandHistory).values({
      accountId, demandId, userId, eventType: "attachment_deleted",
      fromValue: attachment.id, metadata: { originalName: attachment.originalName },
    });
  });
  await unlink(absolutePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") console.error("Demand attachment cleanup failed:", error);
  });
}
