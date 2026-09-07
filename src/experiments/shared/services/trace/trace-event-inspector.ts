import type { AgentTraceEvent } from '../../../../backend/types';
import type { StoredTraceEvent } from '../../../types';
import { isRecord } from '../../type-guards';

export class TraceEventInspector {
    public isSqlInvocation(event: AgentTraceEvent | StoredTraceEvent): boolean {
        return this.getSqlQuery(event) !== null;
    }

    public getSqlQuery(
        event: AgentTraceEvent | StoredTraceEvent
    ): string | null {
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
