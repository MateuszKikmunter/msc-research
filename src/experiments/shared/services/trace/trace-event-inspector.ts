import type { AgentTraceEvent } from '../../../../backend/types';
import type { StoredTraceEvent } from '../../../types';
import { isRecord } from '../../type-guards';

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
