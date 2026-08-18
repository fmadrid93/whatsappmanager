import { isIP } from "node:net";
import type { ICryptoBox } from "../ports/crypto/crypto-box.js";
import type { IExternalConnectorExecutor } from "../ports/integrations/external-connector.executor.js";
import type {
  ExternalConnectorAuthType,
  ExternalConnectorContactMapping,
  ExternalConnectorOutcome,
  ExternalConnectorRecord,
  ExternalConnectorSecretRecord,
  IExternalConnectorRepository,
} from "../ports/repositories/external-connector.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const FORBIDDEN_CUSTOM_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
]);

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => variables[key] ?? "");
}

function interpolateUrl(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => encodeURIComponent(variables[key] ?? ""));
}

function readPath(source: unknown, rawPath: string | undefined): unknown {
  if (!rawPath || rawPath === "$" || rawPath === ".") return source;
  const path = rawPath
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current: unknown = source;
  for (const part of path) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

function isNotFoundValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "***");
    return url.toString().slice(0, 1000);
  } catch {
    return value.split("?")[0]?.slice(0, 1000) ?? "";
  }
}

function safePreview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
}

function validateHeaderName(name: string): string {
  const cleanName = name.trim();
  if (!cleanName || /[\r\n]/.test(cleanName)) {
    throw new HttpError(400, "El nombre del encabezado de autenticación no es válido.");
  }
  try {
    const probe = new Headers();
    probe.set(cleanName, "validation");
  } catch {
    throw new HttpError(400, "El nombre del encabezado de autenticación no es válido.");
  }
  return cleanName;
}

function normalizeHeaderMap(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const cleanKey = key.trim();
    const cleanValue = value.trim();
    if (!cleanKey || /[\r\n]/.test(cleanKey) || /[\r\n]/.test(cleanValue)) {
      throw new HttpError(400, "Los encabezados del conector contienen caracteres inválidos.");
    }
    if (FORBIDDEN_CUSTOM_HEADERS.has(cleanKey.toLowerCase())) {
      throw new HttpError(400, `El encabezado ${cleanKey} debe configurarse mediante la sección de autenticación.`);
    }
    try {
      const probe = new Headers();
      probe.set(cleanKey, cleanValue);
    } catch {
      throw new HttpError(400, `El encabezado ${cleanKey} no es válido.`);
    }
    result[cleanKey] = cleanValue;
  }
  return result;
}

export interface ExternalConnectorContactPreview {
  received: number;
  valid: number;
  invalid: number;
  contacts: Array<{ phone: string; name?: string; variables: Record<string, string> }>;
  errors: string[];
  outcome: ExternalConnectorOutcome;
  httpStatus?: number;
  errorMessage?: string;
}

interface RawExecution {
  connector: ExternalConnectorSecretRecord;
  outcome: ExternalConnectorOutcome;
  payload?: unknown;
  httpStatus?: number;
  durationMs: number;
  requestUrl: string;
  errorMessage?: string;
}

