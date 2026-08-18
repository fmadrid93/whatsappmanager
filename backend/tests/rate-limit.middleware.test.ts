import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "../src/api/middleware/rate-limit.middleware.js";
import type { IRateLimitStore } from "../src/application/ports/security/rate-limit-store.js";

class FakeStore implements IRateLimitStore {
  count = 0;
  async consume(input: { now: Date; windowMs: number }) {
    this.count += 1;
    return { count: this.count, resetAt: new Date(input.now.getTime() + input.windowMs) };
  }
}

test("distributed rate limiter blocks after the configured limit", async () => {
  const store = new FakeStore();
  const middleware = createRateLimiter({ windowMs: 60_000, max: 1, store });

  function execute(): Promise<{ status?: number; nextCalled: boolean }> {
    return new Promise((resolve, reject) => {
      const result: { status?: number; nextCalled: boolean } = { nextCalled: false };
      const request = { ip: "127.0.0.1", body: {} } as never;
      const response = {
        setHeader() {},
        status(code: number) { result.status = code; return this; },
        json() { resolve(result); },
      } as never;
      const next = (error?: unknown) => {
        if (error) reject(error);
        else { result.nextCalled = true; resolve(result); }
      };
      void middleware(request, response, next);
    });
  }

  const first = await execute();
  const second = await execute();
  assert.equal(first.nextCalled, true);
  assert.equal(second.status, 429);
});
