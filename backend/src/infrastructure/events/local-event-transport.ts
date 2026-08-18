import type { ICoordinationBus } from "../../application/ports/coordination/coordination-bus.js";
import type { IEventTransport, OutboxTransportEvent } from "../../application/ports/events/event-transport.js";

export class LocalEventTransport implements IEventTransport {
  constructor(private readonly coordination: ICoordinationBus) {}

  async publish(events: OutboxTransportEvent[]): Promise<void> {
    for (const event of events) {
      await this.coordination.publish(
        `events:${event.eventType}`,
        JSON.stringify({
          id: event.id,
          tenantId: event.tenantId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payloadBase64: event.payload.toString("base64"),
          createdAt: event.createdAt.toISOString(),
        }),
      );
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
