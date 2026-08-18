import { buildContainer } from "../container.js";
import { connectDatabase, disconnectDatabase } from "../infrastructure/database/prisma.js";
import { SessionSupervisor } from "./session-supervisor.js";
import { CampaignPreparationWorker } from "./campaign-preparation-worker.js";
import { MessageQueueWorker } from "./message-queue-worker.js";
import { MessageReconciliationWorker } from "./message-reconciliation-worker.js";
import { logger } from "../shared/logger/logger.js";
import { startMetricsServer } from "../shared/observability/metrics-server.js";
import { metrics } from "../shared/observability/metrics.js";
import { OutboxPublisherWorker } from "./outbox-publisher-worker.js";
import { WorkerNodeHeartbeat } from "./worker-node-heartbeat.js";

const container = buildContainer();
let draining = false;

const metricsServer = startMetricsServer(
  container.env.METRICS_PORT,
  container.env.METRICS_TOKEN,
  {
    version: container.env.APP_VERSION,
    environment: container.env.DEPLOYMENT_ENV,
    commit: container.env.BUILD_COMMIT,
    isReady: () => !draining,
  },
);

metrics.gauge("wa_worker_up", "Whether this worker process is running.", { worker: container.env.WORKER_ID }, 1);
await connectDatabase();
await container.storage.ensureBucket();

const supervisor = new SessionSupervisor(
  container.repositories.sessions,
  container.whatsapp.sockets,
  container.whatsapp.sessionGateway,
  container.env.WORKER_ID,
  container.env.SESSION_LEASE_SECONDS,
  container.env.SESSION_SUPERVISOR_INTERVAL_MS,
  container.repositories.workerNodes,
  container.env.WORKER_SHARD_MODE,
  container.env.WORKER_SHARD_ID,
  container.env.WORKER_SHARD_COUNT,
);

const preparationWorker = new CampaignPreparationWorker(
  container.repositories.campaigns,
  container.repositories.mediaPreparations,
  container.services.mediaReuseService,
  container.whatsapp.sockets,
  container.env.WORKER_ID,
  container.env.QUEUE_LOCK_SECONDS,
  3000,
);

const queueWorker = new MessageQueueWorker(
  container.repositories.messageQueue,
  container.repositories.messageAttempts,
  container.repositories.whatsappMessages,
  container.repositories.campaigns,
  container.services.failoverService,
  container.services.integrationManagementService,
  container.services.capacityService,
  container.whatsapp.sockets,
  container.services.mediaReuseService,
  container.env.WORKER_ID,
  container.env.QUEUE_LOCK_SECONDS,
  container.env.QUEUE_POLL_INTERVAL_MS,
  container.env.QUEUE_SESSION_CONCURRENCY,
  container.env.QUEUE_MAX_INFLIGHT,
  container.env.SEND_DELAY_MIN_MS,
  container.env.SEND_DELAY_MAX_MS,
  container.env.MESSAGE_RECONCILIATION_GRACE_MS,
  container.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  container.env.CIRCUIT_BREAKER_RETRY_MINUTES,
);

const reconciliationWorker = new MessageReconciliationWorker(
  container.repositories.messageAttempts,
  container.repositories.whatsappMessages,
  container.repositories.campaigns,
  container.env.MESSAGE_RECONCILIATION_INTERVAL_MS,
);

const outboxWorker = new OutboxPublisherWorker(
  container.repositories.outbox,
  container.scaling.eventTransport,
  container.env.WORKER_ID,
  container.env.OUTBOX_BATCH_SIZE,
  container.env.OUTBOX_LOCK_SECONDS,
  container.env.OUTBOX_POLL_INTERVAL_MS,
);

const workerHeartbeat = new WorkerNodeHeartbeat(
  container.repositories.workerNodes,
  container.env.WORKER_ID,
  container.env.WORKER_SHARD_ID,
  container.env.WORKER_SHARD_COUNT,
  container.env.WORKER_NODE_HEARTBEAT_MS,
  container.env.WORKER_NODE_LEASE_SECONDS,
  () => queueWorker.getRuntimeSnapshot(),
);

workerHeartbeat.start();
supervisor.start();
preparationWorker.start();
queueWorker.start();
reconciliationWorker.start();
outboxWorker.start();
logger.info({
  workerId: container.env.WORKER_ID,
  version: container.env.APP_VERSION,
  environment: container.env.DEPLOYMENT_ENV,
  commit: container.env.BUILD_COMMIT,
  queueSessionConcurrency: container.env.QUEUE_SESSION_CONCURRENCY,
  queueMaxInFlight: container.env.QUEUE_MAX_INFLIGHT,
  sendDelayMinMs: container.env.SEND_DELAY_MIN_MS,
  sendDelayMaxMs: container.env.SEND_DELAY_MAX_MS,
}, "Worker iniciado.");

let shutdownStarted = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  draining = true;
  logger.info({ signal }, "Worker entrando en modo de drenaje.");

  const timeoutMs = container.env.SHUTDOWN_TIMEOUT_MS;
  try {
    await Promise.all([
      preparationWorker.stopAndWait(timeoutMs),
      queueWorker.stopAndWait(timeoutMs),
      reconciliationWorker.stopAndWait(timeoutMs),
      outboxWorker.stopAndWait(timeoutMs),
    ]);
    await workerHeartbeat.stop();
    await supervisor.stop();
  } catch (error) {
    logger.error({ error }, "El Worker no pudo completar el drenaje ordenado.");
  } finally {
    metrics.gauge("wa_worker_up", "Whether this worker process is running.", { worker: container.env.WORKER_ID }, 0);
    metricsServer.close();
    await container.scaling.eventTransport.close();
    await container.scaling.coordination.close();
    await disconnectDatabase();
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
