import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);
const booleanString = z.string().default("false").transform((value) => value.toLowerCase() === "true");
const csv = z.string().default("http://localhost:8080").transform((value) =>
  value.split(",").map((item) => item.trim()).filter(Boolean),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOYMENT_ENV: z.string().default("local"),
  APP_VERSION: z.string().default("1.3.0-alpha"),
  BUILD_COMMIT: z.string().default("local"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  METRICS_PORT: z.coerce.number().int().positive().default(9464),
  METRICS_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(90).default(30),
  REFRESH_COOKIE_NAME: z.string().default("waas_refresh"),
  COOKIE_SECURE: booleanString,
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  ENCRYPTION_KEY_BASE64: z.string().min(1),
  INTEGRATION_API_KEY: z.string().min(24).optional(),
  INTEGRATION_ADMIN_EMAIL: z.string().email().default("admin@demo.local"),
  // Integración de solo lectura con el ecosistema 1x10 (API .NET Core) para
  // traer la jerarquía Territorio/Administrador/Gerente/Movilizador y sus
  // votantes. Se loguea como un usuario de servicio ya existente en ese
  // sistema; si no se configura, las rutas /voto1x10/* quedan deshabilitadas.
  VOTO1X10_API_BASE_URL: optionalUrl,
  VOTO1X10_SERVICE_USERNAME: z.string().optional(),
  VOTO1X10_SERVICE_PASSWORD: z.string().optional(),
  WORKER_ID: z.string().default("windows-worker-1"),
  WHATSAPP_GATEWAY_MODE: z.enum(["BAILEYS", "MOCK"]).default("BAILEYS"),
  OBJECT_STORAGE_MODE: z.enum(["S3", "MOCK"]).default("S3"),
  SESSION_LEASE_SECONDS: z.coerce.number().int().positive().default(30),
  SESSION_SUPERVISOR_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  QUEUE_LOCK_SECONDS: z.coerce.number().int().positive().default(60),
  QUEUE_SESSION_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  QUEUE_MAX_INFLIGHT: z.coerce.number().int().min(1).max(100).default(20),
  MESSAGE_RECONCILIATION_GRACE_MS: z.coerce.number().int().positive().default(90000),
  MESSAGE_RECONCILIATION_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  RECURRING_CAMPAIGN_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  SEND_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(2500),
  SEND_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(5000),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(2).max(20).default(3),
  CIRCUIT_BREAKER_RETRY_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  AUTO_FAILOVER_ENABLED: booleanString,
  AUTO_FAILOVER_WAIT_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  AUTO_FAILOVER_MAX_TARGETS: z.coerce.number().int().min(1).max(20).default(3),
  SESSION_QUARANTINE_MINUTES: z.coerce.number().int().min(1).max(10080).default(1440),
  DEFAULT_COUNTRY_REGION: z.string().length(2).default("PY"),
  DEFAULT_AUTO_REPLY: z.string().default("Gracias por escribirnos."),
  S3_ENDPOINT: optionalUrl,
  AWS_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("mock-local-bucket"),
  S3_FORCE_PATH_STYLE: booleanString,
  S3_SIGNED_URL_SECONDS: z.coerce.number().int().positive().default(900),
  MEDIA_UPLOAD_URL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  MAX_MEDIA_BYTES: z.coerce.number().int().positive().default(26214400),
  READINESS_REQUIRE_S3: booleanString,
  ENABLE_LEGACY_MEDIA_UPLOAD: booleanString,
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  WORKER_SHARD_MODE: z.enum(["AUTO", "STATIC"]).default("STATIC"),
  WORKER_SHARD_ID: z.coerce.number().int().nonnegative().default(0),
  WORKER_SHARD_COUNT: z.coerce.number().int().positive().default(1),
  WORKER_NODE_HEARTBEAT_MS: z.coerce.number().int().positive().default(10000),
  WORKER_NODE_LEASE_SECONDS: z.coerce.number().int().positive().default(30),
  EVENT_TRANSPORT: z.enum(["LOCAL", "SQS"]).default("LOCAL"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(20),
  OUTBOX_LOCK_SECONDS: z.coerce.number().int().positive().default(60),
  SQS_QUEUE_URL: optionalUrl,
  SQS_FIFO_GROUP_PREFIX: z.string().default("waas"),
  COORDINATION_PROVIDER: z.enum(["MEMORY", "REDIS"]).default("MEMORY"),
  REDIS_URL: optionalUrl,
  REDIS_KEY_PREFIX: z.string().default("waas"),
  GLOBAL_MAX_PENDING_MESSAGES: z.coerce.number().int().positive().default(500000),
  DEFAULT_MAX_SESSIONS: z.coerce.number().int().positive().default(5),
  DEFAULT_MAX_CONCURRENT_CAMPAIGNS: z.coerce.number().int().positive().default(3),
  DEFAULT_MAX_CAMPAIGN_CONTACTS: z.coerce.number().int().positive().default(50000),
  DEFAULT_MAX_PENDING_MESSAGES: z.coerce.number().int().positive().default(100000),
  DEFAULT_MONTHLY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(1000000),
  PROXY_URL: z.string().optional(),
  /**
   * Cuántas "IPs virtuales" repartir entre las sesiones de WhatsApp de este
   * servidor, agrupando varias sesiones por IP residencial en vez de pedir
   * una IP distinta por cada una (a gran escala el pool de IPs residenciales
   * del proveedor no da abasto 1 a 1). Sin configurar, no se agrupa nada y
   * PROXY_URL se usa tal cual (comportamiento anterior). Ajustar por
   * servidor según su cantidad de sesiones: ej. 2000 sesiones / 300 buckets
   * ≈ 6-7 sesiones por IP.
   */
  PROXY_IP_BUCKET_COUNT: z.coerce.number().int().positive().optional(),
  /** Minutos de "sticky session" a pedirle al proveedor de proxy por IP asignada (formato Decodo: -sessionduration-N). */
  PROXY_STICKY_MINUTES: z.coerce.number().int().positive().default(30),
});

const parsed = schema.parse(process.env);
export const env = {
  ...parsed,
  WORKER_ID: parsed.WORKER_ID || "windows-worker-1",
};
