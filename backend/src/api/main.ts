import { buildContainer } from "../container.js";
import { connectDatabase, disconnectDatabase } from "../infrastructure/database/prisma.js";
import { createApp, type ApiRuntimeState } from "./app.js";
import { logger } from "../shared/logger/logger.js";

const container = buildContainer();
const runtimeState: ApiRuntimeState = { shuttingDown: false };

await connectDatabase();
await container.storage.ensureBucket();

const app = createApp(container, runtimeState);
const server = app.listen(container.env.API_PORT, "0.0.0.0", () => {
  logger.info({
    port: container.env.API_PORT,
    version: container.env.APP_VERSION,
    environment: container.env.DEPLOYMENT_ENV,
    commit: container.env.BUILD_COMMIT,
  }, "API iniciada.");
});

let shutdownStarted = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  runtimeState.shuttingDown = true;
  logger.info({ signal }, "API entrando en modo de drenaje.");

  const forceTimer = setTimeout(() => {
    logger.error("El cierre ordenado de la API excedió el tiempo máximo.");
    server.closeAllConnections?.();
    process.exit(1);
  }, container.env.SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceTimer);
    if (error) logger.error({ error }, "Error cerrando el servidor HTTP.");
    await container.scaling.eventTransport.close();
    await container.scaling.coordination.close();
    await disconnectDatabase();
    process.exit(error ? 1 : 0);
  });
  server.closeIdleConnections?.();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
