import type { WASocket } from "@whiskeysockets/baileys";
import type { IWhatsAppSocketRegistry } from "../../application/ports/whatsapp/socket-registry.js";

export class BaileysSocketRegistry implements IWhatsAppSocketRegistry {
  private readonly sockets = new Map<string, WASocket>();

  has(sessionId: string): boolean {
    return this.sockets.has(sessionId);
  }

  get(sessionId: string): WASocket {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new Error(`La sesión ${sessionId} no está conectada en este worker.`);
    return socket;
  }

  set(sessionId: string, socket: WASocket): void {
    this.sockets.set(sessionId, socket);
  }

  delete(sessionId: string): void {
    this.sockets.delete(sessionId);
  }

  ids(): string[] {
    return [...this.sockets.keys()];
  }
}
