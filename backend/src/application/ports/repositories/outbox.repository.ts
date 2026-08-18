import type { OutboxTransportEvent } from "../events/event-transport.js";

export interface OutboxRecord extends OutboxTransportEvent {
  status: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface IOutboxRepository {
  claimBatch(input: {
    workerId: string;
    limit: number;
    lockExpiresAt: Date;
  }): Promise<OutboxRecord[]>;
  markPublished(ids: string[]): Promise<void>;
  markFailed(input: {
    ids: string[];
    errorMessage: string;
    retryAt: Date;
  }): Promise<void>;
  countPending(): Promise<number>;
}
