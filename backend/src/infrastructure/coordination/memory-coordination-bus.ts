import type { ICoordinationBus } from "../../application/ports/coordination/coordination-bus.js";
import { logger } from "../../shared/logger/logger.js";

export class MemoryCoordinationBus implements ICoordinationBus {
  async publish(channel: string, payload: string): Promise<void> {
    logger.debug({ channel, bytes: Buffer.byteLength(payload) }, "Evento de coordinación local publicado.");
  }

  async close(): Promise<void> {}
}
