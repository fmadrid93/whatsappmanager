import assert from "node:assert/strict";
import test from "node:test";
import { CampaignService } from "../../src/application/services/campaign.service.js";
import { PhoneNormalizerService } from "../../src/application/services/phone-normalizer.service.js";

test("una campaña omite inválidos y duplicados sin cancelar los válidos", async () => {
  let createdInput: any;
  let reserved = 0;

  const service = new CampaignService(
    {
      createWithQueue: async (input: any) => {
        createdInput = input;
        return {
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          status: "DRAFT",
          messagePayload: Buffer.from("{}"),
          totalMessages: input.contacts.length,
          sentMessages: 0,
          failedMessages: 0,
          createdAt: new Date(),
        };
      },
    } as never,
    new PhoneNormalizerService(),
    {
      reserveCampaign: async (input: any) => { reserved = input.messageCount; },
      releaseCampaignReservation: async () => undefined,
    } as never,
  );

  const created = await service.create({
    tenantId: "tenant-1",
    ownerUserId: "user-1",
    name: "Masivo recinto",
    sessionIds: ["session-1"],
    contacts: [
      { name: "A", phone: "0986125168", variables: { recinto: "Uno" } },
      { name: "Duplicado", phone: "+595986125168", variables: { recinto: "Dos" } },
      { name: "Malo", phone: "123" },
      { name: "B", phone: "0971123456", variables: { recinto: "Tres" } },
    ],
    message: { text: "Hola {{nombre}}, {{recinto}}" },
    defaultRegion: "PY",
  });

  assert.equal(created.totalMessages, 2);
  assert.equal(reserved, 2);
  assert.equal(createdInput.contacts.length, 2);
  assert.equal(createdInput.contacts[0].e164, "+595986125168");
  assert.equal(createdInput.contacts[0].variables.recinto, "Uno");
});

test("validación reporta válidos, inválidos y duplicados", () => {
  const service = new CampaignService({} as never, new PhoneNormalizerService(), {} as never);

  const result = service.validateContacts({
    defaultRegion: "PY",
    contacts: [
      { phone: "0986125168" },
      { phone: "+595986125168" },
      { phone: "123" },
      { phone: "0971123456" },
    ],
  });

  assert.equal(result.received, 4);
  assert.equal(result.sendable, 2);
  assert.equal(result.invalid, 1);
  assert.equal(result.duplicates, 1);
});


test("mantiene compatibilidad con normalizadores anteriores que solo exponen normalize", async () => {
  let createdCount = 0;

  const legacyNormalizer = {
    normalize: (raw: string) => {
      const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
      const e164 = digits.startsWith("591") ? `+${digits}` : `+591${digits}`;
      return { original: raw, e164, digits: e164.slice(1), regionCode: "BO" };
    },
  };

  const service = new CampaignService(
    {
      createWithQueue: async (input: any) => {
        createdCount = input.contacts.length;
        return {
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          status: "DRAFT",
          messagePayload: Buffer.from("{}"),
          totalMessages: input.contacts.length,
          sentMessages: 0,
          failedMessages: 0,
          createdAt: new Date(),
        };
      },
    } as never,
    legacyNormalizer as never,
    {
      reserveCampaign: async () => undefined,
      releaseCampaignReservation: async () => undefined,
    } as never,
  );

  await service.create({
    tenantId: "tenant-1",
    ownerUserId: "user-1",
    name: "Compatibilidad",
    sessionIds: ["session-1"],
    contacts: [
      { phone: "70000001" },
      { phone: "+59170000001" },
      { phone: "70000002" },
    ],
    message: { text: "Hola" },
    defaultRegion: "BO",
  });

  assert.equal(createdCount, 2);
});
