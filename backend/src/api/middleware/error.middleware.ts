import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logger/logger.js";

export const errorMiddleware: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Datos inválidos.",
      issues: error.issues,
      requestId: request.requestId,
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      code: error.statusCode === 401 ? "UNAUTHORIZED" : error.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
      message: error.message,
      details: error.details,
      requestId: request.requestId,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({
        code: "DUPLICATE_RECORD",
        message: "Ya existe un registro con esos datos.",
        requestId: request.requestId,
      });
      return;
    }

    if (error.code === "P2025") {
      response.status(404).json({
        code: "NOT_FOUND",
        message: "El registro solicitado no existe.",
        requestId: request.requestId,
      });
      return;
    }
  }

  logger.error({ error, requestId: request.requestId, path: request.path }, "Error HTTP no controlado.");
  response.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error interno.",
    requestId: request.requestId,
  });
};
