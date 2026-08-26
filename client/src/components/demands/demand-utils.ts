type SlaDemand = { status: string; slaDueAt?: Date | string | null };
type SearchDemand = { protocol?: string | null; title: string; contact?: { name: string } | null };

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function getDemandSlaState(demand: SlaDemand, now = new Date()): "overdue" | "due_soon" | "on_track" | "completed" | "none" {
  if (demand.status === "completed" || demand.status === "cancelled") return "completed";
  if (!demand.slaDueAt) return "none";
  const remaining = new Date(demand.slaDueAt).getTime() - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining <= 24 * 60 * 60 * 1000) return "due_soon";
  return "on_track";
}

export function matchesDemandSearch(demand: SearchDemand, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return normalize([demand.protocol, demand.title, demand.contact?.name].filter(Boolean).join(" ")).includes(needle);
}
