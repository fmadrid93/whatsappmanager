import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { IUserRepository, UserAuthRecord } from "../ports/repositories/user.repository.js";
import type { IRefreshSessionRepository } from "../ports/repositories/refresh-session.repository.js";
import type { AuthContext } from "../../domain/auth/auth-context.js";
import { HttpError } from "../../shared/errors/http-error.js";

export interface AuthClientMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthContext & { displayName: string };
}

export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly refreshSessions: IRefreshSessionRepository,
    private readonly jwtSecret: string,
    private readonly accessExpiresIn: string,
    private readonly refreshDays: number,
  ) {}

  async login(email: string, password: string, metadata: AuthClientMetadata): Promise<AuthResult> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, "Credenciales inválidas.");
    }
    return this.issueSession(user, metadata);
  }

  async refresh(rawToken: string | undefined, metadata: AuthClientMetadata): Promise<AuthResult> {
    if (!rawToken) throw new HttpError(401, "Sesión de actualización requerida.");
    const tokenHash = this.hashRefreshToken(rawToken);
    const current = await this.refreshSessions.findByTokenHash(tokenHash);
    if (!current) throw new HttpError(401, "Sesión inválida o vencida.");

    if (current.revokedAt) {
      await this.refreshSessions.revokeFamily(current.familyId);
      throw new HttpError(401, "Se detectó reutilización de una sesión cerrada.");
    }
    if (current.expiresAt <= new Date()) {
      await this.refreshSessions.revokeFamily(current.familyId);
      throw new HttpError(401, "La sesión ha vencido.");
    }

    const user = await this.users.findById(current.userId);
    if (!user || user.tenantId !== current.tenantId) {
      await this.refreshSessions.revokeFamily(current.familyId);
      throw new HttpError(401, "Usuario deshabilitado.");
    }

    const nextToken = this.createRefreshToken();
    await this.refreshSessions.rotate(current.id, {
      tenantId: user.tenantId,
      userId: user.id,
      familyId: current.familyId,
      tokenHash: this.hashRefreshToken(nextToken),
      expiresAt: this.refreshExpiry(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.buildResult(user, nextToken);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.refreshSessions.revokeByTokenHash(this.hashRefreshToken(rawToken));
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshSessions.revokeAllForUser(userId);
  }

  verify(token: string): AuthContext {
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        issuer: "whatsapp-saas",
        audience: "whatsapp-saas-web",
      }) as AuthContext & { type?: string };
      if (payload.type !== "access") throw new Error("Tipo de token inválido");
      return payload;
    } catch {
      throw new HttpError(401, "Token inválido o vencido.");
    }
  }

  private async issueSession(user: UserAuthRecord, metadata: AuthClientMetadata): Promise<AuthResult> {
    const refreshToken = this.createRefreshToken();
    await this.refreshSessions.create({
      tenantId: user.tenantId,
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: this.refreshExpiry(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    return this.buildResult(user, refreshToken);
  }

  private buildResult(user: UserAuthRecord, refreshToken: string): AuthResult {
    const context: AuthContext = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    const accessToken = jwt.sign({ ...context, type: "access" }, this.jwtSecret, {
      expiresIn: this.accessExpiresIn as jwt.SignOptions["expiresIn"],
      issuer: "whatsapp-saas",
      audience: "whatsapp-saas-web",
    });
    return { accessToken, refreshToken, user: { ...context, displayName: user.displayName } };
  }

  private createRefreshToken(): string {
    return randomBytes(64).toString("base64url");
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshDays * 24 * 60 * 60 * 1000);
  }
}
