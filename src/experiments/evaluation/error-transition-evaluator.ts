import type {
    ErrorTransition,
    StoredRunInteraction,
    StoredTraceEvent
} from '../types';
import { AthenaErrorNormalizer } from './athena-error-normalizer';

interface SqlInvocation {
    attempt: number;
    event: StoredTraceEvent;
    query: string;
}

interface CreateTransitionOptions {
    interaction: StoredRunInteraction;
    events: StoredTraceEvent[];
    invocation: SqlInvocation;
    observation: StoredTraceEvent;
    error: string;
    nextInvocation: SqlInvocation | undefined;
}

export class ErrorTransitionEvaluator {
    public constructor(
        private readonly errorNormalizer: AthenaErrorNormalizer
    ) {}

    public evaluate(interaction: StoredRunInteraction): ErrorTransition[] {
        const events = [...interaction.response.traceEvents].sort(
            (left, right) => left.sequenceNumber - right.sequenceNumber
        );
        const invocations = this.getSqlInvocations(events);
        const transitions: ErrorTransition[] = [];

        for (const [index, invocation] of invocations.entries()) {
            // Bedrock gives the invocation and its Athena observation the same trace ID.
            const observation = this.findObservation(events, invocation.event);
            const error = observation
                ? this.getObservationError(observation)
                : null;

            if (observation && error) {
                transitions.push(
                    this.createTransition({
                        interaction,
                        events,
                        invocation,
                        observation,
                        error,
                        nextInvocation: invocations[index + 1]
                    })
                );
            }
        }

        return transitions;
    }

    private getSqlInvocations(events: StoredTraceEvent[]): SqlInvocation[] {
        const invocations: SqlInvocation[] = [];

        for (const event of events) {
            const query = this.getSqlQuery(event);
            if (query) {
                invocations.push({
                    attempt: invocations.length + 1,
                    event,
                    query
                });
            }
        }

        return invocations;
    }

    private createTransition(
        options: CreateTransitionOptions
    ): ErrorTransition {
        const normalizedError = this.errorNormalizer.normalize(options.error);
        const baseTransition = {
            interactionOrder: options.interaction.interactionOrder,
            observationSequence: options.observation.sequenceNumber,
            precedingAttempt: options.invocation.attempt,
            rawError: options.error,
            normalizedError
        };

        if (!options.nextInvocation) {
            return {
                ...baseTransition,
                nextAttempt: null,
                retryProduced: false,
                sqlChanged: null,
                nextExecutionStatus: null,
                nextNormalizedError: null,
                sameErrorRepeated: null,
                previousErrorResolved: null,
                newErrorIntroduced: null,
                transitionUncertain: false,
                uncertaintyReason: null
            };
        }

        const sqlChanged =
            this.normalizeSql(options.invocation.query) !==
            this.normalizeSql(options.nextInvocation.query);
        const nextObservation = this.findObservation(
            options.events,
            options.nextInvocation.event
        );
        if (!nextObservation) {
            return {
                ...baseTransition,
                nextAttempt: options.nextInvocation.attempt,
                retryProduced: true,
                sqlChanged,
                nextExecutionStatus: 'pending',
                nextNormalizedError: null,
                sameErrorRepeated: null,
                previousErrorResolved: null,
                newErrorIntroduced: null,
                transitionUncertain: true,
                uncertaintyReason:
                    'The retry has no matching execution observation.'
            };
        }

        const nextError = this.getObservationError(nextObservation);
        const nextNormalizedError = nextError
            ? this.errorNormalizer.normalize(nextError)
            : null;
        const sameErrorRepeated = nextNormalizedError === normalizedError;

        return {
            ...baseTransition,
            nextAttempt: options.nextInvocation.attempt,
            retryProduced: true,
            sqlChanged,
            nextExecutionStatus: nextError ? 'failed' : 'succeeded',
            nextNormalizedError,
            sameErrorRepeated,
            // A different error resolves the previous one but is also recorded as a new failure.
            previousErrorResolved: !sameErrorRepeated,
            newErrorIntroduced:
                nextNormalizedError !== null && !sameErrorRepeated,
            transitionUncertain: false,
            uncertaintyReason: null
        };
    }

    private findObservation(
        events: StoredTraceEvent[],
        invocation: StoredTraceEvent
    ): StoredTraceEvent | undefined {
        if (!invocation.traceId) {
            return undefined;
        }

        return events.find(
            (event) =>
                event.eventType === 'OBSERVATION' &&
                event.traceId === invocation.traceId &&
                event.sequenceNumber > invocation.sequenceNumber
        );
    }

    private getSqlQuery(event: StoredTraceEvent): string | null {
        if (
            event.eventType !== 'INVOCATION' ||
            !this.isObject(event.actionInput)
        ) {
            return null;
        }

        const parameters = event.actionInput.parameters;
        if (!Array.isArray(parameters)) {
            return null;
        }

        for (const parameter of parameters) {
            if (
                this.isObject(parameter) &&
                parameter.name === 'query' &&
                typeof parameter.value === 'string'
            ) {
                return parameter.value;
            }
        }

        return null;
    }

    private getObservationError(event: StoredTraceEvent): string | null {
        if (typeof event.observation === 'string') {
            return event.observation;
        }

        return this.isObject(event.observation) &&
            typeof event.observation.error === 'string'
            ? event.observation.error
            : null;
    }

    private normalizeSql(query: string): string {
        // Formatting alone is not a query revision, so whitespace and a final semicolon are ignored.
        const normalizedQuery = query.trim().split(/\s+/).join(' ');
        return normalizedQuery.endsWith(';')
            ? normalizedQuery.slice(0, -1).trimEnd()
            : normalizedQuery;
    }

    private isObject(value: unknown): value is Record<string, unknown> {
        return (
            Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        );
    }
}
