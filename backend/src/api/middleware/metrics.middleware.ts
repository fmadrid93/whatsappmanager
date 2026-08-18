import type { NextFunction, Request, Response } from "express";
import { metrics } from "../../shared/observability/metrics.js";

function normalizePath(path: string): string {
  return path
    .split("?")[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function metricsMiddleware(request: Request, response: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  response.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const labels = {
      method: request.method,
      route: normalizePath(request.originalUrl),
      status: response.statusCode,
    };
    metrics.increment("http_requests_total", "Total HTTP requests.", labels);
    metrics.observeSeconds("http_request_duration_seconds", "HTTP request duration.", labels, duration);
  });
  next();
}
