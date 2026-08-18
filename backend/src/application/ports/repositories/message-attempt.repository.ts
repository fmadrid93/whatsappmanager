export interface AttemptPreparation {
  id: string;
  decision: "SEND" | "WAIT" | "ALREADY_SENT";
  whatsappMessageId?: string;
  retryAt?: Date;
}

export interface ReconciliationCandidate {
  id: string;
  queueItemId: string;
  campaignId: string;
  sessionId: string;
  clientMessageId: string;
  whatsappMessageId?: string;
}

export interface IMessageAttemptRepository {
  prepare(input: {
    tenantId: string;
    queueItemId: string;
    campaignId: string;
    sessionId: string;
    clientMessageId: string;
    reconcileAfter: Date;
  }): Promise<AttemptPreparation>;
  markSubmitted(attemptId: string, whatsappMessageId: string): Promise<void>;
  markCompleted(attemptId: string, whatsappMessageId: string): Promise<void>;
  markFailed(attemptId: string, errorCode: string, errorMessage: string): Promise<void>;
  reconcileByMessageId(sessionId: string, whatsappMessageId: string, status: string): Promise<boolean>;
  listDue(limit: number): Promise<ReconciliationCandidate[]>;
  markUnconfirmedForRetry(attemptId: string, errorMessage: string): Promise<void>;
}
