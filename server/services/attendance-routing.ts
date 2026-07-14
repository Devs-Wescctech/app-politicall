export type RoutingStrategy = "manual" | "round_robin" | "least_loaded";

export type RoutingCandidate = {
  userId: string;
  openCount: number;
  capacity: number;
};

export function selectRoutingCandidate(
  strategy: string | null | undefined,
  candidates: RoutingCandidate[],
  lastAssignedUserId?: string | null,
): RoutingCandidate | null {
  const available = candidates.filter(candidate => candidate.openCount < candidate.capacity);
  if (strategy === "manual" || available.length === 0) return null;

  if (strategy === "round_robin") {
    const ordered = [...available].sort((a, b) => a.userId.localeCompare(b.userId));
    const previous = ordered.findIndex(candidate => candidate.userId === lastAssignedUserId);
    return ordered[(previous + 1) % ordered.length] ?? null;
  }

  if (strategy === "least_loaded") {
    return [...available].sort((a, b) => a.openCount - b.openCount || a.userId.localeCompare(b.userId))[0] ?? null;
  }

  return null;
}
