import { and, count, countDistinct, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attConversations,
  campaignRecipients,
  contacts,
  demands,
  events,
  marketingCampaigns,
  petitions,
  petitionSignatures,
} from "@shared/schema";
import type { Contact360Collections, Contact360Conversation, Contact360Response } from "@shared/contact-360";
import { buildContact360Summary, buildContact360Timeline, resolveContact360Visibility } from "./contact-360-domain";
import { formatInboundConnection } from "./contact-deduplication-domain";
import type { UserPermissions } from "@shared/schema";

export async function getContact360(
  accountId: string,
  contactId: string,
  viewer: { role?: string; userId?: string; permissions?: Partial<UserPermissions> } = {},
): Promise<Contact360Response | null> {
  const contactScope = [eq(contacts.id, contactId), eq(contacts.accountId, accountId)];
  if (viewer.role === "voluntario") {
    if (!viewer.userId) return null;
    contactScope.push(eq(contacts.userId, viewer.userId));
  }
  const [contact] = await db.select().from(contacts).where(and(...contactScope)).limit(1);
  if (!contact) return null;
  const visibility = resolveContact360Visibility(viewer);

  const [demandRows, conversationRows, eventRows, campaignRows, petitionRows, demandCountRows, conversationCountRows, eventCountRows, campaignCountRows, petitionCountRows] = await Promise.all([
    visibility.demands ? db.select({
      id: demands.id,
      title: demands.title,
      protocol: demands.protocol,
      status: demands.status,
      priority: demands.priority,
      createdAt: demands.createdAt,
      updatedAt: demands.updatedAt,
    }).from(demands)
      .where(and(eq(demands.accountId, accountId), eq(demands.contactId, contactId)))
      .orderBy(desc(demands.updatedAt)).limit(50) : Promise.resolve([]),
    visibility.conversations ? db.select({
      id: attConversations.id,
      attendanceCode: attConversations.attendanceCode,
      channel: attConversations.channel,
      status: attConversations.status,
      summary: attConversations.summary,
      inboundConnectionName: attConversations.inboundConnectionName,
      inboundNumber: attConversations.inboundNumber,
      createdAt: attConversations.createdAt,
      lastMessageAt: attConversations.lastMessageAt,
    }).from(attConversations)
      .where(and(eq(attConversations.accountId, accountId), eq(attConversations.contactId, contactId)))
      .orderBy(desc(sql`coalesce(${attConversations.lastMessageAt}, ${attConversations.createdAt})`)).limit(50) : Promise.resolve([]),
    visibility.events ? db.select({
      id: events.id,
      title: events.title,
      category: events.category,
      startDate: events.startDate,
      createdAt: events.createdAt,
    }).from(events)
      .where(and(eq(events.accountId, accountId), eq(events.contactId, contactId)))
      .orderBy(desc(events.startDate)).limit(50) : Promise.resolve([]),
    visibility.campaigns ? db.select({
      id: campaignRecipients.id,
      campaignId: campaignRecipients.campaignId,
      campaignName: marketingCampaigns.name,
      channel: campaignRecipients.channel,
      status: campaignRecipients.status,
      createdAt: campaignRecipients.createdAt,
      sentAt: campaignRecipients.sentAt,
    }).from(campaignRecipients)
      .innerJoin(marketingCampaigns, and(eq(marketingCampaigns.id, campaignRecipients.campaignId), eq(marketingCampaigns.accountId, accountId)))
      .where(and(eq(campaignRecipients.accountId, accountId), eq(campaignRecipients.contactId, contactId)))
      .orderBy(desc(sql`coalesce(${campaignRecipients.sentAt}, ${campaignRecipients.createdAt})`)).limit(50) : Promise.resolve([]),
    visibility.petitions ? db.select({
      id: petitionSignatures.id,
      petitionId: petitionSignatures.petitionId,
      petitionTitle: petitions.title,
      createdAt: petitionSignatures.createdAt,
    }).from(petitionSignatures)
      .innerJoin(petitions, and(eq(petitions.id, petitionSignatures.petitionId), eq(petitions.accountId, accountId)))
      .where(eq(petitionSignatures.contactId, contactId))
      .orderBy(desc(petitionSignatures.createdAt)).limit(50) : Promise.resolve([]),
    visibility.demands ? db.select({
      total: count(),
      open: sql<number>`count(*) filter (where ${demands.status} not in ('completed', 'cancelled'))`,
    }).from(demands).where(and(eq(demands.accountId, accountId), eq(demands.contactId, contactId))) : Promise.resolve([{ total: 0, open: 0 }]),
    visibility.conversations ? db.select({ total: count() }).from(attConversations)
      .where(and(eq(attConversations.accountId, accountId), eq(attConversations.contactId, contactId))) : Promise.resolve([{ total: 0 }]),
    visibility.events ? db.select({ total: count() }).from(events)
      .where(and(eq(events.accountId, accountId), eq(events.contactId, contactId))) : Promise.resolve([{ total: 0 }]),
    visibility.campaigns ? db.select({ total: countDistinct(campaignRecipients.campaignId) }).from(campaignRecipients)
      .innerJoin(marketingCampaigns, and(eq(marketingCampaigns.id, campaignRecipients.campaignId), eq(marketingCampaigns.accountId, accountId)))
      .where(and(eq(campaignRecipients.accountId, accountId), eq(campaignRecipients.contactId, contactId))) : Promise.resolve([{ total: 0 }]),
    visibility.petitions ? db.select({ total: count() }).from(petitionSignatures)
      .innerJoin(petitions, and(eq(petitions.id, petitionSignatures.petitionId), eq(petitions.accountId, accountId)))
      .where(eq(petitionSignatures.contactId, contactId)) : Promise.resolve([{ total: 0 }]),
  ]);

  const collections: Contact360Collections = {
    demands: demandRows,
    conversations: conversationRows.map((conversation: Omit<Contact360Conversation, "inboundLabel">) => ({
      ...conversation,
      inboundLabel: formatInboundConnection(conversation),
    })),
    events: eventRows,
    campaigns: campaignRows,
    petitions: petitionRows,
  };

  return {
    visibility,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      age: contact.age,
      gender: contact.gender,
      state: contact.state,
      city: contact.city,
      neighborhood: contact.neighborhood,
      interests: contact.interests,
      source: contact.source,
      notes: contact.notes,
      createdAt: contact.createdAt.toISOString(),
    },
    summary: buildContact360Summary(collections, {
      demands: Number(demandCountRows[0]?.total ?? 0),
      openDemands: Number(demandCountRows[0]?.open ?? 0),
      conversations: Number(conversationCountRows[0]?.total ?? 0),
      events: Number(eventCountRows[0]?.total ?? 0),
      campaigns: Number(campaignCountRows[0]?.total ?? 0),
      petitions: Number(petitionCountRows[0]?.total ?? 0),
    }),
    timeline: buildContact360Timeline(collections),
    ...collections,
  };
}
