import type { RequestHandler } from "express";
import type { Permission } from "../../domain/auth/permissions.js";
import { roleHasPermission } from "../../domain/auth/permissions.js";
import { HttpError } from "../../shared/errors/http-error.js";

export function requirePermission(permission: Permission): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(new HttpError(401, "Autenticación requerida."));
    if (!roleHasPermission(request.auth.role, permission)) {
      return next(new HttpError(403, "No tienes permisos para realizar esta acción."));
    }
    next();
  };
}
