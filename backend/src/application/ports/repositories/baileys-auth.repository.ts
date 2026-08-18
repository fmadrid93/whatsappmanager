export interface IBaileysAuthRepository {
  getCredentials(sessionId: string): Promise<Buffer | null>;
  saveCredentials(sessionId: string, payload: Buffer): Promise<void>;
  getKeys(sessionId: string, category: string, ids: string[]): Promise<Record<string, Buffer>>;
  setKey(sessionId: string, category: string, id: string, payload: Buffer | null): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
}
