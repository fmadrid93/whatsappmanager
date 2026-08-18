import type { IWorkerNodeRepository } from "../application/ports/repositories/worker-node.repository.js";
import { encodeJson } from "../shared/utils/json-buffer.js";
import { metrics } from "../shared/observability/metrics.js";
import { logger } from "../shared/logger/logger.js";
import os from "node:os";

interface CpuTimesSnapshot {
  idle: number;
  total: number;
}

function hostCpuTimes(): CpuTimesSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.idle + cpu.times.irq + cpu.times.nice + cpu.times.sys + cpu.times.user;
  }
  return { idle, total };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class WorkerNodeHeartbeat {
  private timer?: NodeJS.Timeout;
  private running = false;
  private previousProcessUsage = process.cpuUsage();
  private previousProcessSample = process.hrtime.bigint();
  private previousHostCpu = hostCpuTimes();

  constructor(
    private readonly nodes: IWorkerNodeRepository,
    private readonly workerId: string,
    private readonly shardId: number,
    private readonly shardCount: number,
    private readonly intervalMs: number,
    private readonly leaseSeconds: number,
    private readonly runtimeStats?: () => {
      inFlight: number;
      maxInFlight: number;
      sessionConcurrency: number;
      activeSessions: number;
      haltedSessions: number;
    },
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try {
      await this.nodes.markDraining(this.workerId);
    } catch (error) {
      logger.warn({ error, workerId: this.workerId }, "No se pudo marcar el Worker como DRAINING.");
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const nowProcessSample = process.hrtime.bigint();
      const processUsage = process.cpuUsage();
      const elapsedMicros = Math.max(
        1,
        Number(nowProcessSample - this.previousProcessSample) / 1000,
      );
      const usedMicros = Math.max(
        0,
        (processUsage.user - this.previousProcessUsage.user)
          + (processUsage.system - this.previousProcessUsage.system),
      );
      const logicalCpus = Math.max(1, os.cpus().length);
      const processCpuPercent = round2(
        Math.min(100, (usedMicros / elapsedMicros / logicalCpus) * 100),
      );
      this.previousProcessUsage = processUsage;
      this.previousProcessSample = nowProcessSample;

      const currentHostCpu = hostCpuTimes();
      const totalDelta = Math.max(1, currentHostCpu.total - this.previousHostCpu.total);
      const idleDelta = Math.max(0, currentHostCpu.idle - this.previousHostCpu.idle);
      const hostCpuPercent = round2(
        Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)),
      );
      this.previousHostCpu = currentHostCpu;

      const memory = process.memoryUsage();
      const runtime = this.runtimeStats?.();

      await this.nodes.heartbeat({
        workerId: this.workerId,
        shardId: this.shardId,
        shardCount: this.shardCount,
        leaseExpiresAt: new Date(Date.now() + this.leaseSeconds * 1000),
        metadata: encodeJson({
          pid: process.pid,
          hostname: os.hostname(),
          version: process.env.APP_VERSION,
          processCpuPercent,
          processRssBytes: memory.rss,
          processHeapUsedBytes: memory.heapUsed,
          hostCpuPercent,
          hostTotalMemoryBytes: os.totalmem(),
          hostFreeMemoryBytes: os.freemem(),
          uptimeSeconds: Math.round(process.uptime()),
          queueInFlight: runtime?.inFlight ?? 0,
          queueMaxInFlight: runtime?.maxInFlight ?? 0,
          queueSessionConcurrency: runtime?.sessionConcurrency ?? 0,
          queueActiveSessions: runtime?.activeSessions ?? 0,
          queueHaltedSessions: runtime?.haltedSessions ?? 0,
        }),
      });
      await this.nodes.removeExpired(new Date());
      metrics.gauge("wa_worker_shard", "Shard assigned to the worker.", { worker: this.workerId }, this.shardId);
      metrics.gauge("wa_worker_shard_count", "Configured shard count.", { worker: this.workerId }, this.shardCount);
      metrics.gauge("wa_worker_membership_healthy", "Whether worker membership heartbeat succeeded.", { worker: this.workerId }, 1);
    } catch (error) {
      metrics.gauge("wa_worker_membership_healthy", "Whether worker membership heartbeat succeeded.", { worker: this.workerId }, 0);
      logger.error({ error, workerId: this.workerId }, "Falló el heartbeat de membresía del Worker.");
    } finally {
      this.running = false;
    }
  }
}
