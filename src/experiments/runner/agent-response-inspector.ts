import type { AgentResponse, AgentTraceEvent } from '../../backend/types';
import type { CandidateQueryExecution, StoredAgentResponse } from '../types';

const ASK_USER_OBSERVATION_TYPE = 'ASK_USER';
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
    public hasSqlAttempt(response: AgentResponse): boolean {
        return response.sqlAttempts.length > 0;
    }

    public requestedClarificationBeforeSql(response: AgentResponse): boolean {
        const events = this.orderedEvents(response);
        const clarificationSequence = events.find((event) =>
            this.isClarificationObservation(event)
        )?.sequenceNumber;

        if (clarificationSequence === undefined) {
            return false;
        }

        const sqlSequence = events.find((event) =>
            this.isSqlInvocation(event)
        )?.sequenceNumber;

        return sqlSequence === undefined || clarificationSequence < sqlSequence;
    }

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
        return [...response.traceEvents].sort(
            (left, right) => left.sequenceNumber - right.sequenceNumber
        );
    }

    private indexSqlAttemptsByTraceId(
        events: AgentTraceEvent[]
    ): Map<string, number> {
        const attemptByTraceId = new Map<string, number>();
        let attempt = 0;

        // Shared trace IDs reliably link invocation and observation events.
        for (const event of events) {
            if (!this.isSqlInvocation(event)) {
                continue;
            }

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
        const usedAttempts = new Set<number>();
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

        // Without a trace ID, prefer recorded success order over observation order.
        return (
            successfulAttempts.find((attempt) => !usedAttempts.has(attempt)) ??
            fallbackAttempt
        );
    }

    private isClarificationObservation(event: AgentTraceEvent): boolean {
        return (
            event.eventType === 'OBSERVATION' &&
            this.isObject(event.observation) &&
            event.observation.type === ASK_USER_OBSERVATION_TYPE
        );
    }

    private isSqlInvocation(event: AgentTraceEvent): boolean {
        return (
            event.eventType === 'INVOCATION' &&
            this.hasNamedParameter(event.actionInput, 'query')
        );
    }

    private hasNamedParameter(value: unknown, name: string): boolean {
        if (!this.isObject(value)) {
            return false;
        }

        const parameters = value.parameters;
        return (
            Array.isArray(parameters) &&
            parameters.some(
                (parameter) =>
                    this.isObject(parameter) &&
                    parameter.name === name &&
                    typeof parameter.value === 'string'
            )
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

        if (!this.isObject(value)) {
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

        if (!this.isObject(value)) {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !SENSITIVE_KEYS.has(key))
                .map(([key, child]) => [key, this.removeSensitiveKeys(child)])
        );
    }

    private isObject(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }
}
