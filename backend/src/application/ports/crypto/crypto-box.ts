export interface ICryptoBox {
  encrypt(plain: Buffer): Buffer;
  decrypt(encrypted: Buffer): Buffer;
}
