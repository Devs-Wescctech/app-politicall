export function calculateGoalProgress(current: number, goal: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(Math.max((current / goal) * 100, 0), 100);
}
