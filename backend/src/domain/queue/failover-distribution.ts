export interface FailoverAssignment<T> {
  targetSessionId: string;
  items: T[];
}

export function distributeRoundRobin<T>(
  items: readonly T[],
  targetSessionIds: readonly string[],
): FailoverAssignment<T>[] {
  if (targetSessionIds.length === 0) return [];
  const assignments = targetSessionIds.map((targetSessionId) => ({
    targetSessionId,
    items: [] as T[],
  }));

  items.forEach((item, index) => {
    const assignment = assignments[index % assignments.length];
    if (assignment) assignment.items.push(item);
  });

  return assignments.filter((assignment) => assignment.items.length > 0);
}
