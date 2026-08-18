import { Prisma, type BotFlow, type PrismaClient } from "@prisma/client";
import type {
  BotFlowDefinition,
  BotFlowRecord,
  IBotFlowRepository,
  LegacyBotFlowDefinition,
} from "../../application/ports/repositories/bot-flow.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { decodeJson, encodeJson } from "../../shared/utils/json-buffer.js";

function normalizeDefinition(value: BotFlowDefinition | LegacyBotFlowDefinition): BotFlowDefinition {
  if ("version" in value && value.version === 2) return value;
  const text = value.replyText?.trim() || "Gracias por escribirnos.";
  return {
    version: 2,
    trigger: { type: "ANY" },
    steps: [
      { id: "legacy-message", type: "MESSAGE", text },
      { id: "legacy-end", type: "END" },
    ],
    replyText: text,
  };
}

function mapFlow(row: BotFlow, sessionIds: string[]): BotFlowRecord {
  const stored = decodeJson<BotFlowDefinition | LegacyBotFlowDefinition>(Buffer.from(row.definitionPayload));
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? undefined,
    version: row.version,
    isActive: row.isActive,
    definition: normalizeDefinition(stored),
    sessionIds,
    createdAt: row.createdAt,
  };
}

function triggerMatches(definition: BotFlowDefinition, inboundText = ""): boolean {
  const text = inboundText.trim().toLocaleLowerCase();
  const value = definition.trigger.value?.trim().toLocaleLowerCase() || "";
  if (definition.trigger.type === "ANY") return true;
  if (!value) return false;
  return definition.trigger.type === "EXACT" ? text === value : text.includes(value);
}

export function triggerPriority(definition: BotFlowDefinition, inboundText = ""): number {
  if (!triggerMatches(definition, inboundText)) return -1;
  const valueLength = definition.trigger.value?.trim().length ?? 0;
  if (definition.trigger.type === "EXACT") return 3000 + valueLength;
  if (definition.trigger.type === "CONTAINS") return 2000 + valueLength;
  return 1000;
}

export class PrismaBotFlowRepository implements IBotFlowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    tenantId: string;
    ownerUserId: string;
    name: string;
    description?: string;
    definition: BotFlowDefinition;
    sessionIds: string[];
  }): Promise<BotFlowRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const uniqueSessionIds = [...new Set(input.sessionIds)];
        const sessions = await tx.whatsAppSession.findMany({
          where: {
            id: { in: uniqueSessionIds },
            tenantId: input.tenantId,
            ownerUserId: input.ownerUserId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (sessions.length !== uniqueSessionIds.length) {
          throw new HttpError(403, "Una o más sesiones no pertenecen al usuario autenticado.");
        }

        // Al publicar un flujo sobre una sesión, el bot debe quedar habilitado.
        // De lo contrario el flujo figura ACTIVO pero los mensajes entrantes se ignoran.
        await tx.whatsAppSession.updateMany({
          where: {
            id: { in: uniqueSessionIds },
            tenantId: input.tenantId,
            ownerUserId: input.ownerUserId,
            deletedAt: null,
          },
          data: { isBotActive: true },
        });

        const latestVersion = await tx.botFlow.findFirst({
          where: { tenantId: input.tenantId, name: input.name },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latestVersion?.version ?? 0) + 1;

        // La nueva versión reemplaza a las anteriores con el mismo nombre.
        await tx.botFlow.updateMany({
          where: { tenantId: input.tenantId, name: input.name, isActive: true },
          data: { isActive: false },
        });

        const flow = await tx.botFlow.create({
          data: {
            tenantId: input.tenantId,
            name: input.name,
            description: input.description,
            version: nextVersion,
            definitionPayload: encodeJson(input.definition),
          },
        });

        if (uniqueSessionIds.length > 0) {
          await tx.botFlowSession.createMany({
            data: uniqueSessionIds.map((sessionId, index) => ({
              flowId: flow.id,
              sessionId,
              priority: index + 1,
            })),
          });
        }

        return mapFlow(flow, uniqueSessionIds);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Ya existe una versión de este flujo. Actualiza la lista y vuelve a intentarlo.");
      }
      throw error;
    }
  }

  async listByTenant(tenantId: string): Promise<BotFlowRecord[]> {
    const rows = await this.prisma.botFlow.findMany({
      where: { tenantId },
      include: { sessionLinks: { where: { isEnabled: true }, orderBy: { priority: "asc" } } },
      orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    });
    return rows.map((row) => mapFlow(row, row.sessionLinks.map((link) => link.sessionId)));
  }

  async setActive(id: string, tenantId: string, active: boolean): Promise<void> {
    const result = await this.prisma.botFlow.updateMany({ where: { id, tenantId }, data: { isActive: active } });
    if (result.count !== 1) throw new HttpError(404, "Flujo no encontrado.");
  }

  async findActiveForSession(sessionId: string, inboundText = ""): Promise<BotFlowRecord | null> {
    const links = await this.prisma.botFlowSession.findMany({
      where: { sessionId, isEnabled: true, flow: { isActive: true } },
      include: { flow: true },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });

    const candidates = links
      .map((link) => ({
        flow: mapFlow(link.flow, [sessionId]),
        linkPriority: link.priority,
      }))
      .map((candidate) => ({
        ...candidate,
        triggerPriority: triggerPriority(candidate.flow.definition, inboundText),
      }))
      .filter((candidate) => candidate.triggerPriority >= 0)
      .sort((left, right) =>
        right.triggerPriority - left.triggerPriority
        || left.linkPriority - right.linkPriority
        || right.flow.version - left.flow.version
        || right.flow.createdAt.getTime() - left.flow.createdAt.getTime(),
      );

    return candidates[0]?.flow ?? null;
  }

  async findByIdForSession(id: string, sessionId: string): Promise<BotFlowRecord | null> {
    const link = await this.prisma.botFlowSession.findFirst({
      where: { flowId: id, sessionId, isEnabled: true, flow: { isActive: true } },
      include: { flow: true },
    });
    return link ? mapFlow(link.flow, [sessionId]) : null;
  }
}
