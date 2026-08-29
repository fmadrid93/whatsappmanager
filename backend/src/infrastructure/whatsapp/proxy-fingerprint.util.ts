import crypto from "node:crypto";
import { Browsers } from "@whiskeysockets/baileys";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * A gran escala (miles de sesiones de WhatsApp por servidor) no alcanza con
 * pedirle al proveedor de proxy una IP residencial distinta por cada sesión
 * — el pool de IPs reales de un país no da para eso. En cambio, se agrupan
 * varias sesiones por IP ("bucket"), de forma ESTABLE (la misma sesión
 * siempre cae en el mismo bucket) para que WhatsApp vea algo parecido a
 * varias personas compartiendo un mismo wifi hogareño, no una IP que salta
 * de número en número. El tamaño del grupo lo define PROXY_IP_BUCKET_COUNT
 * en el .env de cada servidor, según su propia cantidad de sesiones.
 */

function stableHash(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

/** Bucket estable [0, bucketCount) para una sesión dada. */
export function hashToBucket(sessionId: string, bucketCount: number): number {
  const hash = stableHash(sessionId);
  return hash.readUInt32BE(0) % bucketCount;
}

/**
 * Arma el HttpsProxyAgent para una sesión. Si PROXY_IP_BUCKET_COUNT está
 * configurado, agrega el sufijo de sticky-session de Decodo
 * (`-session-<bucket>-sessionduration-<minutos>`) al usuario del proxy para
 * que ese bucket de sesiones comparta siempre la misma IP asignada. Sin
 * bucketCount configurado, usa PROXY_URL tal cual (sin pin de sesión).
 */
export function buildProxyAgent(
  sessionId: string,
  options: { proxyUrl?: string; bucketCount?: number; stickyMinutes: number },
): HttpsProxyAgent<string> | undefined {
  const raw = options.proxyUrl?.trim();
  if (!raw) return undefined;

  if (!options.bucketCount || options.bucketCount <= 0) {
    return new HttpsProxyAgent(raw);
  }

  try {
    const url = new URL(raw);
    const bucket = hashToBucket(sessionId, options.bucketCount);
    const baseUser = decodeURIComponent(url.username);
    url.username = encodeURIComponent(`${baseUser}-session-bucket${bucket}-sessionduration-${options.stickyMinutes}`);
    return new HttpsProxyAgent(url.toString());
  } catch {
    // PROXY_URL no tiene forma de URL estándar (usuario/clave embebidos de otra manera);
    // se usa tal cual para no romper la conexión por un formato inesperado.
    return new HttpsProxyAgent(raw);
  }
}

const FINGERPRINT_PLATFORMS: Array<(browser: string) => [string, string, string]> = [
  Browsers.macOS,
  Browsers.windows,
  Browsers.ubuntu,
];
const FINGERPRINT_BROWSER_NAMES = ["Chrome", "Firefox", "Edge", "Safari"];

/**
 * Elige una "huella" de dispositivo (SO + navegador) estable por sesión,
 * pero variada entre sesiones distintas. Miles de sesiones anunciándose
 * todas como el mismo "Mac OS / Chrome" es, en sí mismo, una señal de bot
 * tan fuerte como compartir IP — hay que diversificar esto también.
 */
export function pickBrowserFingerprint(sessionId: string): [string, string, string] {
  const hash = stableHash(sessionId);
  const platformPick = FINGERPRINT_PLATFORMS[hash.readUInt8(0) % FINGERPRINT_PLATFORMS.length] ?? Browsers.macOS;
  const browserName = FINGERPRINT_BROWSER_NAMES[hash.readUInt8(1) % FINGERPRINT_BROWSER_NAMES.length] ?? "Chrome";
  return platformPick(browserName);
}
