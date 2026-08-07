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

export interface AgentResponse {
    answer: string;
    foundationModel: string | null;
    elapsedTimeSeconds: number;
    tokenUsage: TokenUsage;
    agentMetrics: AgentMetrics;
    sqlAttempts: SqlAttempt[];
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
    experimentName?: string | null;
    experimentCondition?: string | null;
    promptVersion?: string | null;
    agentId?: string | null;
    agentAlias?: string | null;
    region?: string | null;
}
