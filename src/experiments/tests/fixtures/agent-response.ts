import type { AgentResponse, AgentTraceEvent } from '../../../backend/types';

export function createAgentResponse(
    overrides: Partial<AgentResponse> = {}
): AgentResponse {
    return {
        answer: 'Answer',
        foundationModel: 'test-model',
        elapsedTimeSeconds: 1,
        tokenUsage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15
        },
        agentMetrics: {
            totalSteps: 1,
            modelInvocations: 1,
            actionInvocations: 0,
            retryCount: 0,
            firstAttemptSucceeded: null
        },
        sqlAttempts: [],
        traceEvents: [],
        ...overrides
    };
}

export function createTraceEvent(
    overrides: Partial<AgentTraceEvent> = {}
): AgentTraceEvent {
    return {
        sequenceNumber: 1,
        traceId: null,
        eventTime: new Date('2026-08-21T20:00:00.000Z'),
        stage: 'ORCHESTRATION',
        eventType: 'UNKNOWN',
        agentId: 'sensitive-agent-id',
        agentAliasId: 'sensitive-alias-id',
        agentVersion: '5',
        foundationModel: 'test-model',
        rationale: null,
        actionGroup: null,
        actionName: null,
        actionInput: null,
        observation: null,
        inputTokens: null,
        outputTokens: null,
        modelLatencyMs: null,
        actionLatencyMs: null,
        sanitizedEvent: {},
        rawEvent: null,
        ...overrides
    };
}
