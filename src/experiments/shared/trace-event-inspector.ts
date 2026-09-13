import type { AgentTraceEvent } from '../../backend/types';
import type { StoredTraceEvent } from '../types';
import { isRecord } from './type-guards';

type TraceEvent = AgentTraceEvent | StoredTraceEvent;

const ASK_USER_OBSERVATION_TYPE = 'ASK_USER';

export class TraceEventInspector {
    public orderEvents<Event extends TraceEvent>(
        events: readonly Event[]
    ): Event[] {
        return [...events].sort(
            (left, right) => left.sequenceNumber - right.sequenceNumber
        );
    }

    public getSqlInvocations<Event extends TraceEvent>(
        events: readonly Event[]
    ) {
        const invocations: Array<{
            attempt: number;
            event: Event;
            query: string;
        }> = [];
        const seenTraceIds = new Set<string>();

        for (const event of this.orderEvents(events)) {
            const query = this.getSqlQuery(event)?.trim();
            if (!query || (event.traceId && seenTraceIds.has(event.traceId))) {
                continue;
            }
            // Match the backend's numbering: repeated trace parts are one attempt.
            invocations.push({ attempt: invocations.length + 1, event, query });
            if (event.traceId) seenTraceIds.add(event.traceId);
        }
        return invocations;
    }

    public findSqlObservation<Event extends TraceEvent>(
        orderedEvents: readonly Event[],
        invocation: Event
    ): Event | undefined {
        // Arrival order alone cannot identify which SQL produced an observation.
        if (!invocation.traceId) return undefined;
        return orderedEvents.find(
            (event) =>
                event.eventType === 'OBSERVATION' &&
                event.traceId === invocation.traceId &&
                event.sequenceNumber > invocation.sequenceNumber
        );
    }

    public isSqlInvocation(event: TraceEvent): boolean {
        return this.getSqlQuery(event) !== null;
    }

    public isClarificationObservation(event: TraceEvent): boolean {
        return (
            event.eventType === 'OBSERVATION' &&
            isRecord(event.observation) &&
            event.observation.type === ASK_USER_OBSERVATION_TYPE
        );
    }

    public requestedClarificationBeforeSql(
        events: readonly TraceEvent[]
    ): boolean {
        const orderedEvents = this.orderEvents(events);
        const clarificationSequence = orderedEvents.find((event) =>
            this.isClarificationObservation(event)
        )?.sequenceNumber;

        if (clarificationSequence === undefined) {
            return false;
        }

        const sqlSequence = orderedEvents.find((event) =>
            this.isSqlInvocation(event)
        )?.sequenceNumber;

        return sqlSequence === undefined || clarificationSequence < sqlSequence;
    }

    public getSqlQuery(event: TraceEvent): string | null {
        if (event.eventType !== 'INVOCATION' || !isRecord(event.actionInput)) {
            return null;
        }

        const parameters = event.actionInput.parameters;
        if (!Array.isArray(parameters)) {
            return null;
        }

        for (const parameter of parameters) {
            if (
                isRecord(parameter) &&
                parameter.name === 'query' &&
                typeof parameter.value === 'string'
            ) {
                return parameter.value;
            }
        }

        return null;
    }
}
