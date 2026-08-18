import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const incoming = request.get("x-request-id")?.trim();
  request.requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
};
