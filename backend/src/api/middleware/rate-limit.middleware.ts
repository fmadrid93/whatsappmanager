import type { Request, RequestHandler } from "express";
import type { IRateLimitStore } from "../../application/ports/security/rate-limit-store.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key?: (request: Request) => string;
  message?: string;
  store?: IRateLimitStore;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  return async (request, response, next) => {
    try {
      const now = Date.now();
      const key = options.key?.(request) ?? request.ip ?? "unknown";

      let count: number;
      let resetAt: number;

      if (options.store) {
        const result = await options.store.consume({
          key,
          now: new Date(now),
          windowMs: options.windowMs,
        });
        count = result.count;
        resetAt = result.resetAt.getTime();
      } else {
        if (now - lastCleanup > options.windowMs) {
          for (const [entryKey, value] of entries) {
            if (value.resetAt <= now) entries.delete(entryKey);
          }
          lastCleanup = now;
        }

        const current = entries.get(key);
        const entry = !current || current.resetAt <= now
          ? { count: 0, resetAt: now + options.windowMs }
          : current;
        entry.count += 1;
        entries.set(key, entry);
        count = entry.count;
        resetAt = entry.resetAt;
      }

      response.setHeader("RateLimit-Limit", String(options.max));
      response.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - count)));
      response.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

      if (count > options.max) {
        response.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
        response.status(429).json({
          code: "RATE_LIMITED",
          message: options.message ?? "Demasiadas solicitudes. Intenta nuevamente más tarde.",
          requestId: request.requestId,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
