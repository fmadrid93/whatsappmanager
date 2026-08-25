import { env } from "./shared/config/env.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { AesGcmCryptoBox } from "./infrastructure/crypto/aes-gcm-crypto-box.js";
import { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository.js";
import { PrismaRefreshSessionRepository } from "./infrastructure/repositories/prisma-refresh-session.repository.js";
import { PrismaAuditLogRepository } from "./infrastructure/repositories/prisma-audit-log.repository.js";
import { PrismaSessionRepository } from "./infrastructure/repositories/prisma-session.repository.js";
import { PrismaBaileysAuthRepository } from "./infrastructure/repositories/prisma-baileys-auth.repository.js";
import { PrismaConversationRepository } from "./infrastructure/repositories/prisma-conversation.repository.js";
import { PrismaMediaAssetRepository, PrismaPreparedMediaRepository } from "./infrastructure/repositories/prisma-media.repository.js";
import { PrismaCampaignRepository } from "./infrastructure/repositories/prisma-campaign.repository.js";
import { PrismaMessageQueueRepository } from "./infrastructure/repositories/prisma-message-queue.repository.js";
import { PrismaMediaPreparationRepository } from "./infrastructure/repositories/prisma-media-preparation.repository.js";
import { PrismaBotFlowRepository } from "./infrastructure/repositories/prisma-bot-flow.repository.js";
import { PrismaWhatsAppMessageRepository } from "./infrastructure/repositories/prisma-whatsapp-message.repository.js";
import { PrismaMessageAttemptRepository } from "./infrastructure/repositories/prisma-message-attempt.repository.js";
import { PrismaDeadLetterRepository } from "./infrastructure/repositories/prisma-dead-letter.repository.js";
import { PrismaRateLimitStore } from "./infrastructure/repositories/prisma-rate-limit-store.js";
import { S3ObjectStorage } from "./infrastructure/storage/s3-object-storage.js";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.js";
import { BaileysSocketRegistry } from "./infrastructure/whatsapp/baileys-socket-registry.js";
import { BaileysMessagePersistenceHandler } from "./infrastructure/whatsapp/baileys-message-persistence.handler.js";
import { AuthService } from "./application/services/auth.service.js";
import { AuditService } from "./application/services/audit.service.js";
import { SessionService } from "./application/services/session.service.js";
import { CampaignService } from "./application/services/campaign.service.js";
import { PhoneNormalizerService } from "./application/services/phone-normalizer.service.js";
import { MediaAssetService } from "./application/services/media-asset.service.js";
import { HumanHandoffService } from "./application/services/human-handoff.service.js";
import { FailoverService } from "./application/services/failover.service.js";
import { InboundMessageService } from "./application/services/inbound-message.service.js";
import { MediaReuseService } from "./application/services/media-reuse.service.js";
import { BotFlowService } from "./application/services/bot-flow.service.js";
import { BaileysSessionGateway } from "./infrastructure/whatsapp/baileys-session-gateway.js";
import { MockSessionGateway } from "./infrastructure/whatsapp/mock-session-gateway.js";
import type { ISessionGateway } from "./application/ports/whatsapp/session-gateway.js";
import { PrismaTenantCapacityRepository } from "./infrastructure/repositories/prisma-tenant-capacity.repository.js";
import { PrismaOutboxRepository } from "./infrastructure/repositories/prisma-outbox.repository.js";
import { PrismaWorkerNodeRepository } from "./infrastructure/repositories/prisma-worker-node.repository.js";
import { PrismaIntegrationRepository } from "./infrastructure/repositories/prisma-integration.repository.js";
import { PrismaExternalConnectorRepository } from "./infrastructure/repositories/prisma-external-connector.repository.js";
import { TenantCapacityService } from "./application/services/tenant-capacity.service.js";
import { MemoryCoordinationBus } from "./infrastructure/coordination/memory-coordination-bus.js";
import { RedisCoordinationBus } from "./infrastructure/coordination/redis-coordination-bus.js";
import { LocalEventTransport } from "./infrastructure/events/local-event-transport.js";
import { SqsEventTransport } from "./infrastructure/events/sqs-event-transport.js";
import { PrismaDatabaseProbe } from "./infrastructure/system/prisma-database-probe.js";
import { IntegrationValidationService } from "./application/services/integration-validation.service.js";
import { IntegrationManagementService } from "./application/services/integration-management.service.js";
import { ExternalConnectorService } from "./application/services/external-connector.service.js";

export function buildContainer() {
  if (env.NODE_ENV === "production" && env.WHATSAPP_GATEWAY_MODE !== "BAILEYS") {
    throw new Error("Producción exige WHATSAPP_GATEWAY_MODE=BAILEYS.");
  }
  const cryptoBox = new AesGcmCryptoBox(env.ENCRYPTION_KEY_BASE64);
  const users = new PrismaUserRepository(prisma);
  const refreshSessions = new PrismaRefreshSessionRepository(prisma);
  const auditLogs = new PrismaAuditLogRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const authState = new PrismaBaileysAuthRepository(prisma, cryptoBox);
  const conversations = new PrismaConversationRepository(prisma);
  const mediaAssets = new PrismaMediaAssetRepository(prisma);
  const preparedMedia = new PrismaPreparedMediaRepository(prisma);
  const campaigns = new PrismaCampaignRepository(prisma);
  const messageQueue = new PrismaMessageQueueRepository(prisma, env.DATABASE_URL);
  const mediaPreparations = new PrismaMediaPreparationRepository(prisma);
  const botFlows = new PrismaBotFlowRepository(prisma);
  const whatsappMessages = new PrismaWhatsAppMessageRepository(prisma);
  const messageAttempts = new PrismaMessageAttemptRepository(prisma);
  const deadLetters = new PrismaDeadLetterRepository(prisma);
  const rateLimitStore = new PrismaRateLimitStore(prisma);
  const capacity = new PrismaTenantCapacityRepository(prisma, {
    maxSessions: env.DEFAULT_MAX_SESSIONS,
    maxConcurrentCampaigns: env.DEFAULT_MAX_CONCURRENT_CAMPAIGNS,
    maxCampaignContacts: env.DEFAULT_MAX_CAMPAIGN_CONTACTS,
    maxPendingMessages: env.DEFAULT_MAX_PENDING_MESSAGES,
    monthlyMessageLimit: env.DEFAULT_MONTHLY_MESSAGE_LIMIT,
    globalMaxPendingMessages: env.GLOBAL_MAX_PENDING_MESSAGES,
  });
  const outbox = new PrismaOutboxRepository(prisma, env.DATABASE_URL);
  const workerNodes = new PrismaWorkerNodeRepository(prisma);
  const databaseProbe = new PrismaDatabaseProbe(prisma);
  const integrations = new PrismaIntegrationRepository(prisma);
  const externalConnectors = new PrismaExternalConnectorRepository(prisma);
  const storage = env.OBJECT_STORAGE_MODE === "MOCK"
    ? new MockObjectStorage()
    : new S3ObjectStorage(env.S3_BUCKET, {
        endpoint: env.S3_ENDPOINT,
        region: env.AWS_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
  const sockets = new BaileysSocketRegistry();
  if (env.WORKER_SHARD_ID >= env.WORKER_SHARD_COUNT) {
    throw new Error("WORKER_SHARD_ID debe ser menor que WORKER_SHARD_COUNT.");
  }
  if (env.COORDINATION_PROVIDER === "REDIS" && !env.REDIS_URL) {
    throw new Error("REDIS_URL es obligatorio cuando COORDINATION_PROVIDER=REDIS.");
  }
  if (env.EVENT_TRANSPORT === "SQS" && !env.SQS_QUEUE_URL) {
    throw new Error("SQS_QUEUE_URL es obligatorio cuando EVENT_TRANSPORT=SQS.");
  }
  const coordination = env.COORDINATION_PROVIDER === "REDIS"
    ? new RedisCoordinationBus(env.REDIS_URL!, env.REDIS_KEY_PREFIX)
    : new MemoryCoordinationBus();
  const eventTransport = env.EVENT_TRANSPORT === "SQS"
    ? new SqsEventTransport(env.SQS_QUEUE_URL!, env.AWS_REGION, env.SQS_FIFO_GROUP_PREFIX)
    : new LocalEventTransport(coordination);

  const authService = new AuthService(users, refreshSessions, env.JWT_SECRET, env.ACCESS_TOKEN_EXPIRES_IN, env.REFRESH_TOKEN_DAYS);
  const auditService = new AuditService(auditLogs);
  const capacityService = new TenantCapacityService(capacity);
  const phoneNormalizer = new PhoneNormalizerService();
  const sessionService = new SessionService(
    sessions,
    authState,
    capacityService,
    phoneNormalizer,
    env.DEFAULT_COUNTRY_REGION,
  );
  const campaignService = new CampaignService(campaigns, phoneNormalizer, capacityService);
  const mediaAssetService = new MediaAssetService(
    mediaAssets,
    storage,
    env.JWT_SECRET,
    env.MAX_MEDIA_BYTES,
    env.MEDIA_UPLOAD_URL_SECONDS,
  );
  const handoffService = new HumanHandoffService(conversations);
  const failoverService = new FailoverService(
    sessions,
    messageQueue,
    env.AUTO_FAILOVER_ENABLED,
    env.AUTO_FAILOVER_WAIT_SECONDS,
    env.AUTO_FAILOVER_MAX_TARGETS,
    env.SESSION_QUARANTINE_MINUTES,
  );
  const botFlowService = new BotFlowService(botFlows);
  const externalConnectorService = new ExternalConnectorService(
    externalConnectors,
    cryptoBox,
    env.NODE_ENV !== "production",
  );
  const inboundService = new InboundMessageService(
    conversations,
    sessions,
    botFlows,
    whatsappMessages,
    env.DEFAULT_AUTO_REPLY,
    {},
    externalConnectorService,
  );
  const mediaReuseService = new MediaReuseService(
    mediaAssets,
    preparedMedia,
    storage,
    cryptoBox,
    sockets,
    env.S3_SIGNED_URL_SECONDS,
  );
  const messagePersistence = new BaileysMessagePersistenceHandler(sessions, whatsappMessages, messageAttempts);
  const integrationValidationService = new IntegrationValidationService(
    databaseProbe,
    storage,
    sessions,
    workerNodes,
    {
      whatsappGateway: env.WHATSAPP_GATEWAY_MODE,
      objectStorage: env.OBJECT_STORAGE_MODE,
    },
  );
  const integrationManagementService = new IntegrationManagementService(integrations, cryptoBox);
  const sessionGateway: ISessionGateway = env.WHATSAPP_GATEWAY_MODE === "MOCK"
    ? new MockSessionGateway(sessions, sockets, env.WORKER_ID)
    : new BaileysSessionGateway(
        sessions,
        authState,
        sockets,
        inboundService,
        messagePersistence,
        whatsappMessages,
        failoverService,
        env.WORKER_ID,
      );

  return {
    env,
    prisma,
    storage,
    repositories: {
      users,
      refreshSessions,
      auditLogs,
      sessions,
      authState,
      conversations,
      mediaAssets,
      preparedMedia,
      campaigns,
      messageQueue,
      mediaPreparations,
      botFlows,
      whatsappMessages,
      messageAttempts,
      deadLetters,
      rateLimitStore,
      capacity,
      outbox,
      workerNodes,
      integrations,
      externalConnectors,
    },
    services: {
      authService,
      auditService,
      sessionService,
      campaignService,
      mediaAssetService,
      handoffService,
      failoverService,
      inboundService,
      mediaReuseService,
      botFlowService,
      capacityService,
      integrationValidationService,
      integrationManagementService,
      externalConnectorService,
    },
    whatsapp: { sockets, sessionGateway, messagePersistence },
    scaling: { coordination, eventTransport },
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
