import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { AuthService } from "../../src/application/services/auth.service.js";
import type { UserAuthRecord } from "../../src/application/ports/repositories/user.repository.js";
import type { CreateRefreshSessionInput, RefreshSessionRecord } from "../../src/application/ports/repositories/refresh-session.repository.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

class RefreshRepositoryFake {
  records = new Map<string, RefreshSessionRecord>();
  revokedFamilies: string[] = [];
  revokedUsers: string[] = [];
  sequence = 0;

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    const record = { id: `refresh-${++this.sequence}`, ...input, revokedAt: null, replacedById: null };
    this.records.set(input.tokenHash, record);
    return record;
  }
  async findByTokenHash(tokenHash: string) { return this.records.get(tokenHash) ?? null; }
  async rotate(currentId: string, replacement: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    const current = [...this.records.values()].find((item) => item.id === currentId);
    if (!current) throw new Error("missing current refresh session");
    const next = await this.create(replacement);
    current.revokedAt = new Date();
    current.replacedById = next.id;
    return next;
  }
  async revokeByTokenHash(tokenHash: string) { const record = this.records.get(tokenHash); if (record) record.revokedAt = new Date(); }
  async revokeFamily(familyId: string) { this.revokedFamilies.push(familyId); for (const record of this.records.values()) if (record.familyId === familyId) record.revokedAt = new Date(); }
  async revokeAllForUser(userId: string) { this.revokedUsers.push(userId); }
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

async function createFixture() {
  const user: UserAuthRecord = {
    id: "user-1",
    tenantId: "tenant-1",
    email: "admin@example.com",
    displayName: "Administrador",
    passwordHash: await bcrypt.hash("Segura123!", 4),
    role: "TENANT_ADMIN",
    status: "ACTIVE",
  };
  const users = {
    findByEmail: async (email: string) => email === user.email ? user : null,
    findById: async (id: string) => id === user.id ? user : null,
  };
  const refresh = new RefreshRepositoryFake();
  const service = new AuthService(users, refresh, "jwt-secret-with-more-than-thirty-two-characters", "15m", 30);
  return { user, refresh, service };
}

test("login normaliza email, crea refresh token y emite access token verificable", async () => {
  const { service, refresh } = await createFixture();
  const result = await service.login(" ADMIN@EXAMPLE.COM ", "Segura123!", { ipAddress: "127.0.0.1" });

  assert.equal(result.user.email, "admin@example.com");
  assert.equal(refresh.records.size, 1);
  assert.ok(refresh.records.has(sha256(result.refreshToken)));
  assert.equal(service.verify(result.accessToken).tenantId, "tenant-1");
});

test("refresh rota el token y detecta reutilización del token anterior", async () => {
  const { service, refresh } = await createFixture();
  const login = await service.login("admin@example.com", "Segura123!", {});
  const rotated = await service.refresh(login.refreshToken, {});

  assert.notEqual(rotated.refreshToken, login.refreshToken);
  assert.ok(refresh.records.has(sha256(rotated.refreshToken)));

  await assert.rejects(
    () => service.refresh(login.refreshToken, {}),
    (error: unknown) => error instanceof HttpError && error.statusCode === 401,
  );
  assert.equal(refresh.revokedFamilies.length, 1);
});

test("login rechaza contraseña incorrecta sin crear sesión", async () => {
  const { service, refresh } = await createFixture();
  await assert.rejects(
    () => service.login("admin@example.com", "incorrecta", {}),
    (error: unknown) => error instanceof HttpError && error.statusCode === 401,
  );
  assert.equal(refresh.records.size, 0);
});
