import type { RequestHandler } from "express";
import type { AuthService } from "../../application/services/auth.service.js";
import { HttpError } from "../../shared/errors/http-error.js";

export function authMiddleware(authService: AuthService): RequestHandler {
  return (request, _response, next) => {
    try {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new HttpError(401, "Autenticación requerida.");
      }
      request.auth = authService.verify(authorization.slice(7));
      next();
    } catch (error) {
      next(error);
    }
  };
}
