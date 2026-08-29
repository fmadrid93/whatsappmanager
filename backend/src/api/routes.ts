import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import QRCode from "qrcode";
import { z } from "zod";
import type { AppContainer } from "../container.js";
import { permissions } from "../domain/auth/permissions.js";
import { buildCampaignCapacityHealth } from "../domain/scaling/capacity-health.js";
import { asyncHandler } from "../shared/http/async-handler.js";
import { readCookie } from "../shared/utils/cookies.js";
import { requestMetadata } from "../shared/utils/request-context.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { requirePermission } from "./middleware/permission.middleware.js";
import { createRateLimiter } from "./middleware/rate-limit.middleware.js";
import { HttpError } from "../shared/errors/http-error.js";
import { supportedWebhookEvents } from "../application/services/integration-management.service.js";
import { sleep } from "../shared/utils/delay.js";

export const campaignContactSchema = z.object({
  name: z.string().max(150).optional(),
  phone: z.string().max(100),
  variables: z.record(z.string(), z.string().max(2000)).optional(),
});

const campaignCreateSchema = z.object({
  name: z.string().min(2).max(150),
  sessionIds: z.array(z.string().uuid()).min(1),
  contacts: z.array(campaignContactSchema).min(1).max(50000),
  message: z.object({ text: z.string().max(4096), caption: z.string().max(1024).optional() }),
  mediaAssetId: z.string().uuid().optional(),
  defaultRegion: z.string().length(2).optional(),
});

export const jerarquiaSeleccionSchema = z.object({
  territorioIds: z.array(z.coerce.number().int()).default([]),
  administradorIds: z.array(z.coerce.number().int()).default([]),
  gerenteIds: z.array(z.coerce.number().int()).default([]),
  movilizadorIds: z.array(z.coerce.number().int()).default([]),
});

const recurringCampaignCreateBase = {
  name: z.string().min(2).max(150),
  sessionIds: z.array(z.string().uuid()).min(1),
  message: z.object({ text: z.string().max(4096), caption: z.string().max(1024).optional() }),
  mediaAssetId: z.string().uuid().optional(),
  defaultRegion: z.string().length(2).optional(),
  intervalMinutes: z.coerce.number().int().min(5).max(10080),
};

const recurringCampaignCreateSchema = z.discriminatedUnion("sourceType", [
  z.object({
    ...recurringCampaignCreateBase,
    sourceType: z.literal("CONNECTOR"),
    connectorId: z.string().uuid(),
    connectorVariables: z.record(z.string(), z.string().max(2000)).default({}),
  }),
  z.object({
    ...recurringCampaignCreateBase,
    sourceType: z.literal("JERARQUIA"),
    jerarquiaSelection: jerarquiaSeleccionSchema,
  }),
]);

const botFlowStepSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().default(() => crypto.randomUUID()), type: z.literal("MESSAGE"), text: z.string().min(1).max(4096) }),
  z.object({ id: z.string().default(() => crypto.randomUUID()), type: z.literal("QUESTION"), text: z.string().min(1).max(4096), variable: z.string().min(1).max(50) }),
  z.object({
    id: z.string().default(() => crypto.randomUUID()),
    type: z.literal("MENU"),
    text: z.string().min(1).max(4096),
    variable: z.string().min(1).max(50),
    invalidText: z.string().max(4096).optional(),
    options: z.array(z.object({
      value: z.string().min(1).max(100),
      label: z.string().min(1).max(200),
      nextStepId: z.string().min(1).max(100),
    })).min(2).max(10),
  }),
  z.object({
    id: z.string().default(() => crypto.randomUUID()),
    type: z.literal("CONDITION"),
    variable: z.string().min(1).max(50),
    operator: z.enum(["EQUALS", "CONTAINS", "EXISTS"]),
    value: z.string().max(1000).optional(),
    ifTrueText: z.string().min(1).max(4096),
    ifFalseText: z.string().max(4096).optional(),
  }),
  z.object({
    id: z.string().default(() => crypto.randomUUID()),
    type: z.literal("API_REQUEST"),
    connectorId: z.string().uuid(),
    statusVariable: z.string().trim().min(1).max(50).default("api_status"),
    mappings: z.array(z.object({
      sourcePath: z.string().trim().min(1).max(500),
      targetVariable: z.string().trim().min(1).max(50),
      defaultValue: z.string().max(2000).optional(),
    })).max(30).default([]),
    successText: z.string().max(4096).optional(),
    notFoundText: z.string().max(4096).optional(),
    errorText: z.string().max(4096).optional(),
  }),
  z.object({ id: z.string().default(() => crypto.randomUUID()), type: z.literal("END"), text: z.string().max(4096).optional() }),
]);

const externalConnectorCreateSchema = z.object({
  name: z.string().trim().min(2).max(191),
  purpose: z.enum(["BOT_LOOKUP", "CONTACT_SOURCE", "GENERAL"]),
  method: z.enum(["GET", "POST"]),
  urlTemplate: z.string().trim().min(8).max(1000),
  headers: z.record(z.string().max(191), z.string().max(2000)).default({}),
  bodyTemplate: z.string().max(10000).optional(),
  authType: z.enum(["NONE", "BEARER", "API_KEY", "BASIC"]).default("NONE"),
  authName: z.string().trim().max(191).optional(),
  secret: z.string().max(4000).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(30000).default(10000),
  itemsPath: z.string().trim().max(500).optional(),
  phonePath: z.string().trim().max(500).optional(),
  namePath: z.string().trim().max(500).optional(),
  contactMappings: z.array(z.object({
    sourcePath: z.string().trim().min(1).max(500),
    targetVariable: z.string().trim().min(1).max(50),
  })).max(30).default([]),
});

const externalConnectorVariablesSchema = z.object({
  variables: z.record(z.string().max(100), z.string().max(4000)).default({}),
});

