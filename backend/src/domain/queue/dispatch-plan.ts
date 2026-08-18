export function buildDispatchPlan(input: {
  sessionIds: readonly string[];
  activeBySession: ReadonlyMap<string, number>;
  sessionConcurrency: number;
  totalInFlight: number;
  maxInFlight: number;
}): string[] {
  const sessionConcurrency = Math.max(1, Math.trunc(input.sessionConcurrency));
  let remaining = Math.max(0, Math.trunc(input.maxInFlight) - Math.max(0, Math.trunc(input.totalInFlight)));
  if (remaining === 0 || input.sessionIds.length === 0) return [];

  const plan: string[] = [];
  for (let level = 0; level < sessionConcurrency && remaining > 0; level += 1) {
    for (const sessionId of input.sessionIds) {
      if (remaining <= 0) break;
      const active = input.activeBySession.get(sessionId) ?? 0;
      if (active + level >= sessionConcurrency) continue;
      plan.push(sessionId);
      remaining -= 1;
    }
  }
  return plan;
}
