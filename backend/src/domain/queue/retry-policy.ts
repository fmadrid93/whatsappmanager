export function retryDelaySeconds(attemptCount: number): number {
  const safeAttempt = Math.max(1, Math.trunc(attemptCount));
  return Math.min(300, 10 * safeAttempt);
}
