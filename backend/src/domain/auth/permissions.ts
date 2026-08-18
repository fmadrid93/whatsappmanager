export const permissions = {
  SESSION_VIEW: "SESSION_VIEW",
  SESSION_MANAGE: "SESSION_MANAGE",
  CAMPAIGN_VIEW: "CAMPAIGN_VIEW",
  CAMPAIGN_MANAGE: "CAMPAIGN_MANAGE",
  FLOW_VIEW: "FLOW_VIEW",
  FLOW_MANAGE: "FLOW_MANAGE",
  CONVERSATION_VIEW: "CONVERSATION_VIEW",
  CONVERSATION_TAKEOVER: "CONVERSATION_TAKEOVER",
  MEDIA_VIEW: "MEDIA_VIEW",
  MEDIA_MANAGE: "MEDIA_MANAGE",
  AUDIT_VIEW: "AUDIT_VIEW",
  SYSTEM_VIEW: "SYSTEM_VIEW",
  INTEGRATION_VIEW: "INTEGRATION_VIEW",
  INTEGRATION_MANAGE: "INTEGRATION_MANAGE",
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

const all = Object.values(permissions);
const rolePermissions: Record<string, readonly Permission[]> = {
  SUPER_ADMIN: all,
  TENANT_ADMIN: all,
  ADMIN: all,
  SUPERVISOR: [
    permissions.SESSION_VIEW,
    permissions.CAMPAIGN_VIEW,
    permissions.CAMPAIGN_MANAGE,
    permissions.FLOW_VIEW,
    permissions.FLOW_MANAGE,
    permissions.CONVERSATION_VIEW,
    permissions.CONVERSATION_TAKEOVER,
    permissions.MEDIA_VIEW,
    permissions.MEDIA_MANAGE,
    permissions.AUDIT_VIEW,
    permissions.INTEGRATION_VIEW,
    permissions.INTEGRATION_MANAGE,
  ],
  AGENT: [permissions.SESSION_VIEW, permissions.CONVERSATION_VIEW, permissions.CONVERSATION_TAKEOVER],
  VIEWER: [
    permissions.SESSION_VIEW,
    permissions.CAMPAIGN_VIEW,
    permissions.FLOW_VIEW,
    permissions.CONVERSATION_VIEW,
    permissions.MEDIA_VIEW,
    permissions.INTEGRATION_VIEW,
  ],
};

export function roleHasPermission(role: string, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
