import type { StoredRunInteraction, StoredTraceEvent } from '../../types';

export function createStoredTraceEvent(
    overrides: Partial<StoredTraceEvent> = {}
): StoredTraceEvent {
    return {
        sequenceNumber: 1,
        traceId: 'trace-1',
        eventTime: '2026-08-21T20:00:00.000Z',
        stage: 'ORCHESTRATION',
        eventType: 'UNKNOWN',
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

export function createStoredRunInteraction(
    overrides: Partial<StoredRunInteraction> = {}
): StoredRunInteraction {
    return {
        modelCondition: 'nova-lite',
        repetition: 1,
        questionId: 'CB200-E001',
        difficulty: 'easy',
        category: 'single_table_count',
        turnNumber: null,
        interactionOrder: 1,
        inputType: 'question',
        input: 'How many artists are in the catalogue?',
        sessionId: 'session-1',
        fallbackUsed: false,
        scriptedReplyUsed: false,
        response: {
            answer: 'There are 275 artists.',
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
            traceEvents: []
        },
        candidateResults: [],
        ...overrides
    };
}
