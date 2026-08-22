import { describe, expect, it } from '@jest/globals';

import { AgentResponseInspector } from '../../runner/agent-response-inspector';
import {
    createAgentResponse,
    createTraceEvent
} from '../fixtures/agent-response';

describe('AgentResponseInspector', () => {
    const inspector = new AgentResponseInspector();

    it('detects a clarification invocation before SQL', () => {
        const response = createAgentResponse({
            traceEvents: [
                createTraceEvent({
                    sequenceNumber: 1,
                    eventType: 'INVOCATION',
                    actionGroup: 'AMAZON.UserInput'
                }),
                createTraceEvent({
                    sequenceNumber: 2,
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [{ name: 'query', value: 'SELECT 1' }]
                    }
                })
            ]
        });

        expect(inspector.requestedClarificationBeforeSql(response)).toBe(true);
    });

    it('does not report clarification when SQL occurred first', () => {
        const response = createAgentResponse({
            traceEvents: [
                createTraceEvent({
                    sequenceNumber: 1,
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [{ name: 'query', value: 'SELECT 1' }]
                    }
                }),
                createTraceEvent({
                    sequenceNumber: 2,
                    eventType: 'INVOCATION',
                    actionGroup: 'AMAZON.UserInput'
                })
            ]
        });

        expect(inspector.requestedClarificationBeforeSql(response)).toBe(false);
    });

    it('correlates successful Athena observations with SQL attempts', () => {
        const response = createAgentResponse({
            sqlAttempts: [
                {
                    attempt: 1,
                    query: 'SELECT 1',
                    status: 'succeeded',
                    error: null
                },
                {
                    attempt: 2,
                    query: 'SELECT 2',
                    status: 'succeeded',
                    error: null
                }
            ],
            traceEvents: [
                createTraceEvent({
                    sequenceNumber: 1,
                    traceId: 'trace-1',
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [{ name: 'query', value: 'SELECT 1' }]
                    }
                }),
                createTraceEvent({
                    sequenceNumber: 2,
                    traceId: 'trace-1',
                    eventType: 'OBSERVATION',
                    observation: { queryExecutionId: 'query-1' }
                }),
                createTraceEvent({
                    sequenceNumber: 3,
                    traceId: 'trace-2',
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [{ name: 'query', value: 'SELECT 2' }]
                    }
                }),
                createTraceEvent({
                    sequenceNumber: 4,
                    traceId: 'trace-2',
                    eventType: 'OBSERVATION',
                    observation: {
                        result: { queryExecutionId: 'query-2' }
                    }
                })
            ]
        });

        expect(inspector.getCandidateQueryExecutions(response)).toEqual([
            { attempt: 1, queryExecutionId: 'query-1' },
            { attempt: 2, queryExecutionId: 'query-2' }
        ]);
    });

    it('keeps the original attempt number after an execution failure', () => {
        const response = createAgentResponse({
            sqlAttempts: [
                {
                    attempt: 1,
                    query: 'SELECT missing',
                    status: 'failed',
                    error: 'COLUMN_NOT_FOUND'
                },
                {
                    attempt: 2,
                    query: 'SELECT name FROM artists',
                    status: 'succeeded',
                    error: null
                }
            ],
            traceEvents: [
                createTraceEvent({
                    sequenceNumber: 1,
                    traceId: 'failed-trace',
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [{ name: 'query', value: 'SELECT missing' }]
                    }
                }),
                createTraceEvent({
                    sequenceNumber: 2,
                    traceId: 'successful-trace',
                    eventType: 'INVOCATION',
                    actionInput: {
                        parameters: [
                            {
                                name: 'query',
                                value: 'SELECT name FROM artists'
                            }
                        ]
                    }
                }),
                createTraceEvent({
                    sequenceNumber: 3,
                    traceId: 'successful-trace',
                    eventType: 'OBSERVATION',
                    observation: { queryExecutionId: 'query-2' }
                })
            ]
        });

        expect(inspector.getCandidateQueryExecutions(response)).toEqual([
            { attempt: 2, queryExecutionId: 'query-2' }
        ]);
    });

    it('removes sensitive deployment identifiers from nested trace data', () => {
        const response = createAgentResponse({
            traceEvents: [
                createTraceEvent({
                    sanitizedEvent: {
                        agentId: 'nested-agent',
                        trace: {
                            agentAliasId: 'nested-alias',
                            agentVersion: 'nested-version'
                        }
                    },
                    rawEvent: {
                        agent_id: 'snake-agent',
                        agent_alias_id: 'snake-alias'
                    }
                })
            ]
        });

        const stored = inspector.sanitizeForStorage(response);
        const serialized = JSON.stringify(stored);

        expect(serialized).not.toContain('agentId');
        expect(serialized).not.toContain('agentAliasId');
        expect(serialized).not.toContain('agentVersion');
        expect(serialized).not.toContain('agent_id');
        expect(serialized).not.toContain('agent_alias_id');
        expect(stored.traceEvents[0]?.eventTime).toBe(
            '2026-08-21T20:00:00.000Z'
        );
    });
});
