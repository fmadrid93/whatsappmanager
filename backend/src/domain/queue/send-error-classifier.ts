export type SendFailureKind = "RECIPIENT_PERMANENT" | "TRANSIENT" | "SESSION_FATAL";

export interface SendFailureClassification {
  kind: SendFailureKind;
  code: string;
  message: string;
  statusCode?: number;
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const direct = record.statusCode;
  if (typeof direct === "number") return direct;

  const output = record.output;
  if (output && typeof output === "object") {
    const value = (output as Record<string, unknown>).statusCode;
    if (typeof value === "number") return value;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const value = (data as Record<string, unknown>).statusCode;
    if (typeof value === "number") return value;
  }

  return undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const value = (error as Record<string, unknown>).message;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Error desconocido enviando el mensaje.";
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function classifySendFailure(error: unknown): SendFailureClassification {
  const message = messageOf(error);
  const text = normalized(message);
  const statusCode = readStatusCode(error);

  if (
    containsAny(text, [
      "no esta registrado en whatsapp",
      "not registered on whatsapp",
      "not on whatsapp",
      "numero e.164 normalizado",
      "contacto no tiene numero",
      "jid de destino",
      "invalid jid",
      "invalid recipient",
      "bad phone number",
    ])
  ) {
    return {
      kind: "RECIPIENT_PERMANENT",
      code: "RECIPIENT_NOT_AVAILABLE",
      message,
      statusCode,
    };
  }

  if (
    statusCode === 401
    || statusCode === 403
    || statusCode === 429
    || containsAny(text, [
      "logged out",
      "logged_out",
      "not authorized",
      "unauthorized",
      "forbidden",
      "rate limit",
      "rate-limit",
      "too many requests",
      "spam",
      "account banned",
      "account blocked",
      "cuenta bloqueada",
      "cuenta suspendida",
      "sesion cerrada",
      "session closed",
      "connection replaced",
      "multidevice mismatch",
    ])
  ) {
    return {
      kind: "SESSION_FATAL",
      code: statusCode === 429 ? "SESSION_RATE_LIMITED" : "SESSION_UNAVAILABLE",
      message,
      statusCode,
    };
  }

  return {
    kind: "TRANSIENT",
    code: error instanceof Error && error.name && error.name !== "Error" ? error.name : "SEND_TRANSIENT_ERROR",
    message,
    statusCode,
  };
}
