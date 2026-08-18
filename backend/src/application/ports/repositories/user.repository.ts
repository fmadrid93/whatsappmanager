export interface UserAuthRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  status: string;
}

export interface ActiveUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserAuthRecord | null>;
  findById(id: string): Promise<UserAuthRecord | null>;
  listActiveByTenant(tenantId: string): Promise<ActiveUserSummary[]>;
}
