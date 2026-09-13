import type { AgentResponse } from '../../backend/types';
import { TraceEventInspector } from '../shared/trace-event-inspector';
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
        const events = this.traceEventInspector.orderEvents(
            response.traceEvents
        );
        const invocations = this.traceEventInspector.getSqlInvocations(events);
        const executions: CandidateQueryExecution[] = [];
        const usedQueryExecutionIds = new Set<string>();

        for (const invocation of invocations) {
            const attempt = response.sqlAttempts.find(
                (attempt) => attempt.attempt === invocation.attempt
            );
            // Require agreement with the recorded attempt before saving its result.
            if (
                attempt?.status !== 'succeeded' ||
                attempt.query.trim() !== invocation.query
            ) {
                continue;
            }
            const observation = this.traceEventInspector.findSqlObservation(
                events,
                invocation.event
            );
            const queryExecutionId = this.findStringByKey(
                observation?.observation,
                'queryExecutionId'
            );
            if (
                !queryExecutionId ||
                usedQueryExecutionIds.has(queryExecutionId)
            ) {
                continue;
            }
            usedQueryExecutionIds.add(queryExecutionId);
            executions.push({ attempt: invocation.attempt, queryExecutionId });
        }

        return executions;
    }

    public sanitizeForStorage(response: AgentResponse): StoredAgentResponse {
        return this.removeSensitiveKeys(response) as StoredAgentResponse;
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
