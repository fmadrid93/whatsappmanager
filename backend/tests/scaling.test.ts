import assert from "node:assert/strict";
import test from "node:test";
import { belongsToShard, rendezvousOwner, stableShardKey } from "../src/domain/scaling/shard.js";
import { LocalEventTransport } from "../src/infrastructure/events/local-event-transport.js";
import type { ICoordinationBus } from "../src/application/ports/coordination/coordination-bus.js";

class RecordingBus implements ICoordinationBus {
  readonly messages: Array<{ channel: string; payload: string }> = [];
  async publish(channel: string, payload: string): Promise<void> {
    this.messages.push({ channel, payload });
  }
  async close(): Promise<void> {}
}

test("stableShardKey siempre produce el mismo entero positivo", () => {
  const first = stableShardKey("session-123");
  const second = stableShardKey("session-123");
  assert.equal(first, second);
  assert.ok(first >= 0);
});

test("STATIC asigna exactamente un shard", () => {
  const key = stableShardKey("session-abc");
  const owners = [0, 1, 2, 3].filter((shard) => belongsToShard(key, shard, 4));
  assert.deepEqual(owners.length, 1);
});

test("rendezvous hashing es determinista y minimiza movimiento", () => {
  const sessions = Array.from({ length: 200 }, (_, index) => `session-${index}`);
  const before = new Map(sessions.map((id) => [id, rendezvousOwner(id, ["w1", "w2"])]));
  const after = new Map(sessions.map((id) => [id, rendezvousOwner(id, ["w1", "w2", "w3"])]));
  const unchanged = sessions.filter((id) => before.get(id) === after.get(id)).length;
  assert.ok(unchanged > 100, `Solo ${unchanged} sesiones conservaron propietario`);
});

test("LocalEventTransport publica el envelope del Outbox", async () => {
  const bus = new RecordingBus();
  const transport = new LocalEventTransport(bus);
  await transport.publish([{
    id: "event-1",
    tenantId: "tenant-1",
    aggregateType: "Campaign",
    aggregateId: "campaign-1",
    eventType: "CAMPAIGN_CREATED",
    payload: Buffer.from('{"ok":true}'),
    createdAt: new Date("2026-07-24T12:00:00Z"),
  }]);
  assert.equal(bus.messages.length, 1);
  assert.equal(bus.messages[0]?.channel, "events:CAMPAIGN_CREATED");
  assert.match(bus.messages[0]?.payload ?? "", /campaign-1/);
});
