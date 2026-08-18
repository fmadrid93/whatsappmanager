import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { AppContainer } from "../container.js";
import { createRoutes } from "./routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { requestContextMiddleware } from "./middleware/request-context.middleware.js";
import { createRateLimiter } from "./middleware/rate-limit.middleware.js";
import { metricsMiddleware } from "./middleware/metrics.middleware.js";
import { metrics } from "../shared/observability/metrics.js";

export interface ApiRuntimeState {
  shuttingDown: boolean;
}

export function createApp(
  container: AppContainer,
  runtimeState: ApiRuntimeState = { shuttingDown: false },
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", container.env.TRUST_PROXY);
  app.use(requestContextMiddleware);
  app.use(metricsMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || container.env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error("Origen no permitido por CORS."));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "2mb" }));
  app.use(createRateLimiter({
    windowMs: container.env.API_RATE_LIMIT_WINDOW_MS,
    max: container.env.API_RATE_LIMIT_MAX,
  }));

  app.get("/health/live", (_request, response) => response.json({
    status: "alive",
    version: container.env.APP_VERSION,
    environment: container.env.DEPLOYMENT_ENV,
    commit: container.env.BUILD_COMMIT,
  }));

  app.get("/version", (_request, response) => response.json({
    name: "whatsapp-saas",
    version: container.env.APP_VERSION,
    environment: container.env.DEPLOYMENT_ENV,
    commit: container.env.BUILD_COMMIT,
    node: process.version,
    modes: { whatsappGateway: container.env.WHATSAPP_GATEWAY_MODE, objectStorage: container.env.OBJECT_STORAGE_MODE },
  }));

  app.get("/metrics", (request, response) => {
    if (container.env.METRICS_TOKEN && request.headers.authorization !== `Bearer ${container.env.METRICS_TOKEN}`) {
      return response.status(401).send("Unauthorized");
    }
    response.type("text/plain; version=0.0.4").send(metrics.render());
  });

  app.get("/health/ready", async (_request, response) => {
    if (runtimeState.shuttingDown) {
      return response.status(503).json({ status: "draining" });
    }

    const checks: Record<string, string> = {};
    try {
      await container.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    try {
      await container.storage.healthCheck();
      checks.s3 = "ok";
    } catch {
      checks.s3 = "error";
    }

    const databaseReady = checks.database === "ok";
    const s3Ready = !container.env.READINESS_REQUIRE_S3 || checks.s3 === "ok";
    const ready = databaseReady && s3Ready;

    return response.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks,
      version: container.env.APP_VERSION,
    });
  });

  app.get("/health", (_request, response) => response.redirect(307, "/health/ready"));
  app.use("/api", createRoutes(container));
  app.use(errorMiddleware);
  return app;
}
