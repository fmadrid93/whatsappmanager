export type BotFlowTriggerType = "ANY" | "CONTAINS" | "EXACT";

export interface BotFlowTrigger {
  type: BotFlowTriggerType;
  value?: string;
}

export type BotFlowConditionOperator = "EQUALS" | "CONTAINS" | "EXISTS";

export interface BotFlowApiMapping {
  sourcePath: string;
  targetVariable: string;
  defaultValue?: string;
}

export interface BotFlowMenuOption {
  value: string;
  label: string;
  nextStepId: string;
}

export type BotFlowStep =
  | { id: string; type: "MESSAGE"; text: string }
  | { id: string; type: "QUESTION"; text: string; variable: string }
  | {
      id: string;
      type: "MENU";
      text: string;
      variable: string;
      options: BotFlowMenuOption[];
      invalidText?: string;
    }
  | {
      id: string;
      type: "CONDITION";
      variable: string;
      operator: BotFlowConditionOperator;
      value?: string;
      ifTrueText: string;
      ifFalseText?: string;
    }
  | {
      id: string;
      type: "API_REQUEST";
      connectorId: string;
      statusVariable: string;
      mappings: BotFlowApiMapping[];
      successText?: string;
      notFoundText?: string;
      errorText?: string;
    }
  | { id: string; type: "END"; text?: string };

export interface BotFlowDefinition {
  version: 2;
  trigger: BotFlowTrigger;
  steps: BotFlowStep[];
  /** Compatibilidad de lectura con flujos creados en v1.2.x. */
  replyText?: string;
}

export interface LegacyBotFlowDefinition {
  replyText: string;
}

export interface BotFlowRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version: number;
  isActive: boolean;
  definition: BotFlowDefinition;
  sessionIds: string[];
  createdAt: Date;
}

export interface IBotFlowRepository {
  create(input: {
    tenantId: string;
    ownerUserId: string;
    name: string;
    description?: string;
    definition: BotFlowDefinition;
    sessionIds: string[];
  }): Promise<BotFlowRecord>;
  listByTenant(tenantId: string): Promise<BotFlowRecord[]>;
  setActive(id: string, tenantId: string, active: boolean): Promise<void>;
  findActiveForSession(sessionId: string, inboundText?: string): Promise<BotFlowRecord | null>;
  findByIdForSession(id: string, sessionId: string): Promise<BotFlowRecord | null>;
}
