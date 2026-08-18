import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { IEventTransport, OutboxTransportEvent } from "../../application/ports/events/event-transport.js";

export class SqsEventTransport implements IEventTransport {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string,
    private readonly groupPrefix: string,
  ) {
    this.client = new SQSClient({ region });
  }

  async publish(events: OutboxTransportEvent[]): Promise<void> {
    for (let offset = 0; offset < events.length; offset += 10) {
      const batch = events.slice(offset, offset + 10);
      const fifo = this.queueUrl.endsWith(".fifo");
      const result = await this.client.send(new SendMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: batch.map((event) => ({
          Id: event.id.replaceAll("-", "").slice(0, 80),
          MessageBody: JSON.stringify({
            id: event.id,
            tenantId: event.tenantId,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payloadBase64: event.payload.toString("base64"),
            createdAt: event.createdAt.toISOString(),
          }),
          ...(fifo
            ? {
                MessageGroupId: `${this.groupPrefix}:${event.tenantId ?? "system"}`.slice(0, 128),
                MessageDeduplicationId: event.id,
              }
            : {}),
        })),
      }));
      if (result.Failed?.length) {
        throw new Error(`SQS rechazó ${result.Failed.length} eventos: ${result.Failed.map((item: { Message?: string }) => item.Message).join("; ")}`);
      }
    }
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
