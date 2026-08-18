export interface OutboxTransportEvent {
  id: string;
  tenantId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Buffer;
  createdAt: Date;
}

export interface IEventTransport {
  publish(events: OutboxTransportEvent[]): Promise<void>;
  close(): Promise<void>;
}