export class ExternalConnectorService implements IExternalConnectorExecutor {
  constructor(
    private readonly repository: IExternalConnectorRepository,
    private readonly cryptoBox: ICryptoBox,
    private readonly allowLoopback: boolean,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async create(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    purpose: "BOT_LOOKUP" | "CONTACT_SOURCE" | "GENERAL";
    method: "GET" | "POST";
    urlTemplate: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    authType: ExternalConnectorAuthType;
    authName?: string;
    secret?: string;
    timeoutMs?: number;
    itemsPath?: string;
    phonePath?: string;
    namePath?: string;
    contactMappings?: ExternalConnectorContactMapping[];
  }): Promise<ExternalConnectorRecord> {
    const name = input.name.trim();
    const urlTemplate = input.urlTemplate.trim();
    this.validateUrlTemplate(urlTemplate);
    let authName = input.authName?.trim() || undefined;
    const secret = input.secret && input.secret.length > 0 ? input.secret : undefined;
    if (input.authType !== "NONE" && !secret) throw new HttpError(400, "La credencial es obligatoria para este tipo de autenticación.");
    if ((input.authType === "API_KEY" || input.authType === "BASIC") && !authName) {
      throw new HttpError(400, "Debes indicar el nombre del encabezado o usuario de autenticación.");
    }
    if (input.authType === "API_KEY" && authName) authName = validateHeaderName(authName);
    if (input.authType === "BASIC" && authName && /[\r\n:]/.test(authName)) {
      throw new HttpError(400, "El usuario de autenticación Basic contiene caracteres inválidos.");
    }
    const mappings = (input.contactMappings ?? []).map((mapping) => ({
      sourcePath: mapping.sourcePath.trim(),
      targetVariable: mapping.targetVariable.trim(),
    })).filter((mapping) => mapping.sourcePath && mapping.targetVariable);
    if (input.purpose === "CONTACT_SOURCE" && !input.phonePath?.trim()) {
      throw new HttpError(400, "Una fuente de contactos necesita la ruta del teléfono.");
    }
    return this.repository.create({
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      name,
      purpose: input.purpose,
      method: input.method,
      urlTemplate,
      headers: normalizeHeaderMap(input.headers ?? {}),
      bodyTemplate: input.bodyTemplate?.trim() || undefined,
      authType: input.authType,
      authName,
      secretPayload: secret ? this.cryptoBox.encrypt(Buffer.from(secret, "utf8")) : undefined,
      timeoutMs: Math.min(Math.max(input.timeoutMs ?? 10000, 1000), 30000),
      itemsPath: input.itemsPath?.trim() || undefined,
      phonePath: input.phonePath?.trim() || undefined,
      namePath: input.namePath?.trim() || undefined,
      contactMappings: mappings,
    });
  }

  list(input: { tenantId: string; purpose?: "BOT_LOOKUP" | "CONTACT_SOURCE" | "GENERAL"; status?: string }) {
    return this.repository.listByTenant(input);
  }

  setStatus(tenantId: string, id: string, status: "ACTIVE" | "DISABLED") {
    return this.repository.setStatus(tenantId, id, status);
  }

  listExecutions(input: {
    tenantId: string;
    connectorId?: string;
    outcome?: ExternalConnectorOutcome;
    take?: number;
    skip?: number;
  }) {
    return this.repository.listExecutions({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      outcome: input.outcome,
      take: Math.min(Math.max(input.take ?? 100, 1), 500),
      skip: Math.max(input.skip ?? 0, 0),
    });
  }

  counts(tenantId: string) {
    return this.repository.counts(tenantId);
  }

  async test(input: { tenantId: string; connectorId: string; variables: Record<string, string> }) {
    const result = await this.executeRaw({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      contextType: "TEST",
      variables: input.variables,
    });
    return {
      outcome: result.outcome,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      requestUrl: result.requestUrl,
      preview: result.payload === undefined ? undefined : safePreview(result.payload),
      errorMessage: result.errorMessage,
    };
  }

  async previewContacts(input: {
    tenantId: string;
    connectorId: string;
    variables: Record<string, string>;
  }): Promise<ExternalConnectorContactPreview> {
    const raw = await this.executeRaw({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      contextType: "CONTACT_IMPORT",
      variables: input.variables,
      deferLog: true,
      requiredPurpose: "CONTACT_SOURCE",
    });
    const source = raw.outcome === "ERROR" ? undefined : readPath(raw.payload, raw.connector.itemsPath);
    const rows = Array.isArray(source) ? source : source === undefined || source === null ? [] : [source];
    const contacts: ExternalConnectorContactPreview["contacts"] = [];
    const errors: string[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const phone = asString(readPath(row, raw.connector.phonePath))?.trim() || "";
      if (!phone) {
        if (errors.length < 20) errors.push(`Fila ${index + 1}: no tiene teléfono.`);
        continue;
      }
      const name = asString(readPath(row, raw.connector.namePath))?.trim() || undefined;
      const variables: Record<string, string> = {};
      for (const mapping of raw.connector.contactMappings) {
        const value = asString(readPath(row, mapping.sourcePath));
        if (value !== undefined) variables[mapping.targetVariable] = value;
      }
      contacts.push({ phone, name, variables });
    }
    const outcome: ExternalConnectorOutcome = raw.outcome === "ERROR"
      ? "ERROR"
      : contacts.length > 0
        ? "SUCCESS"
        : "NOT_FOUND";
    await this.repository.createExecution({
      tenantId: input.tenantId,
      connectorId: raw.connector.id,
      contextType: "CONTACT_IMPORT",
      outcome,
      method: raw.connector.method,
      requestUrl: raw.requestUrl,
      responseStatus: raw.httpStatus,
      durationMs: raw.durationMs,
      mappedCount: contacts.length,
      errorMessage: raw.errorMessage,
    });
    return {
      received: rows.length,
      valid: contacts.length,
      invalid: rows.length - contacts.length,
      contacts,
      errors,
      outcome,
      httpStatus: raw.httpStatus,
      errorMessage: raw.errorMessage,
    };
  }