function safeKeyEquals(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualHash = crypto.createHash("sha256").update(actual).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

function requireRouteParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `Parámetro de ruta inválido: ${name}.`);
  }
  return value;
}
export function createRoutes(container: AppContainer): Router {
  const router = Router();
  const auth = authMiddleware(container.services.authService);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  const loginLimiter = createRateLimiter({
    windowMs: container.env.LOGIN_RATE_LIMIT_WINDOW_MS,
    max: container.env.LOGIN_RATE_LIMIT_MAX,
    store: container.repositories.rateLimitStore,
    key: (request) => `${request.ip ?? "unknown"}:${String(request.body?.email ?? "").toLowerCase()}`,
    message: "Demasiados intentos de acceso. Intenta nuevamente más tarde.",
  });
  const cookieOptions = {
    httpOnly: true,
    secure: container.env.COOKIE_SECURE,
    sameSite: "strict" as const,
    path: "/api/auth",
    maxAge: container.env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  };

  const setRefreshCookie = (response: Response, value: string) => {
    response.cookie(container.env.REFRESH_COOKIE_NAME, value, cookieOptions);
  };

  const clearRefreshCookie = (response: Response) => {
    response.clearCookie(container.env.REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: container.env.COOKIE_SECURE,
      sameSite: "strict",
      path: "/api/auth",
    });
  };

  const audit = async (
    request: Request,
    action: string,
    entityType: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (!request.auth) return;
    await container.services.auditService.record({
      tenantId: request.auth.tenantId,
      actorUserId: request.auth.userId,
      action,
      entityType,
      entityId,
      metadata,
      ...requestMetadata(request),
    });
  };

  const campaignRecoverySnapshot = async (tenantId: string, campaignId: string) => {
    const campaign = await container.repositories.campaigns.findByIdForTenant(campaignId, tenantId);
    if (!campaign) throw new HttpError(404, "Campaña no encontrada.");

    const [stats, configuredSessionIds, sessions] = await Promise.all([
      container.repositories.messageQueue.getCampaignRecoveryStats({ tenantId, campaignId }),
      container.repositories.campaigns.getSessionIds(campaignId),
      container.repositories.sessions.listByTenant(tenantId),
    ]);
    const configuredSet = new Set(configuredSessionIds);
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const mapSession = (session: (typeof sessions)[number], alreadyConfigured: boolean) => ({
      id: session.id,
      name: session.name,
      phoneE164: session.phoneE164,
      status: session.status,
      alreadyConfigured,
      leaseOwner: session.leaseOwner,
      leaseExpiresAt: session.leaseExpiresAt,
      lastConnectionCode: session.lastConnectionCode,
      lastConnectionError: session.lastConnectionError,
    });

    return {
      campaignId,
      campaignStatus: campaign.status,
      ...stats,
      configuredSessions: configuredSessionIds.flatMap((sessionId) => {
        const session = sessionById.get(sessionId);
        return session ? [mapSession(session, true)] : [];
      }),
      candidateSessions: sessions
        .filter((session) => session.status === "CONNECTED")
        .map((session) => mapSession(session, configuredSet.has(session.id))),
      policy: {
        restrictionHeldCode: "HELD_SESSION_QUARANTINED",
        restrictionHeldTransferAllowed: false,
        note: "Los mensajes retenidos por cuarentena no se transfieren a otra sesión. La recuperación manual solo mueve pendientes varados por fallas técnicas.",
      },
    };
  };

  const resolveIntegrationPrincipal = async (request: Request) => {
    const supplied = request.header("x-integration-key") ?? request.headers.authorization?.replace(/^Bearer\s+/i, "");
    const managed = await container.services.integrationManagementService.authenticate(supplied);
    if (managed) {
      const owner = await container.repositories.users.findById(managed.createdByUserId);
      if (!owner) throw new HttpError(503, "El propietario de la API key ya no existe.");
      return {
        tenantId: managed.tenantId,
        ownerUserId: owner.id,
        apiKeyId: managed.id,
        permissions: managed.permissions,
        managed: true,
      };
    }
    if (container.env.INTEGRATION_API_KEY && safeKeyEquals(supplied, container.env.INTEGRATION_API_KEY)) {
      const owner = await container.repositories.users.findByEmail(container.env.INTEGRATION_ADMIN_EMAIL);
      if (!owner) throw new HttpError(503, "No existe el usuario administrador configurado para la integración.");
      return {
        tenantId: owner.tenantId,
        ownerUserId: owner.id,
        apiKeyId: undefined,
        permissions: ["CAMPAIGN_CREATE", "CAMPAIGN_STATUS"] as const,
        managed: false,
      };
    }
    throw new HttpError(401, "API key de integración inválida.");
  };

  router.post(
    "/auth/login",
    loginLimiter,
    asyncHandler(async (request, response) => {
      const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body);
      const result = await container.services.authService.login(body.email, body.password, requestMetadata(request));
      setRefreshCookie(response, result.refreshToken);
      response.json({ accessToken: result.accessToken, user: result.user });
    }),
  );

  router.post(
    "/auth/refresh",
    asyncHandler(async (request, response) => {
      const token = readCookie(request.headers.cookie, container.env.REFRESH_COOKIE_NAME);
      const result = await container.services.authService.refresh(token, requestMetadata(request));
      setRefreshCookie(response, result.refreshToken);
      response.json({ accessToken: result.accessToken, user: result.user });
    }),
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (request, response) => {
      const token = readCookie(request.headers.cookie, container.env.REFRESH_COOKIE_NAME);
      await container.services.authService.logout(token);
      clearRefreshCookie(response);
      response.status(204).send();
    }),
  );

  router.post(
    "/auth/logout-all",
    auth,
    asyncHandler(async (request, response) => {
      await container.services.authService.logoutAll(request.auth!.userId);
      await audit(request, "AUTH_LOGOUT_ALL", "AppUser", request.auth!.userId);
      clearRefreshCookie(response);
      response.status(204).send();
    }),
  );

  router.get("/auth/me", auth, (request, response) => response.json(request.auth));

  router.get(
    "/system/public-ip",
    asyncHandler(async (request, response) => {
      try {
        const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = (await res.json()) as { ip?: string };
          return response.json({ ip: data.ip || request.ip || "127.0.0.1", source: "external" });
        }
      } catch {
        // Fallback al IP remoto de la petición
      }
      response.json({ ip: request.ip || "127.0.0.1", source: "local" });
    }),
  );

  // Helper para resolver sesiones por UUID o por Alias/Nombre (ej. asuncion_admin_fmadrid_linea1, u3073_principal)
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const resolveSession = async (identifier: string) => {
    try {
      if (isUuid(identifier)) {
        return await container.prisma.whatsAppSession.findUnique({ where: { id: identifier } });
      }
      // 1. Coincidencia exacta por nombre
      let found = await container.prisma.whatsAppSession.findFirst({
        where: { name: identifier },
        orderBy: { createdAt: "desc" },
      });
      if (found) return found;

      // 2. Extraer identificador base si viene en formato u3073 o u3073_principal
      const clean = identifier.replace(/^u/, "").replace(/_principal$/, "").replace(/_linea\d+$/, "");
      if (clean) {
        found = await container.prisma.whatsAppSession.findFirst({
          where: {
            OR: [
              { name: { contains: `_${clean}_` } },
              { name: { contains: `_${clean}` } },
              { name: { contains: clean } },
              { name: { startsWith: `u${clean}_` } },
            ],
          },
          orderBy: { createdAt: "desc" },
        });
        if (found) return found;
      }

      return null;
    } catch {
      return null;
    }
  };

  // Endpoints para Flutter Web, Nodos Municipales y Panel Admin SaaS Angular
  router.get(
    "/sessions",
    asyncHandler(async (request, response) => {
      try {
        const userIdParam = request.query.userId ? String(request.query.userId).trim() : null;
        const userNameParam = (request.query.username || request.query.user) ? String(request.query.username || request.query.user).trim() : null;
        const sessionNameParam = request.query.session ? String(request.query.session).trim() : null;
        const roleParam = request.query.role ? String(request.query.role).trim().toLowerCase() : null;
        const hasQuery = Boolean(userIdParam || userNameParam || sessionNameParam);

        let whereClause: any = {
          status: { notIn: ["DELETED", "LOGGED_OUT"] },
        };

        const isElevatedRole = Boolean(roleParam && (roleParam.includes("admin") || roleParam.includes("gerent")));

        if (!isElevatedRole) {
          if (sessionNameParam) {
            whereClause.OR = [
              { name: sessionNameParam },
              { name: { contains: sessionNameParam } },
            ];
          } else if (userIdParam || userNameParam) {
            const orConditions: any[] = [];
            if (userIdParam) {
              const prefix = userIdParam.startsWith("u") ? `${userIdParam}_` : `u${userIdParam}_`;
              orConditions.push(
                { name: { startsWith: prefix } },
                { name: { contains: `_${prefix}` } },
                { name: { contains: `_${userIdParam}_` } },
                { name: { contains: `_u${userIdParam}_` } },
                { name: { contains: userIdParam } },
              );
            }
            if (userNameParam) {
              orConditions.push(
                { name: { contains: userNameParam } },
                { name: { contains: `_${userNameParam}_` } },
              );
            }
            whereClause.OR = orConditions;
          }

          // Aislamiento estricto de roles: un movilizador o usuario regular nunca puede ver sesiones de admin
          if (roleParam && (roleParam.includes("movil") || roleParam === "usr" || roleParam === "usuario")) {
            whereClause.NOT = [
              { name: { contains: "_admin_" } },
              { name: { startsWith: "admin_" } },
            ];
          }
        }

        const all = await container.prisma.whatsAppSession.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
        });

        // Si la petición viene con parámetros de consulta (ej. desde Flutter), retornamos el formato compatible
        if (hasQuery) {
          const names = all.map((s) => s.name);
          return response.json({ sessions: names, items: all });
        }

        // Si la petición viene del Panel Web Admin Angular (localhost:4200/sessions), retornamos el Array directo
        response.json(all);
      } catch (err: any) {
        response.status(500).json({ error: err?.message || "Error al listar sesiones" });
      }
    }),
  );

  router.post(
    "/sessions",
    asyncHandler(async (request, response) => {
      const body = request.body || {};
      let tenant = await container.prisma.tenant.findFirst();
      if (!tenant) {
        tenant = await container.prisma.tenant.create({
          data: { name: "Tenant Campaña", status: "ACTIVE" },
        });
      }
      let user = await container.prisma.appUser.findFirst();
      if (!user) {
        user = await container.prisma.appUser.create({
          data: {
            tenantId: tenant.id,
            email: "admin@campana.local",
            displayName: "Admin Campaña",
            passwordHash: "system",
            role: "TENANT_ADMIN",
          },
        });
      }

      const name = String(body.name || `sesion_${Date.now()}`);
      const pairingMethod = body.pairingMethod === "CODE" ? "CODE" : "QR";
      const expectedPhoneE164 = body.expectedPhoneE164 ? String(body.expectedPhoneE164) : null;

      const created = await container.prisma.whatsAppSession.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: user.id,
          name,
          pairingMethod,
          expectedPhoneE164,
          status: "STARTING",
          shardKey: 1,
          isBotActive: Boolean(body.isBotActive ?? false),
        },
      });

      response.status(201).json(created);
    }),
  );

  const handlePairingCode = asyncHandler(async (request, response) => {
    const identifier = String(request.params.id);
    let session = await resolveSession(identifier);
    const body = request.body || {};
    let phone = String(body.phone || body.phoneE164 || session?.expectedPhoneE164 || "").trim();

    if (!phone || phone.replace(/\D/g, "").length < 8) {
      return response.status(400).json({ error: "Debes proporcionar un número de teléfono válido con código de país (ej. +595972686891)" });
    }
    if (!phone.startsWith("+")) {
      phone = `+${phone}`;
    }

    if (!session) {
      let tenant = await container.prisma.tenant.findFirst();
      if (!tenant) {
        tenant = await container.prisma.tenant.create({ data: { name: "Tenant Campaña", status: "ACTIVE" } });
      }
      let user = await container.prisma.appUser.findFirst();
      if (!user) {
        user = await container.prisma.appUser.create({
          data: {
            tenantId: tenant.id,
            email: "admin@campana.local",
            displayName: "Admin Campaña",
            passwordHash: "system",
            role: "TENANT_ADMIN",
          },
        });
      }
      session = await container.prisma.whatsAppSession.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: user.id,
          name: identifier,
          pairingMethod: "CODE",
          expectedPhoneE164: phone,
          status: "STARTING",
          shardKey: 1,
          isBotActive: false,
        },
      });
    } else {
      await container.prisma.whatsAppSession.update({
        where: { id: session.id },
        data: {
          pairingMethod: "CODE",
          status: "STARTING",
          lastConnectionError: null,
          expectedPhoneE164: phone,
          pairingCode: null,
          qrCode: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    }

    // Esperar a que el Worker genere el código de emparejamiento
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const fresh = await container.prisma.whatsAppSession.findUnique({ where: { id: session.id } });
      if (fresh?.pairingCode) {
        return response.json({ ok: true, code: fresh.pairingCode, sessionId: session.id, name: session.name });
      }
    }

    const freshFinal = await container.prisma.whatsAppSession.findUnique({ where: { id: session.id } });
    if (freshFinal?.pairingCode) {
      return response.json({ ok: true, code: freshFinal.pairingCode, sessionId: session.id, name: session.name });
    }
    response.status(500).json({ error: "El worker está procesando la solicitud, intenta nuevamente en unos segundos." });
  });

  router.post("/session/:id/pairing-code", handlePairingCode);
  router.post("/sessions/:id/pairing-code", handlePairingCode);

  router.get(
    "/sessions/:id/qr",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (!session) {
        return response.status(404).json({ error: "Sesión no encontrada" });
      }

      if (["DELETED", "LOGGED_OUT", "QUARANTINED", "PAIRING_FAILED", "DISCONNECTED"].includes(session.status)) {
        await container.prisma.baileysAuthKey.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.baileysCredential.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            status: "STARTING",
            pairingMethod: "QR",
            qrCode: null,
            pairingCode: null,
            phoneE164: null,
            whatsappJid: null,
            lastConnectionError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      }


      const freshSession = await container.prisma.whatsAppSession.findUnique({ where: { id: session.id } });
      const isConnected = (freshSession?.status === "CONNECTED" || freshSession?.status === "WORKING") && Boolean(freshSession?.whatsappJid);
      const qrDataUrl = freshSession?.qrCode ? await QRCode.toDataURL(freshSession.qrCode, { width: 360, margin: 2 }) : null;

      response.json({
        available: Boolean(freshSession?.qrCode) && !isConnected,
        connected: isConnected,
        qr: qrDataUrl ?? "",
        qrCode: isConnected ? null : (freshSession?.qrCode ?? null),
        status: freshSession?.status ?? "STARTING",
      });
    }),
  );

  router.delete(
    "/sessions/:id",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (session) {
        try {
          await container.whatsapp.sessionGateway.stop(session.id);
        } catch {}
        try {
          await container.prisma.whatsAppSession.delete({ where: { id: session.id } });
        } catch {
          await container.prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { status: "DELETED", qrCode: null, phoneE164: null, whatsappJid: null },
          });
        }
      }
      response.status(204).send();
    }),
  );

  router.patch(
    "/sessions/:id/bot",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (session) {
        const active = Boolean(request.body?.active);
        await container.prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { isBotActive: active },
        });
      }
      response.json({ ok: true });
    }),
  );

  router.post(
    ["/session/:id/reset", "/sessions/:id/reset", "/sessions/:id/relink"],
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (session) {
        try {
          await container.whatsapp.sessionGateway.stop(session.id);
        } catch {}
        await container.prisma.baileysAuthKey.deleteMany({ where: { sessionId: session.id } });

        await container.prisma.baileysCredential.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            status: "STARTING",
            qrCode: null,
            qrUpdatedAt: null,
            pairingCode: null,
            pairingCodeUpdatedAt: null,
            phoneE164: null,
            whatsappJid: null,
            lastConnectionError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            connectedAt: null,
            disconnectedAt: new Date(),
          },
        });
      }
      response.json({ ok: true, reset: true });
    }),
  );


  router.post(
    "/sessions/purge-old",
    asyncHandler(async (_request, response) => {
      try {
        const deleted = await container.prisma.whatsAppSession.deleteMany({
          where: {
            OR: [
              { status: { in: ["DELETED", "LOGGED_OUT", "QUARANTINED"] } },
              { name: { not: { startsWith: "u" } } },
            ],
          },
        });
        response.json({ ok: true, deletedCount: deleted.count });
      } catch (err: any) {
        response.status(500).json({ error: err?.message });
      }
    }),
  );

  router.get(
    "/session/:id/status",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      const isConnected =
        (session?.status === "CONNECTED" || session?.status === "WORKING") &&
        Boolean(session?.whatsappJid);

      response.json({
        connected: isConnected,
        state: isConnected ? "connected" : (session?.status?.toLowerCase() ?? "stopped"),
        me: isConnected ? (session?.phoneE164 ?? session?.whatsappJid?.split("@")[0] ?? null) : null,
      });
    }),
  );

  router.post(
    "/session/:id/start",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      let session = await resolveSession(identifier);
      if (!session) {
        let tenant = await container.prisma.tenant.findFirst();
        if (!tenant) {
          tenant = await container.prisma.tenant.create({
            data: { name: "Tenant Campaña", status: "ACTIVE" },
          });
        }
        let user = await container.prisma.appUser.findFirst();
        if (!user) {
          user = await container.prisma.appUser.create({
            data: {
              tenantId: tenant.id,
              email: "admin@campana.local",
              displayName: "Admin Campaña",
              passwordHash: "system",
              role: "TENANT_ADMIN",
            },
          });
        }
        session = await container.prisma.whatsAppSession.create({
          data: {
            tenantId: tenant.id,
            ownerUserId: user.id,
            name: identifier,
            pairingMethod: "QR",
            status: "STARTING",
            shardKey: 1,
            isBotActive: false,
          },
        });
      } else if (["DELETED", "LOGGED_OUT", "DISCONNECTED", "QUARANTINED", "PAIRING_FAILED"].includes(session.status)) {
        await container.prisma.baileysAuthKey.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.baileysCredential.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            status: "STARTING",
            qrCode: null,
            pairingCode: null,
            phoneE164: null,
            whatsappJid: null,
            lastConnectionError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      }
      response.json({ ok: true, sessionId: session.id, name: session.name });
    }),
  );

  router.get(
    "/session/:id/qr",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      let session = await resolveSession(identifier);

      if (!session) {
        let tenant = await container.prisma.tenant.findFirst();
        if (!tenant) {
          tenant = await container.prisma.tenant.create({
            data: { name: "Tenant Campaña", status: "ACTIVE" },
          });
        }
        let user = await container.prisma.appUser.findFirst();
        if (!user) {
          user = await container.prisma.appUser.create({
            data: {
              tenantId: tenant.id,
              email: "admin@campana.local",
              displayName: "Admin Campaña",
              passwordHash: "system",
              role: "TENANT_ADMIN",
            },
          });
        }
        session = await container.prisma.whatsAppSession.create({
          data: {
            tenantId: tenant.id,
            ownerUserId: user.id,
            name: identifier,
            pairingMethod: "QR",
            status: "STARTING",
            shardKey: 1,
            isBotActive: false,
          },
        });
      } else if (["DELETED", "LOGGED_OUT", "DISCONNECTED", "QUARANTINED", "PAIRING_FAILED"].includes(session.status)) {
        await container.prisma.baileysAuthKey.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.baileysCredential.deleteMany({ where: { sessionId: session.id } });
        await container.prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            status: "STARTING",
            pairingMethod: "QR",
            qrCode: null,
            pairingCode: null,
            phoneE164: null,
            whatsappJid: null,
            lastConnectionError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      }


      // Re-consultar el registro para obtener el qrCode actualizado
      const freshSession = await container.prisma.whatsAppSession.findUnique({ where: { id: session.id } });
      const isConnected = (freshSession?.status === "CONNECTED" || freshSession?.status === "WORKING") && Boolean(freshSession?.whatsappJid);
      const qrDataUrl = freshSession?.qrCode ? await QRCode.toDataURL(freshSession.qrCode, { width: 360, margin: 2 }) : null;
      const qrPngBase64 = qrDataUrl ? qrDataUrl.replace(/^data:image\/png;base64,/, "") : null;

      response.json({
        available: Boolean(freshSession?.qrCode) && !isConnected,
        connected: isConnected,
        qrPngBase64: isConnected ? null : qrPngBase64,
        qrCode: isConnected ? null : (freshSession?.qrCode ?? null),
        status: freshSession?.status ?? "STARTING",
      });
    }),
  );

  router.post(
    "/session/:id/reset",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (session) {
        try {
          await container.whatsapp.sessionGateway.stop(session.id);
        } catch {}
        try {
          await container.prisma.whatsAppSession.delete({ where: { id: session.id } });
        } catch {
          await container.prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { status: "DELETED", qrCode: null, phoneE164: null },
          });
        }
      }
      response.json({ ok: true });
    }),
  );

  router.post(
    "/session/:id/send",
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      const sessionId = session ? session.id : identifier;
      const body = request.body || {};
      const to = (body.to || "").toString().replace(/\D/g, "");
      const message = (body.message || "").toString();

      if (!to || !message) {
        return response.status(400).json({ error: "Faltan los campos 'to' o 'message'" });
      }

      try {
        if (container.whatsapp.sockets.has(sessionId)) {
          const socket = container.whatsapp.sockets.get(sessionId);
          const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
          await socket.sendPresenceUpdate("composing", jid).catch(() => {});
          await socket.sendMessage(jid, { text: message });
          return response.json({ ok: true, sent: true });
        }


        const fresh = session || (await container.prisma.whatsAppSession.findUnique({ where: { id: sessionId } }));
        if (!fresh) {
          return response.status(404).json({ error: "Sesión no encontrada" });
        }

        let campaign = await container.prisma.campaign.findFirst({
          where: { tenantId: fresh.tenantId, name: "Mensajes Directos API" },
        });
        if (!campaign) {
          campaign = await container.prisma.campaign.create({
            data: {
              tenantId: fresh.tenantId,
              name: "Mensajes Directos API",
              status: "RUNNING",
              messagePayload: Buffer.from("{}"),
            },
          });
        } else if (campaign.status !== "RUNNING") {
          await container.prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: "RUNNING" },
          });
        }


        await container.prisma.messageQueue.create({
          data: {
            tenantId: fresh.tenantId,
            campaignId: campaign.id,
            assignedSessionId: fresh.id,
            contactName: to,
            recipientRaw: to,
            recipientE164: to.startsWith("+") ? to : `+${to}`,
            recipientJid: to.includes("@") ? to : `${to}@s.whatsapp.net`,
            messageType: "conversation",
            payload: Buffer.from(JSON.stringify({ text: message })),
            status: "PENDING",
            priority: 1,
            attemptCount: 0,
            availableAt: new Date(),
            idempotencyKey: crypto.randomUUID(),
          },
        });
        response.json({ ok: true, sent: true, queued: true });
      } catch (err: any) {
        response.status(500).json({ error: err?.message || "Error al enviar mensaje" });
      }
    }),
  );

  router.get(
    ["/session/:id/messages", "/sessions/:id/messages"],
    asyncHandler(async (request, response) => {
      const identifier = String(request.params.id);
      const session = await resolveSession(identifier);
      if (!session) {
        return response.json({ ok: true, total: 0, messages: [] });
      }

      const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);

      const items = await container.prisma.messageQueue.findMany({
        where: {
          assignedSessionId: session.id,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          contactName: true,
          recipientE164: true,
          recipientJid: true,
          status: true,
          attemptCount: true,
          sentMessageId: true,
          sentAt: true,
          createdAt: true,
          lastErrorMessage: true,
          payload: true,
        },
      });


      const mapped = items.map((item) => {
        let text = "";
        try {
          if (item.payload) {
            const parsed = JSON.parse(Buffer.from(item.payload).toString("utf8"));
            text = parsed.text || parsed.caption || "";
          }
        } catch {}
        return {
          id: item.id,
          contactName: item.contactName,
          recipient: item.recipientE164 || item.recipientJid || "",
          status: item.status,
          sentMessageId: item.sentMessageId,
          sentAt: item.sentAt,
          createdAt: item.createdAt,
          error: item.lastErrorMessage,
          text,
        };
      });

      response.json({ ok: true, total: mapped.length, messages: mapped });
    }),
  );


  router.post(
    "/integrations/campaigns",
    asyncHandler(async (request, response) => {
      const startedAt = Date.now();
      let principal: Awaited<ReturnType<typeof resolveIntegrationPrincipal>> | undefined;
      let statusCode = 500;
      let errorMessage: string | undefined;
      let idempotencyKey: string | undefined;
      try {
        principal = await resolveIntegrationPrincipal(request);
        container.services.integrationManagementService.requirePermission(principal, "CAMPAIGN_CREATE");
        const parsed = campaignCreateSchema.extend({ idempotencyKey: z.string().min(8).max(191) }).parse(request.body);
        idempotencyKey = parsed.idempotencyKey;
        const existing = await container.repositories.auditLogs.findEntityByRequestId(principal.tenantId, "CampaignIntegration", parsed.idempotencyKey);
        if (existing) {
          statusCode = 200;
          return response.status(200).json({ duplicated: true, campaignId: existing.entityId });
        }

        const created = await container.services.campaignService.create({
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          name: parsed.name,
          sessionIds: parsed.sessionIds,
          contacts: parsed.contacts,
          message: parsed.message,
          mediaAssetId: parsed.mediaAssetId,
          defaultRegion: parsed.defaultRegion ?? container.env.DEFAULT_COUNTRY_REGION,
        });
        await container.services.auditService.record({
          tenantId: principal.tenantId,
          actorUserId: principal.ownerUserId,
          action: "INTEGRATION_CAMPAIGN_CREATED",
          entityType: "CampaignIntegration",
          entityId: created.id,
          requestId: parsed.idempotencyKey,
          metadata: { contacts: parsed.contacts.length, apiKeyId: principal.apiKeyId },
        });
        await container.services.integrationManagementService.emit({
          tenantId: principal.tenantId,
          eventType: "INTEGRATION_CAMPAIGN_CREATED",
          aggregateType: "Campaign",
          aggregateId: created.id,
          payload: { campaignId: created.id, name: created.name, contacts: parsed.contacts.length },
        });
        statusCode = 201;
        response.status(201).json({ duplicated: false, campaign: created });
      } catch (error) {
        statusCode = error instanceof HttpError ? error.statusCode : 500;
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (principal) {
          await container.services.integrationManagementService.logRequest({
            tenantId: principal.tenantId,
            apiKeyId: principal.apiKeyId,
            endpoint: "/api/integrations/campaigns",
            method: "POST",
            statusCode,
            durationMs: Date.now() - startedAt,
            requestId: request.header("x-request-id") ?? undefined,
            idempotencyKey,
            remoteIp: request.ip,
            errorMessage,
          });
        }
      }
    }),
  );

  router.get(
    "/integrations/campaigns/:id",
    asyncHandler(async (request, response) => {
      const startedAt = Date.now();
      let principal: Awaited<ReturnType<typeof resolveIntegrationPrincipal>> | undefined;
      let statusCode = 500;
      let errorMessage: string | undefined;
      try {
        principal = await resolveIntegrationPrincipal(request);
        container.services.integrationManagementService.requirePermission(principal, "CAMPAIGN_STATUS");
        const campaign = await container.services.campaignService.get(principal.tenantId, requireRouteParam(request, "id"));
        statusCode = 200;
        response.json(campaign);
      } catch (error) {
        statusCode = error instanceof HttpError ? error.statusCode : 500;
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (principal) {
          await container.services.integrationManagementService.logRequest({
            tenantId: principal.tenantId,
            apiKeyId: principal.apiKeyId,
            endpoint: `/api/integrations/campaigns/${request.params.id ?? ""}`,
            method: "GET",
            statusCode,
            durationMs: Date.now() - startedAt,
            requestId: request.header("x-request-id") ?? undefined,
            remoteIp: request.ip,
            errorMessage,
          });
        }
      }
    }),
  );

  router.get(
    "/integration-management/summary",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.integrationManagementService.counts(request.auth!.tenantId));
    }),
  );

  router.get(
    "/integration-management/api-keys",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.integrationManagementService.listApiKeys(request.auth!.tenantId));
    }),
  );

  router.post(
    "/integration-management/api-keys",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        name: z.string().trim().min(2).max(191),
        permissions: z.array(z.enum(["CAMPAIGN_CREATE", "CAMPAIGN_STATUS"])).min(1),
        expiresAt: z.string().datetime().optional(),
      }).parse(request.body);
      const created = await container.services.integrationManagementService.createApiKey({
        tenantId: request.auth!.tenantId,
        createdByUserId: request.auth!.userId,
        name: body.name,
        permissions: body.permissions,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });
      await audit(request, "INTEGRATION_API_KEY_CREATED", "IntegrationApiKey", created.id, { name: created.name, permissions: created.permissions });
      response.status(201).json(created);
    }),
  );

  router.post(
    "/integration-management/api-keys/:id/revoke",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.integrationManagementService.revokeApiKey(request.auth!.tenantId, id);
      await audit(request, "INTEGRATION_API_KEY_REVOKED", "IntegrationApiKey", id);
      response.status(204).send();
    }),
  );

  router.get(
    "/integration-management/webhooks",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json({
        items: await container.services.integrationManagementService.listWebhooks(request.auth!.tenantId),
        supportedEvents: supportedWebhookEvents,
      });
    }),
  );

  router.post(
    "/integration-management/webhooks",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        name: z.string().trim().min(2).max(191),
        url: z.string().url().max(1000).refine((value) => value.startsWith("https://") || container.env.NODE_ENV !== "production", "En producción el webhook debe usar HTTPS."),
        events: z.array(z.enum(supportedWebhookEvents)).min(1),
      }).parse(request.body);
      const created = await container.services.integrationManagementService.createWebhook({
        tenantId: request.auth!.tenantId,
        createdByUserId: request.auth!.userId,
        ...body,
      });
      await audit(request, "WEBHOOK_CREATED", "WebhookEndpoint", created.id, { name: created.name, events: created.events });
      response.status(201).json(created);
    }),
  );

  router.patch(
    "/integration-management/webhooks/:id",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        name: z.string().trim().min(2).max(191).optional(),
        url: z.string().url().max(1000).optional(),
        events: z.array(z.enum(supportedWebhookEvents)).min(1).optional(),
        status: z.enum(["ACTIVE", "DISABLED"]).optional(),
      }).parse(request.body);
      const id = requireRouteParam(request, "id");
      await container.services.integrationManagementService.updateWebhook({ tenantId: request.auth!.tenantId, id, ...body });
      await audit(request, "WEBHOOK_UPDATED", "WebhookEndpoint", id, body);
      response.status(204).send();
    }),
  );

  router.post(
    "/integration-management/webhooks/:id/test",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      const queued = await container.services.integrationManagementService.testWebhook(request.auth!.tenantId, id);
      await audit(request, "WEBHOOK_TEST_QUEUED", "WebhookEndpoint", id);
      response.status(202).json({ queued });
    }),
  );

  router.get(
    "/integration-management/webhook-deliveries",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        webhookId: z.string().uuid().optional(),
        status: z.string().max(32).optional(),
        take: z.coerce.number().int().min(1).max(500).default(100),
        skip: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);
      response.json(await container.services.integrationManagementService.listDeliveries({ tenantId: request.auth!.tenantId, ...query }));
    }),
  );

  router.post(
    "/integration-management/webhook-deliveries/:id/retry",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.integrationManagementService.retryDelivery(request.auth!.tenantId, id);
      await audit(request, "WEBHOOK_DELIVERY_REQUEUED", "WebhookDelivery", id);
      response.status(204).send();
    }),
  );

  router.get(
    "/integration-management/requests",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        statusCode: z.coerce.number().int().optional(),
        take: z.coerce.number().int().min(1).max(500).default(100),
        skip: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);
      response.json(await container.services.integrationManagementService.listRequestLogs({ tenantId: request.auth!.tenantId, ...query }));
    }),
  );

  router.get(
    "/integration-management/connectors",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        purpose: z.enum(["BOT_LOOKUP", "CONTACT_SOURCE", "GENERAL"]).optional(),
        status: z.enum(["ACTIVE", "DISABLED"]).optional(),
      }).parse(request.query);
      response.json(await container.services.externalConnectorService.list({
        tenantId: request.auth!.tenantId,
        ...query,
      }));
    }),
  );

  router.post(
    "/integration-management/connectors",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = externalConnectorCreateSchema.parse(request.body);
      const created = await container.services.externalConnectorService.create({
        tenantId: request.auth!.tenantId,
        createdByUserId: request.auth!.userId,
        ...body,
      });
      await audit(request, "EXTERNAL_CONNECTOR_CREATED", "ExternalConnector", created.id, {
        name: created.name,
        purpose: created.purpose,
        method: created.method,
      });
      response.status(201).json(created);
    }),
  );

  router.patch(
    "/integration-management/connectors/:id/status",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      const body = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }).parse(request.body);
      await container.services.externalConnectorService.setStatus(request.auth!.tenantId, id, body.status);
      await audit(request, "EXTERNAL_CONNECTOR_STATUS_CHANGED", "ExternalConnector", id, body);
      response.status(204).send();
    }),
  );

  router.post(
    "/integration-management/connectors/:id/test",
    auth,
    requirePermission(permissions.INTEGRATION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      const body = externalConnectorVariablesSchema.parse(request.body);
      const result = await container.services.externalConnectorService.test({
        tenantId: request.auth!.tenantId,
        connectorId: id,
        variables: body.variables,
      });
      await audit(request, "EXTERNAL_CONNECTOR_TESTED", "ExternalConnector", id, {
        outcome: result.outcome,
        httpStatus: result.httpStatus,
        durationMs: result.durationMs,
      });
      response.json(result);
    }),
  );

  router.post(
    "/integration-management/connectors/:id/preview-contacts",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      const body = externalConnectorVariablesSchema.parse(request.body);
      const result = await container.services.externalConnectorService.previewContacts({
        tenantId: request.auth!.tenantId,
        connectorId: id,
        variables: body.variables,
      });
      await audit(request, "EXTERNAL_CONTACT_SOURCE_IMPORTED", "ExternalConnector", id, {
        received: result.received,
        valid: result.valid,
        invalid: result.invalid,
      });
      response.json(result);
    }),
  );

  router.get(
    "/integration-management/connector-executions",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        connectorId: z.string().uuid().optional(),
        outcome: z.enum(["SUCCESS", "NOT_FOUND", "ERROR"]).optional(),
        take: z.coerce.number().int().min(1).max(500).default(100),
        skip: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);
      response.json(await container.services.externalConnectorService.listExecutions({
        tenantId: request.auth!.tenantId,
        ...query,
      }));
    }),
  );

  router.get(
    "/integration-management/connector-summary",
    auth,
    requirePermission(permissions.INTEGRATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.externalConnectorService.counts(request.auth!.tenantId));
    }),
  );

  router.get(
    "/capacity",
    auth,
    asyncHandler(async (request, response) => {
      response.json(await container.services.capacityService.snapshot(request.auth!.tenantId));
    }),
  );

  router.get(
    "/sessions",
    auth,
    requirePermission(permissions.SESSION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.sessionService.list(request.auth!.tenantId));
    }),
  );

  router.post(
    "/sessions",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        name: z.string().min(2).max(100),
        expectedPhone: z.string().max(30).optional(),
        pairingMethod: z.enum(["QR", "CODE"]).default("QR"),
      }).parse(request.body);
      const created = await container.services.sessionService.create(
        request.auth!.tenantId,
        request.auth!.userId,
        body,
      );
      await audit(request, "SESSION_CREATED", "WhatsAppSession", created.id, {
        name: body.name,
        pairingMethod: body.pairingMethod,
        hasExpectedPhone: Boolean(body.expectedPhone),
      });
      response.status(201).json(created);
    }),
  );

  router.get(
    "/sessions/:id/qr",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      const session = await container.services.sessionService.get(request.auth!.tenantId, requireRouteParam(request, "id"));
      response.json({
        status: session.status,
        pairingMethod: session.pairingMethod,
        pairingCode: session.pairingCode ?? null,
        pairingCodeUpdatedAt: session.pairingCodeUpdatedAt,
        qrUpdatedAt: session.qrUpdatedAt,
        qrDataUrl: session.qrCode ? await QRCode.toDataURL(session.qrCode, { width: 360, margin: 2 }) : null,
        lastConnectionCode: session.lastConnectionCode,
        lastConnectionError: session.lastConnectionError,
      });
    }),
  );

  router.post(
    "/sessions/:id/pairing-code",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      const session = await container.services.sessionService.get(request.auth!.tenantId, id);
      const body = z.object({ phone: z.string().max(30).optional() }).parse(request.body ?? {});
      const phone = body.phone || session.expectedPhoneE164;
      const code = await container.whatsapp.sessionGateway.requestPairingCode(id, phone);
      await audit(request, "SESSION_PAIRING_CODE_REQUESTED", "WhatsAppSession", id);
      response.json({ code });
    }),
  );

  router.delete(
    "/sessions/:id",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.whatsapp.sessionGateway.stop(id);
      await container.services.sessionService.remove(request.auth!.tenantId, id);
      await audit(request, "SESSION_DELETED", "WhatsAppSession", id);
      response.status(204).send();
    }),
  );

  router.patch(
    "/sessions/:id/bot",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({ active: z.boolean() }).parse(request.body);
      await container.services.sessionService.setBotActive(request.auth!.tenantId, requireRouteParam(request, "id"), body.active);
      await audit(request, body.active ? "SESSION_BOT_ENABLED" : "SESSION_BOT_DISABLED", "WhatsAppSession", requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.post(
    "/sessions/:id/relink",
    auth,
    requirePermission(permissions.SESSION_MANAGE),
    asyncHandler(async (request, response) => {
      await container.services.sessionService.relink(request.auth!.tenantId, requireRouteParam(request, "id"));
      await audit(request, "SESSION_RELINK_REQUESTED", "WhatsAppSession", requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.get(
    "/media",
    auth,
    requirePermission(permissions.MEDIA_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.mediaAssetService.list(request.auth!.tenantId));
    }),
  );

  router.post(
    "/media/upload-intents",
    auth,
    requirePermission(permissions.MEDIA_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        fileName: z.string().min(1).max(191),
        mimeType: z.string().min(3).max(191),
        sizeBytes: z.number().int().positive().max(container.env.MAX_MEDIA_BYTES),
      }).parse(request.body);
      const intent = await container.services.mediaAssetService.createDirectUploadIntent({
        tenantId: request.auth!.tenantId,
        originalName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      });
      await audit(request, "MEDIA_UPLOAD_INTENT_CREATED", "MediaAsset", undefined, {
        fileName: body.fileName,
        sizeBytes: body.sizeBytes,
      });
      response.status(201).json(intent);
    }),
  );

  router.post(
    "/media/upload-intents/confirm",
    auth,
    requirePermission(permissions.MEDIA_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({ uploadToken: z.string().min(20) }).parse(request.body);
      const created = await container.services.mediaAssetService.confirmDirectUpload(
        request.auth!.tenantId,
        body.uploadToken,
      );
      await audit(request, "MEDIA_DIRECT_UPLOAD_CONFIRMED", "MediaAsset", created.id, {
        fileName: created.fileName,
        sizeBytes: created.sizeBytes,
      });
      response.status(201).json(created);
    }),
  );

  // En modo MOCK el navegador no puede escribir sobre URLs mock://.
  // El endpoint multipart es obligatorio para desarrollo local.
  if (container.env.ENABLE_LEGACY_MEDIA_UPLOAD || container.env.OBJECT_STORAGE_MODE === "MOCK") {
    router.post(
      "/media",
      auth,
      requirePermission(permissions.MEDIA_MANAGE),
      upload.single("file"),
      asyncHandler(async (request, response) => {
        if (!request.file) throw new HttpError(400, "Selecciona un archivo.");
        const created = await container.services.mediaAssetService.upload({
          tenantId: request.auth!.tenantId,
          originalName: request.file.originalname,
          mimeType: request.file.mimetype,
          body: request.file.buffer,
        });
        await audit(request, "MEDIA_UPLOADED", "MediaAsset", created.id, {
          fileName: request.file.originalname,
          size: request.file.size,
        });
        response.status(201).json(created);
      }),
    );
  }

  router.get(
    "/campaigns",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.campaignService.list(request.auth!.tenantId));
    }),
  );

  router.post(
    "/campaigns/contacts/validate",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const parsed = z.object({
        contacts: z.array(campaignContactSchema).min(1).max(50000),
        defaultRegion: z.string().length(2).optional(),
      }).parse(request.body);

      response.json(container.services.campaignService.validateContacts({
        contacts: parsed.contacts,
        defaultRegion: parsed.defaultRegion ?? container.env.DEFAULT_COUNTRY_REGION,
      }));
    }),
  );

  router.post(
    "/campaigns",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const parsed = campaignCreateSchema.parse(request.body);
      const body = { ...parsed, defaultRegion: parsed.defaultRegion ?? container.env.DEFAULT_COUNTRY_REGION };
      const created = await container.services.campaignService.create({
        tenantId: request.auth!.tenantId,
        ownerUserId: request.auth!.userId,
        ...body,
      });
      await audit(request, "CAMPAIGN_CREATED", "Campaign", created.id, { contacts: body.contacts.length });
      await container.services.integrationManagementService.emit({ tenantId: request.auth!.tenantId, eventType: "CAMPAIGN_CREATED", aggregateType: "Campaign", aggregateId: created.id, payload: { campaignId: created.id, name: created.name, contacts: body.contacts.length, source: "WEB" } });
      response.status(201).json(created);
    }),
  );

  router.post(
    "/campaigns/:id/start",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      await container.services.campaignService.start(request.auth!.tenantId, requireRouteParam(request, "id"));
      const id = requireRouteParam(request, "id");
      await audit(request, "CAMPAIGN_STARTED", "Campaign", id);
      await container.services.integrationManagementService.emit({ tenantId: request.auth!.tenantId, eventType: "CAMPAIGN_STARTED", aggregateType: "Campaign", aggregateId: id, payload: { campaignId: id } });
      response.status(204).send();
    }),
  );

  router.post(
    "/campaigns/:id/pause",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      await container.services.campaignService.pause(request.auth!.tenantId, requireRouteParam(request, "id"));
      const id = requireRouteParam(request, "id");
      await audit(request, "CAMPAIGN_PAUSED", "Campaign", id);
      await container.services.integrationManagementService.emit({ tenantId: request.auth!.tenantId, eventType: "CAMPAIGN_PAUSED", aggregateType: "Campaign", aggregateId: id, payload: { campaignId: id } });
      response.status(204).send();
    }),
  );

  router.post(
    "/campaigns/:id/resume",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      await container.services.campaignService.resume(request.auth!.tenantId, requireRouteParam(request, "id"));
      const id = requireRouteParam(request, "id");
      await audit(request, "CAMPAIGN_RESUMED", "Campaign", id);
      await container.services.integrationManagementService.emit({ tenantId: request.auth!.tenantId, eventType: "CAMPAIGN_RESUMED", aggregateType: "Campaign", aggregateId: id, payload: { campaignId: id } });
      response.status(204).send();
    }),
  );

  router.post(
    "/campaigns/:id/cancel",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      await container.services.campaignService.cancel(request.auth!.tenantId, requireRouteParam(request, "id"));
      const id = requireRouteParam(request, "id");
      await audit(request, "CAMPAIGN_CANCELLED", "Campaign", id);
      await container.services.integrationManagementService.emit({ tenantId: request.auth!.tenantId, eventType: "CAMPAIGN_CANCELLED", aggregateType: "Campaign", aggregateId: id, payload: { campaignId: id } });
      response.status(204).send();
    }),
  );

  router.get(
    "/recurring-campaigns",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.recurringCampaignService.list(request.auth!.tenantId));
    }),
  );

  router.post(
    "/recurring-campaigns",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const parsed = recurringCampaignCreateSchema.parse(request.body);
      const created = await container.services.recurringCampaignService.create({
        tenantId: request.auth!.tenantId,
        createdByUserId: request.auth!.userId,
        ...parsed,
        defaultRegion: parsed.defaultRegion ?? container.env.DEFAULT_COUNTRY_REGION,
      });
      await audit(request, "RECURRING_CAMPAIGN_CREATED", "RecurringCampaign", created.id, { name: created.name });
      response.status(201).json(created);
    }),
  );

  router.post(
    "/recurring-campaigns/:id/pause",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.recurringCampaignService.pause(request.auth!.tenantId, id);
      await audit(request, "RECURRING_CAMPAIGN_PAUSED", "RecurringCampaign", id);
      response.status(204).send();
    }),
  );

  router.post(
    "/recurring-campaigns/:id/resume",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.recurringCampaignService.resume(request.auth!.tenantId, id);
      await audit(request, "RECURRING_CAMPAIGN_RESUMED", "RecurringCampaign", id);
      response.status(204).send();
    }),
  );

  router.delete(
    "/recurring-campaigns/:id",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.recurringCampaignService.remove(request.auth!.tenantId, id);
      await audit(request, "RECURRING_CAMPAIGN_DELETED", "RecurringCampaign", id);
      response.status(204).send();
    }),
  );

  const requireVoto1x10 = () => {
    if (!container.services.voto1x10HierarchyService) {
      throw new HttpError(
        503,
        "La integración con el sistema 1x10 no está configurada (faltan VOTO1X10_API_BASE_URL/VOTO1X10_SERVICE_USERNAME/VOTO1X10_SERVICE_PASSWORD en el .env).",
      );
    }
    return container.services.voto1x10HierarchyService;
  };

  router.get(
    "/voto1x10/jerarquia",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (_request, response) => {
      response.json(await requireVoto1x10().getJerarquia());
    }),
  );

  router.post(
    "/voto1x10/contactos",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const parsed = jerarquiaSeleccionSchema.parse(request.body);
      response.json(await requireVoto1x10().getContactosPorSeleccion(parsed));
    }),
  );

  router.post(
    "/campaigns/purge-all",
    asyncHandler(async (_request, response) => {
      try {
        await container.prisma.whatsAppMessage.deleteMany({ where: { queueItemId: { not: null } } });
        await container.prisma.messageAttempt.deleteMany();
        await container.prisma.messageQueue.deleteMany();
        await container.prisma.campaignSession.deleteMany();
        await container.prisma.mediaPreparationJob.deleteMany();
        await container.prisma.campaign.deleteMany();
        response.json({ ok: true, message: "Todas las campañas y colas fueron purgadas exitosamente." });
      } catch (err: any) {
        response.status(500).json({ error: err?.message || "Error al purgar campañas" });
      }
    }),
  );

  router.get(
    "/campaigns/:id/messages",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      const campaignId = requireRouteParam(request, "id");
      const campaign = await container.repositories.campaigns.findByIdForTenant(campaignId, request.auth!.tenantId);
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");

      const query = z.object({
        status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED", "DEAD_LETTER", "CANCELLED"]).optional(),
        take: z.coerce.number().int().min(1).max(500).default(250),
        skip: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);

      response.json(await container.repositories.messageQueue.listByCampaign({
        tenantId: request.auth!.tenantId,
        campaignId,
        status: query.status,
        take: query.take,
        skip: query.skip,
      }));
    }),
  );

  router.get(
    "/campaigns/:id/performance",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      const tenantId = request.auth!.tenantId;
      const campaignId = requireRouteParam(request, "id");
      const campaign = await container.repositories.campaigns.findByIdForTenant(campaignId, tenantId);
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");

      const stats = await container.repositories.messageQueue.getCampaignPerformance({
        tenantId,
        campaignId,
        since: new Date(Date.now() - 60_000),
      });
      const configuredSessionIds = await container.repositories.campaigns.getSessionIds(campaignId);
      const configuredSet = new Set(configuredSessionIds);
      const sessions = await container.repositories.sessions.listByTenant(tenantId);
      const connectedSessions = sessions.filter((session) => configuredSet.has(session.id) && session.status === "CONNECTED").length;
      const activeWorkers = await container.repositories.workerNodes.listActive(new Date());
      const remaining = stats.pending + stats.processing + stats.held;
      const messagesPerMinute = stats.sentLastMinute;

      const connectedCampaignSessions = sessions.filter(
        (session) => configuredSet.has(session.id) && session.status === "CONNECTED",
      );
      const campaignSessionsByWorker = new Map<string, number>();
      for (const session of connectedCampaignSessions) {
        if (!session.leaseOwner) continue;
        campaignSessionsByWorker.set(
          session.leaseOwner,
          (campaignSessionsByWorker.get(session.leaseOwner) ?? 0) + 1,
        );
      }

      const workerRows = activeWorkers.map((worker) => {
        const metadata = worker.metadata;
        const inFlight = metadata?.queueInFlight ?? 0;
        const maxInFlight = metadata?.queueMaxInFlight || container.env.QUEUE_MAX_INFLIGHT;
        return {
          id: worker.id,
          pid: metadata?.pid,
          sessionCount: campaignSessionsByWorker.get(worker.id) ?? 0,
          inFlight,
          maxInFlight,
          slotUsagePercent: maxInFlight > 0
            ? Math.round((Math.min(inFlight, maxInFlight) / maxInFlight) * 10_000) / 100
            : 0,
          processCpuPercent: metadata?.processCpuPercent ?? null,
          processMemoryMb: metadata?.processRssBytes
            ? Math.round(metadata.processRssBytes / 1024 / 1024)
            : null,
          activeSessionSlots: metadata?.queueActiveSessions ?? 0,
          haltedSessions: metadata?.queueHaltedSessions ?? 0,
        };
      });

      const totalWorkerInFlight = workerRows.reduce((sum, worker) => sum + worker.inFlight, 0);
      const hostCpuValues = activeWorkers
        .map((worker) => worker.metadata?.hostCpuPercent)
        .filter((value): value is number => typeof value === "number");
      const hostMemoryValues = activeWorkers
        .map((worker) => {
          const metadata = worker.metadata;
          if (!metadata?.hostTotalMemoryBytes || metadata.hostFreeMemoryBytes === undefined) return undefined;
          return {
            usedPercent: Math.round(
              ((metadata.hostTotalMemoryBytes - metadata.hostFreeMemoryBytes)
                / metadata.hostTotalMemoryBytes) * 10_000,
            ) / 100,
            totalMb: Math.round(metadata.hostTotalMemoryBytes / 1024 / 1024),
            usedMb: Math.round(
              (metadata.hostTotalMemoryBytes - metadata.hostFreeMemoryBytes) / 1024 / 1024,
            ),
          };
        })
        .filter((value): value is { usedPercent: number; totalMb: number; usedMb: number } => !!value);

      const serverCpuPercent = hostCpuValues.length ? Math.max(...hostCpuValues) : null;
      const memorySample = hostMemoryValues.sort((a, b) => b.usedPercent - a.usedPercent)[0];
      const serverMemoryUsedPercent = memorySample?.usedPercent ?? null;

      const health = buildCampaignCapacityHealth({
        ...stats,
        connectedSessions,
        activeWorkers: activeWorkers.length,
        sessionConcurrency: container.env.QUEUE_SESSION_CONCURRENCY,
        maxInFlight: container.env.QUEUE_MAX_INFLIGHT,
        totalWorkerInFlight,
        serverCpuPercent: serverCpuPercent ?? undefined,
        serverMemoryUsedPercent: serverMemoryUsedPercent ?? undefined,
      });

      response.json({
        campaignId,
        ...stats,
        ...health,
        messagesPerMinute,
        connectedSessions,
        configuredSessions: configuredSessionIds.length,
        activeWorkers: activeWorkers.length,
        workers: workerRows,
        server: {
          cpuPercent: serverCpuPercent,
          memoryUsedPercent: serverMemoryUsedPercent,
          memoryUsedMb: memorySample?.usedMb ?? null,
          memoryTotalMb: memorySample?.totalMb ?? null,
          workerProcessMemoryMb: workerRows.reduce(
            (sum, worker) => sum + (worker.processMemoryMb ?? 0),
            0,
          ),
        },
        sessionConcurrency: container.env.QUEUE_SESSION_CONCURRENCY,
        maxInFlight: container.env.QUEUE_MAX_INFLIGHT,
        sendDelayMinMs: container.env.SEND_DELAY_MIN_MS,
        sendDelayMaxMs: container.env.SEND_DELAY_MAX_MS,
        sampleWindowSeconds: 60,
        estimatedMinutesRemaining: remaining === 0
          ? 0
          : messagesPerMinute > 0
            ? Math.ceil(remaining / messagesPerMinute)
            : null,
      });
    }),
  );

  router.get(
    "/campaigns/:id/recovery",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await campaignRecoverySnapshot(
        request.auth!.tenantId,
        requireRouteParam(request, "id"),
      ));
    }),
  );

  router.post(
    "/campaigns/:id/recovery",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const tenantId = request.auth!.tenantId;
      const campaignId = requireRouteParam(request, "id");
      const body = z.object({
        sessionIds: z.array(z.string().uuid()).min(1).max(50),
      }).parse(request.body);

      const campaign = await container.repositories.campaigns.findByIdForTenant(campaignId, tenantId);
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
      if (["COMPLETED", "COMPLETED_WITH_ERRORS", "CANCELLED"].includes(campaign.status)) {
        throw new HttpError(409, "La campaña ya terminó y no admite recuperación.");
      }
      if (campaign.status === "DRAFT") {
        throw new HttpError(409, "La campaña todavía no fue iniciada. Usa Iniciar en lugar de Recuperar.");
      }

      const selectedSessionIds = [...new Set(body.sessionIds)];
      const configuredBefore = new Set(await container.repositories.campaigns.getSessionIds(campaignId));
      const sessionsToAdd = selectedSessionIds.filter((sessionId) => !configuredBefore.has(sessionId));
      const added = sessionsToAdd.length > 0
        ? await container.repositories.campaigns.addSessions({
            campaignId,
            tenantId,
            ownerUserId: request.auth!.userId,
            sessionIds: sessionsToAdd,
          })
        : { addedSessionIds: [], configuredSessionIds: [...configuredBefore] };

      const result = await container.repositories.messageQueue.recoverTechnicalPending({
        tenantId,
        campaignId,
        targetSessionIds: selectedSessionIds,
        availableAt: new Date(Date.now() + 1000),
      });

      if (result.movedMessages > 0 && ["PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"].includes(campaign.status)) {
        await container.repositories.campaigns.setPreparing(campaignId, tenantId);
        await container.services.integrationManagementService.emit({
          tenantId,
          eventType: "CAMPAIGN_RESUMED",
          aggregateType: "Campaign",
          aggregateId: campaignId,
          payload: {
            campaignId,
            source: "MANUAL_TECHNICAL_RECOVERY",
            movedMessages: result.movedMessages,
            targetSessionIds: selectedSessionIds,
          },
        });
      }

      await audit(request, "CAMPAIGN_TECHNICAL_RECOVERY", "Campaign", campaignId, {
        selectedSessionIds,
        addedSessionIds: added.addedSessionIds,
        movedMessages: result.movedMessages,
        heldRestrictionMessages: result.heldRestrictionMessages,
        inFlightLockedMessages: result.inFlightLockedMessages,
      });

      response.json({
        ...(await campaignRecoverySnapshot(tenantId, campaignId)),
        lastRecovery: {
          selectedSessionIds,
          addedSessionIds: added.addedSessionIds,
          movedMessages: result.movedMessages,
          heldRestrictionMessages: result.heldRestrictionMessages,
          inFlightLockedMessages: result.inFlightLockedMessages,
          untouchedOpenMessages: result.untouchedOpenMessages,
        },
      });
    }),
  );

  router.get(
    "/campaigns/:id/dead-letters",
    auth,
    requirePermission(permissions.CAMPAIGN_VIEW),
    asyncHandler(async (request, response) => {
      const campaign = await container.repositories.campaigns.findByIdForTenant(requireRouteParam(request, "id"), request.auth!.tenantId);
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
      const query = z.object({ take: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
      response.json(await container.repositories.deadLetters.listByCampaign(request.auth!.tenantId, requireRouteParam(request, "id"), query.take));
    }),
  );

  router.post(
    "/campaigns/:id/dead-letters/:deadLetterId/requeue",
    auth,
    requirePermission(permissions.CAMPAIGN_MANAGE),
    asyncHandler(async (request, response) => {
      const campaign = await container.repositories.campaigns.findByIdForTenant(requireRouteParam(request, "id"), request.auth!.tenantId);
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
      await container.repositories.deadLetters.requeue(request.auth!.tenantId, requireRouteParam(request, "deadLetterId"));
      await container.repositories.campaigns.refreshStats(requireRouteParam(request, "id"));
      await audit(request, "DEAD_LETTER_REQUEUED", "DeadLetterMessage", requireRouteParam(request, "deadLetterId"), {
        campaignId: requireRouteParam(request, "id"),
      });
      response.status(204).send();
    }),
  );

  router.get(
    "/flows",
    auth,
    requirePermission(permissions.FLOW_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.botFlowService.list(request.auth!.tenantId));
    }),
  );

  router.post(
    "/flows",
    auth,
    requirePermission(permissions.FLOW_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({
        name: z.string().min(2).max(150),
        description: z.string().max(1000).optional(),
        trigger: z.object({ type: z.enum(["ANY", "CONTAINS", "EXACT"]), value: z.string().max(1000).optional() }),
        steps: z.array(botFlowStepSchema).min(1).max(50),
        sessionIds: z.array(z.string().uuid()).min(1),
      }).parse(request.body);
      const created = await container.services.botFlowService.create({
        tenantId: request.auth!.tenantId,
        ownerUserId: request.auth!.userId,
        ...body,
      });
      await audit(request, "FLOW_CREATED", "BotFlow", created.id);
      response.status(201).json(created);
    }),
  );

  router.patch(
    "/flows/:id/active",
    auth,
    requirePermission(permissions.FLOW_MANAGE),
    asyncHandler(async (request, response) => {
      const body = z.object({ active: z.boolean() }).parse(request.body);
      await container.services.botFlowService.setActive(requireRouteParam(request, "id"), request.auth!.tenantId, body.active);
      await audit(request, body.active ? "FLOW_ENABLED" : "FLOW_DISABLED", "BotFlow", requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.get(
    "/conversations",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        search: z.string().max(200).optional(),
        mode: z.enum(["ALL", "BOT", "HUMAN"]).default("ALL"),
        status: z.enum(["ALL", "OPEN", "CLOSED"]).default("OPEN"),
        sessionId: z.string().uuid().optional(),
        assignedAgentId: z.string().uuid().optional(),
        take: z.coerce.number().int().min(1).max(500).default(500),
      }).parse(request.query);
      response.json(await container.services.handoffService.list(request.auth!.tenantId, query));
    }),
  );

  router.get(
    "/conversations/agents",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.repositories.users.listActiveByTenant(request.auth!.tenantId));
    }),
  );

  router.post(
    "/conversations/direct-messages",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const body = z.object({
        sessionId: z.string().uuid(),
        phone: z.string().trim().min(8).max(30),
        displayName: z.string().trim().max(191).optional(),
        text: z.string().trim().min(1).max(4096),
      }).parse(request.body);

      const queued = await container.services.handoffService.sendDirectText(
        request.auth!.tenantId,
        request.auth!.userId,
        body,
      );

      await audit(
        request,
        "CONVERSATION_DIRECT_MESSAGE_QUEUED",
        "Conversation",
        queued.conversationId,
        { outboxId: queued.outboxId, sessionId: body.sessionId },
      );

      response.status(202).json({
        conversationId: queued.conversationId,
        outboxId: queued.outboxId,
        status: "PENDING",
      });
    }),
  );

  router.get(
    "/conversations/:id",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      const item = await container.services.handoffService.get(request.auth!.tenantId, requireRouteParam(request, "id"));
      if (!item) throw new HttpError(404, "Conversación no encontrada.");
      response.json(item);
    }),
  );

  router.get(
    "/conversations/:id/messages",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        take: z.coerce.number().int().min(1).max(250).default(100),
        before: z.string().datetime().optional(),
      }).parse(request.query);
      response.json(await container.services.handoffService.messages(
        request.auth!.tenantId,
        requireRouteParam(request, "id"),
        query.take,
        query.before ? new Date(query.before) : undefined,
      ));
    }),
  );

  router.post(
    "/conversations/:id/messages",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const body = z.object({ text: z.string().trim().min(1).max(4096) }).parse(request.body);
      const id = requireRouteParam(request, "id");
      const outboxId = await container.services.handoffService.sendText(
        request.auth!.tenantId,
        id,
        request.auth!.userId,
        body.text,
      );
      await audit(request, "CONVERSATION_MESSAGE_QUEUED", "Conversation", id, { outboxId });
      response.status(202).json({ outboxId, status: "PENDING" });
    }),
  );

  router.get(
    "/conversations/:id/notes",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.handoffService.notes(
        request.auth!.tenantId,
        requireRouteParam(request, "id"),
      ));
    }),
  );

  router.post(
    "/conversations/:id/notes",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const body = z.object({ text: z.string().trim().min(1).max(2000) }).parse(request.body);
      const id = requireRouteParam(request, "id");
      const note = await container.services.handoffService.addNote(
        request.auth!.tenantId,
        id,
        request.auth!.userId,
        body.text,
      );
      await audit(request, "CONVERSATION_NOTE_ADDED", "Conversation", id);
      response.status(201).json(note);
    }),
  );

  router.patch(
    "/conversations/:id/profile",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const body = z.object({
        displayName: z.string().trim().max(191).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      }).parse(request.body);
      const id = requireRouteParam(request, "id");
      await container.services.handoffService.updateProfile(request.auth!.tenantId, id, body);
      await audit(request, "CONVERSATION_PROFILE_UPDATED", "Conversation", id, body);
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/mark-read",
    auth,
    requirePermission(permissions.CONVERSATION_VIEW),
    asyncHandler(async (request, response) => {
      await container.services.handoffService.markRead(request.auth!.tenantId, requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/take-over",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      await container.services.handoffService.takeOver(request.auth!.tenantId, requireRouteParam(request, "id"), request.auth!.userId);
      await audit(request, "CONVERSATION_TAKEN_OVER", "Conversation", requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/assign",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const body = z.object({ agentId: z.string().uuid() }).parse(request.body);
      const agent = await container.repositories.users.findById(body.agentId);
      if (!agent || agent.tenantId !== request.auth!.tenantId) throw new HttpError(404, "Agente no encontrado.");
      const id = requireRouteParam(request, "id");
      await container.services.handoffService.takeOver(request.auth!.tenantId, id, agent.id);
      await audit(request, "CONVERSATION_ASSIGNED", "Conversation", id, { agentId: agent.id, agentEmail: agent.email });
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/release",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      await container.services.handoffService.release(request.auth!.tenantId, requireRouteParam(request, "id"));
      await audit(request, "CONVERSATION_RELEASED", "Conversation", requireRouteParam(request, "id"));
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/reset-flow",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.handoffService.resetFlow(request.auth!.tenantId, id);
      await audit(request, "CONVERSATION_FLOW_RESET", "Conversation", id);
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/close",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.handoffService.close(request.auth!.tenantId, id);
      await audit(request, "CONVERSATION_CLOSED", "Conversation", id);
      response.status(204).send();
    }),
  );

  router.post(
    "/conversations/:id/reopen",
    auth,
    requirePermission(permissions.CONVERSATION_TAKEOVER),
    asyncHandler(async (request, response) => {
      const id = requireRouteParam(request, "id");
      await container.services.handoffService.reopen(request.auth!.tenantId, id);
      await audit(request, "CONVERSATION_REOPENED", "Conversation", id);
      response.status(204).send();
    }),
  );

  router.post(
    "/system/integration-probe",
    auth,
    requirePermission(permissions.SYSTEM_VIEW),
    asyncHandler(async (request, response) => {
      const body = z.object({
        sessionId: z.string().uuid().optional(),
        requireConnectedSession: z.boolean().default(false),
        performStorageRoundTrip: z.boolean().default(true),
      }).parse(request.body ?? {});

      const result = await container.services.integrationValidationService.run({
        tenantId: request.auth!.tenantId,
        sessionId: body.sessionId,
        requireConnectedSession: body.requireConnectedSession,
        performStorageRoundTrip: body.performStorageRoundTrip,
      });

      if (result.checks.database.status === "PASS") {
        await audit(request, "INTEGRATION_PROBE_EXECUTED", "System", undefined, {
          decision: result.decision,
          sessionId: body.sessionId,
          realModes: result.realModes,
        });
      }

      response.status(result.decision === "PASS" ? 200 : 503).json(result);
    }),
  );

  router.get(
    "/system/diagnostics",
    auth,
    requirePermission(permissions.SYSTEM_VIEW),
    asyncHandler(async (_request, response) => {
      const workers = await container.repositories.workerNodes.listActive(new Date());
      response.json({
        version: container.env.APP_VERSION,
        environment: container.env.DEPLOYMENT_ENV,
        commit: container.env.BUILD_COMMIT,
        modes: {
          whatsappGateway: container.env.WHATSAPP_GATEWAY_MODE,
          objectStorage: container.env.OBJECT_STORAGE_MODE,
          coordination: container.env.COORDINATION_PROVIDER,
          eventTransport: container.env.EVENT_TRANSPORT,
          workerSharding: container.env.WORKER_SHARD_MODE,
        },
        activeWorkers: workers,
        generatedAt: new Date().toISOString(),
      });
    }),
  );

  router.get(
    "/audit-logs",
    auth,
    requirePermission(permissions.AUDIT_VIEW),
    asyncHandler(async (request, response) => {
      const query = z.object({
        search: z.string().max(200).optional(),
        action: z.string().max(191).optional(),
        entityType: z.string().max(191).optional(),
        result: z.enum(["SUCCESS", "FAILURE"]).optional(),
        actorUserId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        take: z.coerce.number().int().min(1).max(500).default(50),
        skip: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);
      response.json(await container.services.auditService.list(request.auth!.tenantId, {
        ...query,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }));
    }),
  );

  router.get(
    "/audit-logs/options",
    auth,
    requirePermission(permissions.AUDIT_VIEW),
    asyncHandler(async (request, response) => {
      response.json(await container.services.auditService.options(request.auth!.tenantId));
    }),
  );

  return router;
}
