import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;
import type { ICoordinationBus } from "../../application/ports/coordination/coordination-bus.js";
import { logger } from "../../shared/logger/logger.js";

export class RedisCoordinationBus implements ICoordinationBus {
  private client?: RedisClient;
  private connecting?: Promise<RedisClient>;

  constructor(
    private readonly url: string,
    private readonly keyPrefix: string,
  ) {}

  private async getClient(): Promise<RedisClient> {
    if (this.client?.isOpen) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = createClient({ url: this.url });
        client.on("error", (error: unknown) => logger.error({ error }, "Error de coordinación Redis/Valkey."));
        await client.connect();
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = undefined;
      });
    }
    return this.connecting;
  }

  async publish(channel: string, payload: string): Promise<void> {
    const client = await this.getClient();
    await client.publish(`${this.keyPrefix}:${channel}`, payload);
  }

  async close(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit();
  }
}
