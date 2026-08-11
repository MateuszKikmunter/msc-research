export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentMetrics {
  totalSteps: number;
  modelInvocations: number;
  actionInvocations: number;
  retryCount: number;
  firstAttemptSucceeded: boolean | null;
}

export interface SqlAttempt {
  attempt: number;
  query: string;
  status: 'pending' | 'succeeded' | 'failed';
  error: string | null;
}

export interface AgentTraceEvent {
  sequenceNumber: number;
  traceId: string | null;
  eventTime: string | null;
  stage: string;
  eventType: string;
  agentId: string | null;
  agentAliasId: string | null;
  agentVersion: string | null;
  foundationModel: string | null;
  rationale: string | null;
  actionGroup: string | null;
  actionName: string | null;
  actionInput: unknown | null;
  observation: unknown | null;
  inputTokens: number | null;
  outputTokens: number | null;
  modelLatencyMs: number | null;
  actionLatencyMs: number | null;
  sanitizedEvent: unknown;
  rawEvent: unknown | null;
}

export interface AgentResponse {
  answer: string;
  foundationModel: string | null;
  elapsedTimeSeconds: number;
  tokenUsage: TokenUsage;
  agentMetrics: AgentMetrics;
  sqlAttempts: SqlAttempt[];
  traceEvents: AgentTraceEvent[];
}
