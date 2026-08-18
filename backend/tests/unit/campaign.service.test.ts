import assert from "node:assert/strict";
import test from "node:test";
import { CampaignService } from "../../src/application/services/campaign.service.js";
import type { ICampaignRepository, CreateCampaignInput, CampaignRecord } from "../../src/application/ports/repositories/campaign.repository.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

class CampaignRepositoryFake implements ICampaignRepository {
  created?: CreateCampaignInput;
  failCreate = false;
  records = new Map<string, CampaignRecord>();

  async createWithQueue(input: CreateCampaignInput): Promise<CampaignRecord> {
    this.created = input;
    if (this.failCreate) throw new Error("database unavailable");
    const record: CampaignRecord = {
      id: input.id,
      tenantId: input.tenantId,
      name: input.name,
      status: "DRAFT",
      mediaAssetId: input.mediaAssetId,
      messagePayload: Buffer.from(JSON.stringify(input.message)),
      totalMessages: input.contacts.length,
      sentMessages: 0,
      failedMessages: 0,
      createdAt: new Date(),
      sessionIds: input.sessionIds,
    };
    this.records.set(record.id, record);
    return record;
  }

  async listByTenant(tenantId: string) { return [...this.records.values()].filter((item) => item.tenantId === tenantId); }
  async findByIdForTenant(id: string, tenantId: string) { const item = this.records.get(id); return item?.tenantId === tenantId ? item : null; }
  async setPreparing(id: string) { const item = this.records.get(id); if (item) item.status = "PREPARING"; }
  async pause(id: string) { const item = this.records.get(id); if (item) item.status = "PAUSED"; }
  async cancel(id: string) { const item = this.records.get(id); if (item) item.status = "CANCELLED"; }
  async setRunning() { return true; }
  async setCompleted(id: string) { const item = this.records.get(id); if (item) item.status = "COMPLETED"; }
  async listPreparing() { return [...this.records.values()].filter((item) => item.status === "PREPARING"); }
  async getSessionIds(id: string) { return this.records.get(id)?.sessionIds ?? []; }
  async refreshStats() {}
}

function buildService(repository: CampaignRepositoryFake) {
  const calls = { reserve: [] as unknown[], release: [] as unknown[] };
  const capacity = {
    reserveCampaign: async (input: unknown) => { calls.reserve.push(input); },
    releaseCampaignReservation: async (input: unknown) => { calls.release.push(input); },
  };
  const phones = {
    normalize: (raw: string) => {
      const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
      const e164 = digits.startsWith("591") ? `+${digits}` : `+591${digits}`;
      return { original: raw, e164, digits: e164.slice(1), regionCode: "BO" };
    },
  };
  return { service: new CampaignService(repository, phones as never, capacity as never), calls };
}

test("deduplica contactos normalizados y sesiones antes de crear la cola", async () => {
  const repository = new CampaignRepositoryFake();
  const { service, calls } = buildService(repository);

  const result = await service.create({
    tenantId: "tenant-1",
    ownerUserId: "user-1",
    name: "  Campaña prueba  ",
    sessionIds: ["session-a", "session-a", "session-b"],
    contacts: [
      { name: "Ana", phone: "70000001" },
      { name: "Ana duplicada", phone: "+59170000001" },
      { name: "Luis", phone: "70000002" },
    ],
    message: { text: "Hola" },
    defaultRegion: "BO",
  });

  assert.equal(result.name, "Campaña prueba");
  assert.deepEqual(repository.created?.sessionIds, ["session-a", "session-b"]);
  assert.equal(repository.created?.contacts.length, 2);
  assert.equal(calls.reserve.length, 1);
  assert.equal((calls.reserve[0] as { messageCount: number }).messageCount, 2);
  assert.equal(calls.release.length, 0);
});

test("libera la reserva de cuota cuando falla la transacción de campaña", async () => {
  const repository = new CampaignRepositoryFake();
  repository.failCreate = true;
  const { service, calls } = buildService(repository);

  await assert.rejects(() => service.create({
    tenantId: "tenant-1",
    ownerUserId: "user-1",
    name: "Campaña",
    sessionIds: ["session-a"],
    contacts: [{ phone: "70000001" }],
    message: { text: "Hola" },
    defaultRegion: "BO",
  }), /database unavailable/);

  assert.equal(calls.reserve.length, 1);
  assert.equal(calls.release.length, 1);
  assert.equal((calls.release[0] as { messageCount: number }).messageCount, 1);
});

test("rechaza una campaña sin texto ni multimedia", async () => {
  const repository = new CampaignRepositoryFake();
  const { service } = buildService(repository);

  await assert.rejects(
    () => service.create({
      tenantId: "tenant-1",
      ownerUserId: "user-1",
      name: "Campaña",
      sessionIds: ["session-a"],
      contacts: [{ phone: "70000001" }],
      message: { text: "   " },
      defaultRegion: "BO",
    }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400,
  );
});
