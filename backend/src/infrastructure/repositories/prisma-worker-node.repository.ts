import type { PrismaClient } from "@prisma/client";
import type {
  IWorkerNodeRepository,
  WorkerNodeRecord,
  WorkerRuntimeMetadata,
} from "../../application/ports/repositories/worker-node.repository.js";
import { decodeJson } from "../../shared/utils/json-buffer.js";

function decodeMetadata(value: Uint8Array<ArrayBufferLike> | null | undefined): WorkerRuntimeMetadata | undefined {
  if (!value) return undefined;
  try {
    return decodeJson<WorkerRuntimeMetadata>(value);
  } catch {
    return undefined;
  }
}

export class PrismaWorkerNodeRepository implements IWorkerNodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async heartbeat(input: {
    workerId: string;
    shardId: number;
    shardCount: number;
    leaseExpiresAt: Date;
    metadata?: Uint8Array<ArrayBuffer>;
  }): Promise<void> {
    await this.prisma.workerNode.upsert({
      where: { id: input.workerId },
      create: {
        id: input.workerId,
        shardId: input.shardId,
        shardCount: input.shardCount,
        leaseExpiresAt: input.leaseExpiresAt,
        metadata: input.metadata,
      },
      update: {
        shardId: input.shardId,
        shardCount: input.shardCount,
        status: "ACTIVE",
        lastHeartbeatAt: new Date(),
        leaseExpiresAt: input.leaseExpiresAt,
        metadata: input.metadata,
      },
    });
  }

  async markDraining(workerId: string): Promise<void> {
    await this.prisma.workerNode.updateMany({
      where: { id: workerId },
      data: { status: "DRAINING", leaseExpiresAt: new Date() },
    });
  }

  async removeExpired(now: Date): Promise<number> {
    const result = await this.prisma.workerNode.deleteMany({ where: { leaseExpiresAt: { lt: now } } });
    return result.count;
  }

  async listActive(now: Date): Promise<WorkerNodeRecord[]> {
    const rows = await this.prisma.workerNode.findMany({
      where: { status: "ACTIVE", leaseExpiresAt: { gt: now } },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      shardId: row.shardId,
      shardCount: row.shardCount,
      status: row.status,
      leaseExpiresAt: row.leaseExpiresAt,
      metadata: decodeMetadata(row.metadata),
    }));
  }
}
