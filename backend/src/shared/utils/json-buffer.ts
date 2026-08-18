/**
 * Prisma ORM 6 representa los campos Bytes como Uint8Array.
 * Esta funcion crea una copia respaldada especificamente por ArrayBuffer,
 * evitando incompatibilidades con Buffer<ArrayBufferLike> en TypeScript 5.9.
 */
export function toPrismaBytes(
  value: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

export function encodeJson(value: unknown): Uint8Array<ArrayBuffer> {
  return toPrismaBytes(Buffer.from(JSON.stringify(value), "utf8"));
}

export function decodeJson<T>(
  value: Uint8Array<ArrayBufferLike> | null | undefined,
): T {
  if (!value) throw new Error("No existe payload JSON.");
  return JSON.parse(Buffer.from(value).toString("utf8")) as T;
}
