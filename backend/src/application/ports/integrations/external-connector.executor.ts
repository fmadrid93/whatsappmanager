export type ExternalConnectorOutcome = "SUCCESS" | "NOT_FOUND" | "ERROR";

export interface ExternalConnectorFlowMapping {
  sourcePath: string;
  targetVariable: string;
  defaultValue?: string;
}

export interface ExternalConnectorFlowExecution {
  outcome: ExternalConnectorOutcome;
  variables: Record<string, string>;
  httpStatus?: number;
  errorMessage?: string;
}

export interface IExternalConnectorExecutor {
  executeForFlow(input: {
    tenantId: string;
    connectorId: string;
    conversationId: string;
    variables: Record<string, string>;
    mappings: ExternalConnectorFlowMapping[];
    statusVariable: string;
  }): Promise<ExternalConnectorFlowExecution>;
}
