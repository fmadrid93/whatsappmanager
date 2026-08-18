import assert from "node:assert/strict";
import test from "node:test";
import { FailoverService } from "../../src/application/services/failover.service.js";

test("transfiere automáticamente los pendientes solo ante una falla técnica", async () => {
  let autoFailoverCalled = false;
  let quarantineCalled = false;

  const service = new FailoverService(
    {
      quarantine: async () => { quarantineCalled = true; },
    } as never,
    {
      autoFailoverTechnical: async (input) => {
        autoFailoverCalled = true;
        assert.equal(input.sessionId, "session-a");
        assert.equal(input.maxTargets, 3);
        return {
          sourceSessionId: input.sessionId,
          totalMoved: 20,
          campaigns: [{
            campaignId: "campaign-1",
            movedMessages: 20,
            targetSessionIds: ["session-b", "session-c"],
            pausedBecauseNoReplacement: false,
          }],
        };
      },
    } as never,
    true,
    30,
    3,
    1440,
  );

  const result = await service.handleTechnicalFailure("session-a", "ETIMEDOUT", "Timeout de red");
  assert.equal(result.totalMoved, 20);
  assert.equal(autoFailoverCalled, true);
  assert.equal(quarantineCalled, false);
});

test("pone en cuarentena y no transfiere ante un bloqueo o cierre grave", async () => {
  let quarantined = false;
  let autoFailoverCalled = false;
  let held = false;

  const service = new FailoverService(
    {
      quarantine: async (sessionId, reason, code) => {
        quarantined = true;
        assert.equal(sessionId, "session-a");
        assert.match(reason, /SESSION_RATE_LIMITED/);
        assert.equal(code, 429);
      },
    } as never,
    {
      autoFailoverTechnical: async () => {
        autoFailoverCalled = true;
        throw new Error("No debe ejecutarse");
      },
      quarantineSessionQueue: async () => {
        held = true;
        return {
          sourceSessionId: "session-a",
          campaignIds: ["campaign-1"],
          pausedCampaignIds: [],
          heldMessages: 12,
        };
      },
    } as never,
    true,
    30,
    3,
    1440,
  );

  const result = await service.handleFatalFailure(
    "session-a",
    "SESSION_RATE_LIMITED",
    "Too many requests",
    429,
  );

  assert.equal(result.heldMessages, 12);
  assert.equal(quarantined, true);
  assert.equal(held, true);
  assert.equal(autoFailoverCalled, false);
});
