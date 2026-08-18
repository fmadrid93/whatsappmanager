import crypto from "node:crypto";
import type { ICryptoBox } from "../../application/ports/crypto/crypto-box.js";

export class AesGcmCryptoBox implements ICryptoBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) {
      throw new Error("ENCRYPTION_KEY_BASE64 debe decodificar exactamente 32 bytes.");
    }
  }

  encrypt(plain: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([1]), iv, tag, encrypted]);
  }

  decrypt(payload: Buffer): Buffer {
    const version = payload.subarray(0, 1).readUInt8();
    if (version !== 1) throw new Error(`Versión de cifrado no soportada: ${version}`);
    const iv = payload.subarray(1, 13);
    const tag = payload.subarray(13, 29);
    const encrypted = payload.subarray(29);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
