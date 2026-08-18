import assert from "node:assert/strict";
import test from "node:test";
import { permissions, roleHasPermission } from "../src/domain/auth/permissions.js";

test("TENANT_ADMIN tiene permisos administrativos", () => {
  assert.equal(roleHasPermission("TENANT_ADMIN", permissions.SESSION_MANAGE), true);
  assert.equal(roleHasPermission("TENANT_ADMIN", permissions.AUDIT_VIEW), true);
});

test("AGENT no puede crear campañas", () => {
  assert.equal(roleHasPermission("AGENT", permissions.CONVERSATION_TAKEOVER), true);
  assert.equal(roleHasPermission("AGENT", permissions.CAMPAIGN_MANAGE), false);
});
