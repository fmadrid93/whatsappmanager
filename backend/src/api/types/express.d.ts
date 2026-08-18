import type { AuthContext } from "../../domain/auth/auth-context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

export {};
