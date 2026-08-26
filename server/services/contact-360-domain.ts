import type {
  Contact360Collections,
  Contact360Summary,
  Contact360TimelineItem,
  Contact360Visibility,
} from "@shared/contact-360";
import type { UserPermissions } from "@shared/schema";

const ACTIVE_DEMAND_STATUSES = new Set(["open", "pending", "triage", "in_progress", "waiting", "waiting_requester", "waiting_third_party"]);

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function buildContact360Summary(input: Contact360Collections, totals?: Contact360Summary): Contact360Summary {
  if (totals) return totals;
  return {
    demands: input.demands.length,
    openDemands: input.demands.filter((demand) => ACTIVE_DEMAND_STATUSES.has(demand.status)).length,
    conversations: input.conversations.length,
    events: input.events.length,
    campaigns: new Set(input.campaigns.map((campaign) => campaign.campaignId)).size,
    petitions: input.petitions.length,
  };
}

export function resolveContact360Visibility(viewer: { role?: string; permissions?: Partial<UserPermissions> }): Contact360Visibility {
  if (viewer.role === "admin") return { demands: true, conversations: true, events: true, campaigns: true, petitions: true };
  const permissions = viewer.permissions ?? {};
  return {
    demands: permissions.demands === true,
    conversations: [permissions.attendanceView, permissions.whatsappAttendance, permissions.emailAttendance, permissions.socialAttendance].some(Boolean),
    events: permissions.agenda === true,
    campaigns: [permissions.marketing, permissions.whatsappBroadcast, permissions.emailBroadcast, permissions.smsBroadcast].some(Boolean),
    petitions: permissions.petitions === true,
  };
}

export function buildContact360Timeline(input: Contact360Collections): Contact360TimelineItem[] {
  const items: Contact360TimelineItem[] = [
    ...input.demands.map((demand) => ({
      id: `demand:${demand.id}`,
      type: "demand" as const,
      title: demand.title,
      description: demand.protocol,
      occurredAt: iso(demand.updatedAt),
      status: demand.status,
      sourceId: demand.id,
      href: `/demands?demandId=${encodeURIComponent(demand.id)}`,
    })),
    ...input.conversations.map((conversation) => ({
      id: `attendance:${conversation.id}`,
      type: "attendance" as const,
      title: conversation.attendanceCode ? `Atendimento ${conversation.attendanceCode}` : "Atendimento",
      description: [conversation.inboundLabel, conversation.summary].filter(Boolean).join(" · ") || null,
      occurredAt: iso(conversation.lastMessageAt ?? conversation.createdAt),
      status: conversation.status,
      sourceId: conversation.id,
      href: `/attendance?conversationId=${encodeURIComponent(conversation.id)}`,
    })),
    ...input.events.map((event) => ({
      id: `event:${event.id}`,
      type: "event" as const,
      title: event.title,
      description: event.category,
      occurredAt: iso(event.startDate),
      status: null,
      sourceId: event.id,
      href: `/agenda?eventId=${encodeURIComponent(event.id)}`,
    })),
    ...input.campaigns.map((campaign) => ({
      id: `campaign:${campaign.id}`,
      type: "campaign" as const,
      title: campaign.campaignName,
      description: campaign.channel,
      occurredAt: iso(campaign.sentAt ?? campaign.createdAt),
      status: campaign.status,
      sourceId: campaign.campaignId,
      href: `/broadcasts/${encodeURIComponent(campaign.campaignId)}`,
    })),
    ...input.petitions.map((petition) => ({
      id: `petition:${petition.id}`,
      type: "petition" as const,
      title: petition.petitionTitle,
      description: "Assinatura registrada",
      occurredAt: iso(petition.createdAt),
      status: "signed",
      sourceId: petition.petitionId,
      href: `/petitions?petitionId=${encodeURIComponent(petition.petitionId)}`,
    })),
  ];

  return items
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 100);
}
