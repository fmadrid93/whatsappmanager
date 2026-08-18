import { promises as fs } from "node:fs";
import path from "node:path";
import type { IObjectStorage, StoredObjectMetadata } from "../../application/ports/storage/object-storage.js";

interface StoredMockMetadata {
  contentType: string;
  eTag: string;
}

/**
 * Almacenamiento local de desarrollo compartido entre procesos.
 *
 * La API y el Worker se ejecutan como procesos distintos, por lo que un Map en
 * memoria hace que el Worker no pueda leer los archivos subidos por la API.
 * Esta implementación persiste el contenido en disco y devuelve una ruta local
 * absoluta que Baileys puede abrir directamente.
 */
export class MockObjectStorage implements IObjectStorage {
  constructor(
    private readonly rootDirectory = path.resolve(process.cwd(), ".mock-object-storage"),
  ) {}

  async ensureBucket(): Promise<void> {
    await fs.mkdir(this.rootDirectory, { recursive: true });
  }

  async healthCheck(): Promise<void> {
    await this.ensureBucket();
    await fs.access(this.rootDirectory);
  }

  async putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    const objectPath = this.resolveObjectPath(input.key);
    await fs.mkdir(path.dirname(objectPath), { recursive: true });

    const metadata: StoredMockMetadata = {
      contentType: input.contentType,
      eTag: `mock-${input.body.length}`,
    };

    await Promise.all([
      fs.writeFile(objectPath, input.body),
      fs.writeFile(this.metadataPath(objectPath), JSON.stringify(metadata), "utf8"),
    ]);
  }

  async createSignedReadUrl(key: string, _expiresInSeconds: number): Promise<string> {
    const objectPath = this.resolveObjectPath(key);
    await fs.access(objectPath);

    // Baileys acepta una ruta absoluta local y la abre con fs.createReadStream.
    return objectPath;
  }

  async createSignedWriteUrl(
    key: string,
    _contentType: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    // Las cargas MOCK pasan por POST /api/media. Se conserva este valor para
    // detectar claramente un uso incorrecto del flujo de carga directa.
    return `mock://storage/write/${encodeURIComponent(key)}`;
  }

  async headObject(key: string): Promise<StoredObjectMetadata> {
    const objectPath = this.resolveObjectPath(key);
    const [stat, metadata] = await Promise.all([
      fs.stat(objectPath),
      this.readMetadata(objectPath),
    ]);

    return {
      sizeBytes: stat.size,
      contentType: metadata?.contentType,
      eTag: metadata?.eTag ?? `mock-${stat.size}`,
    };
  }

  async readObjectPrefix(key: string, maxBytes: number): Promise<Buffer> {
    const objectPath = this.resolveObjectPath(key);
    const bytesToRead = Math.max(0, Math.trunc(maxBytes));
    if (bytesToRead === 0) return Buffer.alloc(0);

    const handle = await fs.open(objectPath, "r");
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async deleteObject(key: string): Promise<void> {
    const objectPath = this.resolveObjectPath(key);
    await Promise.all([
      fs.rm(objectPath, { force: true }),
      fs.rm(this.metadataPath(objectPath), { force: true }),
    ]);
    await this.removeEmptyParents(path.dirname(objectPath));
  }

  private resolveObjectPath(key: string): string {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = normalized.split("/").filter(Boolean);

    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`Clave de objeto mock inválida: ${key}`);
    }

    const resolved = path.resolve(this.rootDirectory, ...segments);
    const relative = path.relative(this.rootDirectory, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`La clave sale del almacenamiento mock: ${key}`);
    }
    return resolved;
  }

  private metadataPath(objectPath: string): string {
    return `${objectPath}.metadata.json`;
  }

  private async readMetadata(objectPath: string): Promise<StoredMockMetadata | undefined> {
    try {
      const raw = await fs.readFile(this.metadataPath(objectPath), "utf8");
      return JSON.parse(raw) as StoredMockMetadata;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async removeEmptyParents(directory: string): Promise<void> {
    let current = directory;
    while (current !== this.rootDirectory && current.startsWith(this.rootDirectory)) {
      try {
        await fs.rmdir(current);
      } catch {
        return;
      }
      current = path.dirname(current);
    }
  }
}
