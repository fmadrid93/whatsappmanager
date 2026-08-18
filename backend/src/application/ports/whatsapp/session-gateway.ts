export interface ISessionGateway {
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  requestPairingCode(sessionId: string, phoneE164?: string): Promise<string>;
}
