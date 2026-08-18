import type { WASocket } from "@whiskeysockets/baileys";

export interface IWhatsAppSocketRegistry {
  has(sessionId: string): boolean;
  get(sessionId: string): WASocket;
  set(sessionId: string, socket: WASocket): void;
  delete(sessionId: string): void;
  ids(): string[];
}
