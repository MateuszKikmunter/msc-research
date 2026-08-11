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

export type AgentTraceStage =
    | 'PRE_PROCESSING'
    | 'ORCHESTRATION'
    | 'POST_PROCESSING'
    | 'ROUTING_CLASSIFIER'
    | 'GUARDRAIL'
    | 'FAILURE'
    | 'CUSTOM_ORCHESTRATION'
    | 'UNKNOWN';

export type AgentTraceEventType =
    | 'MODEL_INPUT'
    | 'MODEL_OUTPUT'
    | 'RATIONALE'
    | 'INVOCATION'
    | 'OBSERVATION'
    | 'GUARDRAIL'
    | 'FAILURE'
    | 'UNKNOWN';

export interface AgentTraceEvent {
    sequenceNumber: number;
    traceId: string | null;
    eventTime: Date | null;
    stage: AgentTraceStage;
    eventType: AgentTraceEventType;
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

export const HttpCode = {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500
} as const;

export interface SaveInteractionInput {
    sessionId: string;
    question: string;
    answer: string;
    startedAt: Date;
    elapsedMs: number;
    status: 'succeeded' | 'failed';
    error?: string | null;
    foundationModel?: string | null;
    tokenUsage?: TokenUsage;
    agentMetrics?: AgentMetrics;
    sqlAttempts?: SqlAttempt[];
    traceEvents?: AgentTraceEvent[];
    experimentName?: string | null;
    experimentCondition?: string | null;
    promptVersion?: string | null;
    agentId?: string | null;
    agentAlias?: string | null;
    region?: string | null;
}
