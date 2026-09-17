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

const sessionKeyCache = new Map<string, Map<string, unknown>>();

export function clearSessionMemoryCache(sessionId: string): void {
  sessionKeyCache.delete(sessionId);
}

function getSessionKeyCache(sessionId: string): Map<string, unknown> {
  let cache = sessionKeyCache.get(sessionId);
  if (!cache) {
    cache = new Map<string, unknown>();
    sessionKeyCache.set(sessionId, cache);
  }
  return cache;
}

export class BaileysAuthStateFactory {
  constructor(private readonly repository: IBaileysAuthRepository) {}

  async create(sessionId: string): Promise<{ state: AuthenticationState; saveCreds: (update?: Partial<AuthenticationCreds>) => Promise<void> }> {
    const stored = await this.repository.getCredentials(sessionId);
    const creds: AuthenticationCreds = stored
      ? deserialize<AuthenticationCreds>(stored)
      : initAuthCreds();

    // Cache en memoria por sesión persistente entre reinicios de socket (515/Stream Restart)
    // para resolver claves criptográficas inmediatamente (0 ms) sin latencia WAN ni bloqueos.
    const keyCache = getSessionKeyCache(sessionId);

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: Record<string, unknown> = {};
          const missingIds: string[] = [];

          for (const id of ids) {
            const cacheKey = `${type}:${id}`;
            if (keyCache.has(cacheKey)) {
              result[id] = keyCache.get(cacheKey);
            } else {
              missingIds.push(id);
            }
          }

          if (missingIds.length > 0) {
            const rows = await this.repository.getKeys(sessionId, type, missingIds);
            for (const id of missingIds) {
              const payload = rows[id];
              if (!payload) continue;
              const value = deserialize<unknown>(payload);
              const processed =
                type === "app-state-sync-key" && value
                  ? proto.Message.AppStateSyncKeyData.fromObject(value as never)
                  : value;
              keyCache.set(`${type}:${id}`, processed);
              result[id] = processed;
            }
          }

          return result as never;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const [category, categoryValues] of Object.entries(data)) {
            for (const [id, value] of Object.entries(categoryValues ?? {})) {
              const cacheKey = `${category}:${id}`;
              if (value) {
                keyCache.set(cacheKey, value);
                tasks.push(
                  this.repository.setKey(
                    sessionId,
                    category,
                    id,
                    serialize(value),
                  ),
                );
              } else {
                keyCache.delete(cacheKey);
                tasks.push(
                  this.repository.setKey(
                    sessionId,
                    category,
                    id,
                    null,
                  ),
                );
              }
            }
          }
          if (tasks.length > 0) {
            // Persistencia asíncrona sin bloquear el handshake
            void Promise.all(tasks).catch(() => {});
          }
        },
      },
    };

    return {
      state,
      saveCreds: async (update?: Partial<AuthenticationCreds>) => {
        if (update) {
          Object.assign(creds, update);
        }
        await this.repository.saveCredentials(sessionId, serialize(creds));
      },
    };
  }
}
