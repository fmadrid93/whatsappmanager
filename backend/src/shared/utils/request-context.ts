import type { Request } from "express";

export interface RequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function requestMetadata(request: Request): RequestMetadata {
  return {
    requestId: request.requestId,
    ipAddress: request.ip,
    userAgent: request.get("user-agent")?.slice(0, 1000),
  };
}
