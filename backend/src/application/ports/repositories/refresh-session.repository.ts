export interface RefreshSessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface CreateRefreshSessionInput {
  tenantId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface IRefreshSessionRepository {
  create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  rotate(currentId: string, replacement: CreateRefreshSessionInput): Promise<RefreshSessionRecord>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
