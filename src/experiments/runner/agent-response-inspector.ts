import type { AgentResponse, AgentTraceEvent } from '../../backend/types';
import { TraceEventInspector } from '../shared/services/trace/trace-event-inspector';
import { isRecord } from '../shared/type-guards';
import type { CandidateQueryExecution, StoredAgentResponse } from '../types';

const SENSITIVE_KEYS = new Set([
    'agentId',
    'agentAlias',
    'agentAliasId',
    'agentVersion',
    'agent_id',
    'agent_alias',
    'agent_alias_id',
    'agent_version'
]);

export class AgentResponseInspector {
    public constructor(
        private readonly traceEventInspector = new TraceEventInspector()
    ) {}

    public hasSqlAttempt(response: AgentResponse): boolean {
        return response.sqlAttempts.length > 0;
    }

    public requestedClarificationBeforeSql(response: AgentResponse): boolean {
        return this.traceEventInspector.requestedClarificationBeforeSql(
            response.traceEvents
        );
    }

    // Pair each successful Athena execution ID with its original SQL attempt number.
    public getCandidateQueryExecutions(
        response: AgentResponse
    ): CandidateQueryExecution[] {
        const events = this.orderedEvents(response);
        const attemptByTraceId = this.indexSqlAttemptsByTraceId(events);
        const successfulAttempts = response.sqlAttempts
            .filter((sqlAttempt) => sqlAttempt.status === 'succeeded')
            .map((sqlAttempt) => sqlAttempt.attempt);

        return this.collectCandidateExecutions(
            events,
            attemptByTraceId,
            successfulAttempts
        );
    }

    public sanitizeForStorage(response: AgentResponse): StoredAgentResponse {
        return this.removeSensitiveKeys(response) as StoredAgentResponse;
    }

    private orderedEvents(response: AgentResponse): AgentTraceEvent[] {
        return this.traceEventInspector.orderEvents(response.traceEvents);
    }

    private indexSqlAttemptsByTraceId(
        events: AgentTraceEvent[]
    ): Map<string, number> {
        // Maps the ID shared by an invocation and observation to the SQL attempt number.
        const attemptByTraceId = new Map<string, number>();
        let attempt = 0;

        // Count failed invocations too, so a later successful retry remains attempt 2, 3, etc.
        for (const event of events) {
            if (!this.traceEventInspector.isSqlInvocation(event)) {
                continue;
            }

            // Repeated trace parts with the same ID still represent one SQL attempt.
            if (event.traceId && attemptByTraceId.has(event.traceId)) {
                continue;
            }

            attempt += 1;
            if (event.traceId) {
                attemptByTraceId.set(event.traceId, attempt);
            }
        }

        return attemptByTraceId;
    }

    private collectCandidateExecutions(
        events: AgentTraceEvent[],
        attemptByTraceId: ReadonlyMap<string, number>,
        successfulAttempts: number[]
    ): CandidateQueryExecution[] {
        // Prevent a trace-less observation from being assigned an attempt already in use.
        const usedAttempts = new Set<number>();
        // The same Athena observation may appear more than once in the trace stream.
        const usedQueryExecutionIds = new Set<string>();
        const executions: CandidateQueryExecution[] = [];

        for (const event of events) {
            if (event.eventType !== 'OBSERVATION') {
                continue;
            }

            // Athena may nest its execution ID inside the action observation payload.
            const queryExecutionId = this.findStringByKey(
                event.observation,
                'queryExecutionId'
            );
            if (
                !queryExecutionId ||
                usedQueryExecutionIds.has(queryExecutionId)
            ) {
                continue;
            }

            const resolvedAttempt = this.resolveAttemptNumber(
                event,
                attemptByTraceId,
                successfulAttempts,
                usedAttempts,
                executions.length + 1
            );

            usedAttempts.add(resolvedAttempt);
            usedQueryExecutionIds.add(queryExecutionId);
            executions.push({
                attempt: resolvedAttempt,
                queryExecutionId
            });
        }

        return executions;
    }

    private resolveAttemptNumber(
        event: AgentTraceEvent,
        attemptByTraceId: ReadonlyMap<string, number>,
        successfulAttempts: number[],
        usedAttempts: ReadonlySet<number>,
        fallbackAttempt: number
    ): number {
        const tracedAttempt = event.traceId
            ? attemptByTraceId.get(event.traceId)
            : undefined;

        if (tracedAttempt !== undefined) {
            return tracedAttempt;
        }

        // If correlation data is incomplete, use the next unassigned recorded success.
        return (
            successfulAttempts.find((attempt) => !usedAttempts.has(attempt)) ??
            fallbackAttempt
        );
    }

    private findStringByKey(value: unknown, targetKey: string): string | null {
        if (Array.isArray(value)) {
            for (const item of value) {
                const result = this.findStringByKey(item, targetKey);
                if (result) return result;
            }
            return null;
        }

        if (!isRecord(value)) {
            return null;
        }

        for (const [key, child] of Object.entries(value)) {
            if (key === targetKey && typeof child === 'string') {
                return child;
            }

            const result = this.findStringByKey(child, targetKey);
            if (result) return result;
        }

        return null;
    }

    private removeSensitiveKeys(value: unknown): unknown {
        if (value instanceof Date) {
            return value.toISOString();
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.removeSensitiveKeys(item));
        }

        if (!isRecord(value)) {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !SENSITIVE_KEYS.has(key))
                .map(([key, child]) => [key, this.removeSensitiveKeys(child)])
        );
    }
}
