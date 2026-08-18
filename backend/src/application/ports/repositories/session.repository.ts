export type PairingMethod = "QR" | "CODE";

export interface SessionRecord {
  id: string;
  tenantId: string;
  ownerUserId: string;
  name: string;
  expectedPhoneE164?: string;
  phoneE164?: string;
  whatsappJid?: string;
  pairingMethod: PairingMethod;
  pairingCode?: string;
  pairingCodeUpdatedAt?: Date;
  status: string;
  isBotActive: boolean;
  disconnectReason?: string;
  lastConnectionCode?: number;
  lastConnectionError?: string;
  lastConnectionAt?: Date;
  qrCode?: string;
  qrUpdatedAt?: Date;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  lastHeartbeatAt?: Date;
  shardKey: number;
}

export interface CreateSessionInput {
  tenantId: string;
  ownerUserId: string;
  name: string;
  expectedPhoneE164?: string;
  pairingMethod: PairingMethod;
}

export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  listByTenant(tenantId: string): Promise<SessionRecord[]>;
  findById(id: string): Promise<SessionRecord | null>;
  findByIdForTenant(id: string, tenantId: string): Promise<SessionRecord | null>;
  listStartCandidates(limit: number): Promise<SessionRecord[]>;
  acquireLease(sessionId: string, workerId: string, expiresAt: Date): Promise<boolean>;
  renewLease(sessionId: string, workerId: string, expiresAt: Date): Promise<boolean>;
  releaseLease(sessionId: string, workerId: string): Promise<void>;
  updateStatus(
    sessionId: string,
    status: string,
    data?: {
      disconnectReason?: string | null;
      phoneE164?: string | null;
      whatsappJid?: string | null;
      connectedAt?: Date | null;
      disconnectedAt?: Date | null;
      lastConnectionCode?: number | null;
      lastConnectionError?: string | null;
      lastConnectionAt?: Date | null;
      clearQr?: boolean;
      clearPairingCode?: boolean;
    },
  ): Promise<void>;
  saveQr(sessionId: string, qr: string): Promise<void>;
  savePairingCode(sessionId: string, code: string): Promise<void>;
  setBotActive(sessionId: string, tenantId: string, active: boolean): Promise<void>;
  quarantine(sessionId: string, reason: string, connectionCode?: number): Promise<void>;
  requestRelink(sessionId: string, tenantId: string): Promise<void>;
  archive(sessionId: string, tenantId: string): Promise<void>;
  listConnectedOwnedByWorker(workerId: string): Promise<SessionRecord[]>;
  findFailoverSession(campaignId: string, failedSessionId: string): Promise<SessionRecord | null>;
}