  async executeForFlow(input: {
    tenantId: string;
    connectorId: string;
    conversationId: string;
    variables: Record<string, string>;
    mappings: Array<{ sourcePath: string; targetVariable: string; defaultValue?: string }>;
    statusVariable: string;
  }) {
    try {
      const raw = await this.executeRaw({
        tenantId: input.tenantId,
        connectorId: input.connectorId,
        contextType: "BOT_FLOW",
        contextId: input.conversationId,
        variables: input.variables,
        deferLog: true,
        requiredPurpose: "BOT_LOOKUP",
      });
      const mapped: Record<string, string> = {};
      let mappedCount = 0;
      if (raw.outcome !== "ERROR") {
        for (const mapping of input.mappings) {
          const value = asString(readPath(raw.payload, mapping.sourcePath)) ?? mapping.defaultValue;
          if (value !== undefined && value !== "") {
            mapped[mapping.targetVariable] = value;
            mappedCount += 1;
          }
        }
      }
      const outcome: ExternalConnectorOutcome = raw.outcome === "SUCCESS" && input.mappings.length > 0 && mappedCount === 0
        ? "NOT_FOUND"
        : raw.outcome;
      mapped[input.statusVariable] = outcome;
      await this.repository.createExecution({
        tenantId: input.tenantId,
        connectorId: raw.connector.id,
        contextType: "BOT_FLOW",
        contextId: input.conversationId,
        outcome,
        method: raw.connector.method,
        requestUrl: raw.requestUrl,
        responseStatus: raw.httpStatus,
        durationMs: raw.durationMs,
        mappedCount,
        errorMessage: raw.errorMessage,
      });
      return {
        outcome,
        variables: mapped,
        httpStatus: raw.httpStatus,
        errorMessage: raw.errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        outcome: "ERROR" as const,
        variables: { [input.statusVariable]: "ERROR" },
        errorMessage,
      };
    }
  }

  private validateUrlTemplate(value: string): void {
    const schemeSeparator = value.indexOf("://");
    if (schemeSeparator < 0) throw new HttpError(400, "La URL del conector no es válida.");
    const authorityStart = schemeSeparator + 3;
    const authorityEndCandidates = [value.indexOf("/", authorityStart), value.indexOf("?", authorityStart), value.indexOf("#", authorityStart)]
      .filter((index) => index >= 0);
    const authorityEnd = authorityEndCandidates.length > 0 ? Math.min(...authorityEndCandidates) : value.length;
    const authorityTemplate = value.slice(0, authorityEnd);
    if (VARIABLE_PATTERN.test(authorityTemplate)) {
      VARIABLE_PATTERN.lastIndex = 0;
      throw new HttpError(400, "Las variables solo pueden usarse en la ruta, parámetros o body; no en el dominio ni el puerto.");
    }
    VARIABLE_PATTERN.lastIndex = 0;
    const sample = value.replace(VARIABLE_PATTERN, "sample");
    let url: URL;
    try { url = new URL(sample); }
    catch { throw new HttpError(400, "La URL del conector no es válida."); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "El conector solo admite HTTP o HTTPS.");
    if (url.username || url.password) throw new HttpError(400, "No incluyas usuario ni contraseña dentro de la URL; usa la sección de autenticación.");
    if (!this.allowLoopback && this.isUnsafeLocalHost(url.hostname)) {
      throw new HttpError(400, "En producción no se permiten conectores hacia localhost o direcciones reservadas.");
    }
  }

  private isUnsafeLocalHost(hostname: string): boolean {
    const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::1") return true;
    if (isIP(normalized) === 4) return normalized.startsWith("127.") || normalized.startsWith("169.254.");
    if (isIP(normalized) === 6) return normalized.startsWith("fe80:");
    return false;
  }

