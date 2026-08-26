import { calculateGenderDistribution } from "../utils/gender-detector";

type DashboardContact = {
  name: string;
  age?: number | null;
  gender?: string | null;
};

type DashboardAlliance = {
  partyId: string;
};

type DashboardParty = {
  id: string;
  ideology: string;
};

type DashboardDemand = {
  status: string;
  priority?: string | null;
  slaDueAt?: Date | string | null;
};

type DashboardEvent = {
  startDate: Date | string;
};

export type DashboardStats = {
  totalContacts: number;
  totalAlliances: number;
  totalDemands: number;
  pendingDemands: number;
  overdueDemands: number;
  urgentDemands: number;
  totalEvents: number;
  upcomingEvents: number;
  ideologyDistribution: { ideology: string; count: number }[];
  genderDistribution: ReturnType<typeof calculateGenderDistribution>;
  averageAge?: number;
  ageSampleSize: number;
};

export function buildDashboardStats(
  contacts: DashboardContact[],
  alliances: DashboardAlliance[],
  demands: DashboardDemand[],
  events: DashboardEvent[],
  parties: DashboardParty[],
  now = new Date(),
): DashboardStats {
  const partiesMap = new Map(parties.map((party) => [party.id, party]));
  const ideologyDistribution: Record<string, number> = {};

  for (const alliance of alliances) {
    const party = partiesMap.get(alliance.partyId);
    if (!party) continue;
    ideologyDistribution[party.ideology] = (ideologyDistribution[party.ideology] || 0) + 1;
  }

  const contactsWithAge = contacts.filter((contact) => contact.age != null && contact.age > 0 && contact.age < 120);
  const averageAge = contactsWithAge.length >= 3
    ? Number((contactsWithAge.reduce((sum, contact) => sum + (contact.age || 0), 0) / contactsWithAge.length).toFixed(1))
    : undefined;

  return {
    totalContacts: contacts.length,
    totalAlliances: alliances.length,
    totalDemands: demands.length,
    pendingDemands: demands.filter((demand) => !["completed", "cancelled"].includes(demand.status)).length,
    overdueDemands: demands.filter((demand) => !["completed", "cancelled"].includes(demand.status) && demand.slaDueAt && new Date(demand.slaDueAt) < now).length,
    urgentDemands: demands.filter((demand) => !["completed", "cancelled"].includes(demand.status) && demand.priority === "urgent").length,
    totalEvents: events.length,
    upcomingEvents: events.filter((event) => new Date(event.startDate) > now).length,
    ideologyDistribution: Object.entries(ideologyDistribution).map(([ideology, count]) => ({ ideology, count })),
    genderDistribution: calculateGenderDistribution(contacts),
    averageAge,
    ageSampleSize: contactsWithAge.length,
  };
}
