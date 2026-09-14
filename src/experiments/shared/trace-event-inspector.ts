import type { AgentTraceEvent } from '../../backend/types';
import type { StoredTraceEvent } from '../types';
import { isRecord } from './type-guards';

type TraceEvent = AgentTraceEvent | StoredTraceEvent;

const ASK_USER_OBSERVATION_TYPE = 'ASK_USER';

export function orderEvents<Event extends TraceEvent>(
    events: readonly Event[]
): Event[] {
    return [...events].sort(
        (left, right) => left.sequenceNumber - right.sequenceNumber
    );
}

// Callers order the trace once before extracting invocations and matching observations.
export function getSqlInvocations<Event extends TraceEvent>(
    orderedEvents: readonly Event[]
) {
    const invocations: Array<{
        attempt: number;
        event: Event;
        query: string;
    }> = [];
    const seenTraceIds = new Set<string>();

    for (const event of orderedEvents) {
        const query = getSqlQuery(event)?.trim();
        if (!query || (event.traceId && seenTraceIds.has(event.traceId))) {
            continue;
        }
        // Match the backend's numbering: repeated trace parts are one attempt.
        invocations.push({ attempt: invocations.length + 1, event, query });
        if (event.traceId) seenTraceIds.add(event.traceId);
    }
    return invocations;
}

export function findSqlObservation<Event extends TraceEvent>(
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

export function isSqlInvocation(event: TraceEvent): boolean {
    return getSqlQuery(event) !== null;
}

export function isClarificationObservation(event: TraceEvent): boolean {
    return (
        event.eventType === 'OBSERVATION' &&
        isRecord(event.observation) &&
        event.observation.type === ASK_USER_OBSERVATION_TYPE
    );
}

export function requestedClarificationBeforeSql(
    events: readonly TraceEvent[]
): boolean {
    const orderedEvents = orderEvents(events);
    const clarificationSequence = orderedEvents.find((event) =>
        isClarificationObservation(event)
    )?.sequenceNumber;

    if (clarificationSequence === undefined) {
        return false;
    }

    const sqlSequence = orderedEvents.find((event) =>
        isSqlInvocation(event)
    )?.sequenceNumber;

    return sqlSequence === undefined || clarificationSequence < sqlSequence;
}

export function getSqlQuery(event: TraceEvent): string | null {
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
