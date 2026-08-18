export interface WorkerRuntimeMetadata {
  pid?: number;
  hostname?: string;
  version?: string;
  processCpuPercent?: number;
  processRssBytes?: number;
  processHeapUsedBytes?: number;
  hostCpuPercent?: number;
  hostTotalMemoryBytes?: number;
  hostFreeMemoryBytes?: number;
  uptimeSeconds?: number;
  queueInFlight?: number;
  queueMaxInFlight?: number;
  queueSessionConcurrency?: number;
  queueActiveSessions?: number;
  queueHaltedSessions?: number;
}

export interface WorkerNodeRecord {
  id: string;
  shardId: number;
  shardCount: number;
  status: string;
  leaseExpiresAt: Date;
  metadata?: WorkerRuntimeMetadata;
}

export interface IWorkerNodeRepository {
  heartbeat(input: {
    workerId: string;
    shardId: number;
    shardCount: number;
    leaseExpiresAt: Date;
    metadata?: Uint8Array<ArrayBuffer>;
  }): Promise<void>;
  markDraining(workerId: string): Promise<void>;
  removeExpired(now: Date): Promise<number>;
  listActive(now: Date): Promise<WorkerNodeRecord[]>;
}
