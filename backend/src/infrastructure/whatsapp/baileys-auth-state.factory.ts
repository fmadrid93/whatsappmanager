import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import type { IBaileysAuthRepository } from "../../application/ports/repositories/baileys-auth.repository.js";

function serialize(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf8");
}

function deserialize<T>(value: Buffer): T {
  return JSON.parse(value.toString("utf8"), BufferJSON.reviver) as T;
}

export class BaileysAuthStateFactory {
  constructor(private readonly repository: IBaileysAuthRepository) {}

  async create(sessionId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const stored = await this.repository.getCredentials(sessionId);
    const creds: AuthenticationCreds = stored
      ? deserialize<AuthenticationCreds>(stored)
      : initAuthCreds();

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async (type, ids) => {
          const rows = await this.repository.getKeys(sessionId, type, ids);
          const result: Record<string, unknown> = {};
          for (const id of ids) {
            const payload = rows[id];
            if (!payload) continue;
            const value = deserialize<unknown>(payload);
            result[id] =
              type === "app-state-sync-key" && value
                ? proto.Message.AppStateSyncKeyData.create(value as never)
                : value;
          }
          return result as never;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const [category, categoryValues] of Object.entries(data)) {
            for (const [id, value] of Object.entries(categoryValues ?? {})) {
              tasks.push(
                this.repository.setKey(
                  sessionId,
                  category,
                  id,
                  value ? serialize(value) : null,
                ),
              );
            }
          }
          if (tasks.length > 0) {
            await Promise.all(tasks);
          }
        },

      },
    };

    return {
      state,
      saveCreds: async () => this.repository.saveCredentials(sessionId, serialize(creds)),
    };
  }
}