  private async executeRaw(input: {
    tenantId: string;
    connectorId: string;
    contextType: string;
    contextId?: string;
    variables: Record<string, string>;
    deferLog?: boolean;
    requiredPurpose?: "BOT_LOOKUP" | "CONTACT_SOURCE";
  }): Promise<RawExecution> {
    const connector = await this.repository.findById(input.tenantId, input.connectorId);
    if (!connector) throw new HttpError(404, "Conector externo no encontrado.");
    if (connector.status !== "ACTIVE") throw new HttpError(409, "El conector externo está deshabilitado.");
    if (input.requiredPurpose && connector.purpose !== input.requiredPurpose) {
      const expected = input.requiredPurpose === "CONTACT_SOURCE" ? "fuente de contactos" : "consulta del bot";
      throw new HttpError(400, `El conector no está configurado como ${expected}.`);
    }
    const resolvedUrl = interpolateUrl(connector.urlTemplate, input.variables);
    this.validateUrlTemplate(resolvedUrl);
    const safeUrl = sanitizeUrl(connector.urlTemplate.replace(VARIABLE_PATTERN, "***"));
    const headers = new Headers();
    for (const [key, value] of Object.entries(connector.headers)) headers.set(key, interpolate(value, input.variables));
    const secret = connector.secretPayload
      ? this.cryptoBox.decrypt(connector.secretPayload).toString("utf8")
      : undefined;
    this.applyAuthentication(headers, connector.authType, connector.authName, secret);
    let body: string | undefined;
    if (connector.method === "POST" && connector.bodyTemplate) {
      body = interpolate(connector.bodyTemplate, input.variables);
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), connector.timeoutMs);
    const startedAt = Date.now();
    let outcome: ExternalConnectorOutcome = "ERROR";
    let httpStatus: number | undefined;
    let payload: unknown;
    let errorMessage: string | undefined;
    try {
      const response = await this.fetchImpl(resolvedUrl, {
        method: connector.method,
        headers,
        body,
        signal: controller.signal,
        redirect: "error",
      });
      httpStatus = response.status;
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("La respuesta de la API supera 1 MB.");
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("La respuesta de la API supera 1 MB.");
      if (text) {
        try { payload = JSON.parse(text); }
        catch { payload = text; }
      }
      if (response.status === 404 || response.status === 204) outcome = "NOT_FOUND";
      else if (!response.ok) {
        outcome = "ERROR";
        errorMessage = `La API respondió HTTP ${response.status}.`;
      } else if (isNotFoundValue(payload)) outcome = "NOT_FOUND";
      else outcome = "SUCCESS";
    } catch (error) {
      outcome = "ERROR";
      errorMessage = error instanceof Error
        ? (error.name === "AbortError" ? `La API excedió el tiempo límite de ${connector.timeoutMs} ms.` : error.message)
        : String(error);
    } finally {
      clearTimeout(timer);
    }
    const result: RawExecution = {
      connector,
      outcome,
      payload,
      httpStatus,
      durationMs: Date.now() - startedAt,
      requestUrl: safeUrl,
      errorMessage,
    };
    if (!input.deferLog) {
      await this.repository.createExecution({
        tenantId: input.tenantId,
        connectorId: connector.id,
        contextType: input.contextType,
        contextId: input.contextId,
        outcome,
        method: connector.method,
        requestUrl: safeUrl,
        responseStatus: httpStatus,
        durationMs: result.durationMs,
        responsePreview: payload === undefined ? undefined : safePreview(payload),
        errorMessage,
      });
    }
    return result;
  }

  private applyAuthentication(
    headers: Headers,
    authType: ExternalConnectorAuthType,
    authName: string | undefined,
    secret: string | undefined,
  ): void {
    if (authType === "NONE") return;
    if (!secret) throw new HttpError(409, "El conector no tiene credencial configurada.");
    if (authType === "BEARER") headers.set("authorization", `Bearer ${secret}`);
    if (authType === "API_KEY") headers.set(authName || "x-api-key", secret);
    if (authType === "BASIC") headers.set("authorization", `Basic ${Buffer.from(`${authName ?? ""}:${secret}`, "utf8").toString("base64")}`);
  }
}
