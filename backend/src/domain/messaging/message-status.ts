export type StoredMessageDirection = "INBOUND" | "OUTBOUND";

export const messageStatuses = {
  RECEIVED: "RECEIVED",
  QUEUED: "QUEUED",
  SUBMITTED: "SUBMITTED",
  SERVER_ACK: "SERVER_ACK",
  DELIVERED: "DELIVERED",
  READ: "READ",
  PLAYED: "PLAYED",
  FAILED: "FAILED",
} as const;

export function mapBaileysStatus(status: unknown): string {
  const numeric = typeof status === "number" ? status : Number(status);
  switch (numeric) {
    case 0: return messageStatuses.FAILED;
    case 1: return messageStatuses.QUEUED;
    case 2: return messageStatuses.SERVER_ACK;
    case 3: return messageStatuses.DELIVERED;
    case 4: return messageStatuses.READ;
    case 5: return messageStatuses.PLAYED;
    default: return messageStatuses.SUBMITTED;
  }
}
