export type Contact360ActivityType = "demand" | "attendance" | "event" | "campaign" | "petition";

export interface Contact360TimelineItem {
  id: string;
  type: Contact360ActivityType;
  title: string;
  description: string | null;
  occurredAt: string;
  status: string | null;
  sourceId: string;
  href: string | null;
}

export interface Contact360Summary {
  demands: number;
  openDemands: number;
  conversations: number;
  events: number;
  campaigns: number;
  petitions: number;
}

export interface Contact360Visibility {
  demands: boolean;
  conversations: boolean;
  events: boolean;
  campaigns: boolean;
  petitions: boolean;
}

export interface Contact360Response {
  visibility: Contact360Visibility;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    state: string | null;
    city: string | null;
    neighborhood: string | null;
    interests: string[] | null;
    source: string | null;
    notes: string | null;
    createdAt: string;
  };
  summary: Contact360Summary;
  timeline: Contact360TimelineItem[];
  demands: Contact360Demand[];
  conversations: Contact360Conversation[];
  events: Contact360Event[];
  campaigns: Contact360Campaign[];
  petitions: Contact360Petition[];
}

export interface Contact360Demand {
  id: string;
  title: string;
  protocol: string | null;
  status: string;
  priority?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Contact360Conversation {
  id: string;
  attendanceCode: string | null;
  channel: string;
  status: string;
  summary: string | null;
  inboundConnectionName: string | null;
  inboundNumber: string | null;
  inboundLabel: string;
  createdAt: Date | string;
  lastMessageAt: Date | string | null;
}

export interface Contact360Event {
  id: string;
  title: string;
  category: string | null;
  startDate: Date | string;
  createdAt: Date | string;
}

export interface Contact360Campaign {
  id: string;
  campaignId: string;
  campaignName: string;
  channel: string;
  status: string;
  createdAt: Date | string;
  sentAt: Date | string | null;
}

export interface Contact360Petition {
  id: string;
  petitionId: string;
  petitionTitle: string;
  createdAt: Date | string;
}

export interface Contact360Collections {
  demands: Contact360Demand[];
  conversations: Contact360Conversation[];
  events: Contact360Event[];
  campaigns: Contact360Campaign[];
  petitions: Contact360Petition[];
}
