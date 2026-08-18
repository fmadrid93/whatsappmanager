import http from "node:http";
import { metrics } from "./metrics.js";
import { logger } from "../logger/logger.js";

export interface MetricsServerOptions {
  version?: string;
  environment?: string;
  commit?: string;
  isReady?: () => boolean;
}

export function startMetricsServer(
  port: number,
  token?: string,
  options: MetricsServerOptions = {},
): http.Server {
  const server = http.createServer((request, response) => {
    if (request.url === "/health/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        status: "alive",
        version: options.version,
        environment: options.environment,
        commit: options.commit,
      }));
      return;
    }

    if (request.url === "/health/ready") {
      const ready = options.isReady?.() ?? true;
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ready" : "draining" }));
      return;
    }

    if (request.url !== "/metrics") {
      response.writeHead(404).end();
      return;
    }

    if (token && request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
    response.end(metrics.render());
  });

  server.listen(port, "0.0.0.0", () => logger.info({ port }, "Servidor de métricas iniciado."));
  return server;
}
