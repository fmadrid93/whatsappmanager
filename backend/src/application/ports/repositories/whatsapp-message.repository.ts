export interface SaveWhatsAppMessageInput {
  tenantId: string;
  sessionId: string;
  conversationId?: string;
  campaignId?: string;
  queueItemId?: string;
  whatsappMessageId: string;
  remoteJid: string;
  participantJid?: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  status: string;
  fromMe: boolean;
  payload: Buffer;
  messageTimestamp: Date;
}

export interface SaveMessageReceiptInput {
  sessionId: string;
  whatsappMessageId: string;
  receiptType: string;
  participantJid?: string;
  receiptAt: Date;
  payload?: Buffer;
}

export interface IWhatsAppMessageRepository {
  reserveInboundEvent(input: {
    tenantId: string;
    sessionId: string;
    whatsappMessageId: string;
  }): Promise<boolean>;
  releaseInboundEvent(sessionId: string, whatsappMessageId: string): Promise<void>;
  setInboundResponse(sessionId: string, whatsappMessageId: string, responseMessageId: string): Promise<void>;
  save(input: SaveWhatsAppMessageInput): Promise<void>;
  getMessagePayload(sessionId: string, whatsappMessageId: string): Promise<Buffer | null>;
  exists(sessionId: string, whatsappMessageId: string): Promise<boolean>;
  updateStatus(sessionId: string, whatsappMessageId: string, status: string): Promise<void>;
  saveReceipt(input: SaveMessageReceiptInput): Promise<void>;
}
