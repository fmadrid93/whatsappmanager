import crypto from "node:crypto";

export function stableShardKey(value: string): number {
  const digest = crypto.createHash("sha256").update(value).digest();
  return digest.readUInt32BE(0) & 0x7fffffff;
}

export function belongsToShard(shardKey: number, shardId: number, shardCount: number): boolean {
  if (shardCount <= 0) throw new Error("shardCount debe ser mayor a cero.");
  if (shardId < 0 || shardId >= shardCount) throw new Error("shardId está fuera de rango.");
  return shardKey % shardCount === shardId;
}

export function rendezvousOwner(key: string, workerIds: string[]): string | undefined {
  let selected: string | undefined;
  let selectedScore = -1n;
  for (const workerId of [...new Set(workerIds)].sort()) {
    const digest = crypto.createHash("sha256").update(`${key}:${workerId}`).digest();
    const score = digest.readBigUInt64BE(0);
    if (score > selectedScore) {
      selected = workerId;
      selectedScore = score;
    }
  }
  return selected;
}
