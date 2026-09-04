import { describe, expect, it } from '@jest/globals';

import { AthenaErrorNormalizer } from '../../evaluation/athena-error-normalizer';
import { ErrorTransitionEvaluator } from '../../evaluation/error-transition-evaluator';
import type { StoredTraceEvent } from '../../types';
import {
    createStoredRunInteraction,
    createStoredTraceEvent
} from '../fixtures/run-interaction';

describe('ErrorTransitionEvaluator', () => {
    const evaluator = new ErrorTransitionEvaluator(new AthenaErrorNormalizer());

    it('records a changed query that succeeds after an error', () => {
        const interaction = interactionWithEvents([
            sqlObservation(10, 'retry-trace', { queryExecutionId: 'query-2' }),
            sqlInvocation(4, 'first-trace', 'SELECT missing FROM artists'),
            sqlObservation(
                5,
                'first-trace',
                "Athena query failed: COLUMN_NOT_FOUND: line 1:8: Column 'missing' cannot be resolved"
            ),
            sqlInvocation(9, 'retry-trace', 'SELECT name FROM artists')
        ]);

        expect(evaluator.evaluate(interaction)).toEqual([
            {
                interactionOrder: 1,
                observationSequence: 5,
                precedingAttempt: 1,
                rawError:
                    "Athena query failed: COLUMN_NOT_FOUND: line 1:8: Column 'missing' cannot be resolved",
                normalizedError: 'COLUMN_NOT_FOUND:missing',
                nextAttempt: 2,
                retryProduced: true,
                sqlChanged: true,
                nextExecutionStatus: 'succeeded',
                nextNormalizedError: null,
                sameErrorRepeated: false,
                previousErrorResolved: true,
                newErrorIntroduced: false,
                transitionUncertain: false,
                uncertaintyReason: null
            }
        ]);
    });

    it('recognizes a formatting-only retry that repeats the same error', () => {
        const interaction = interactionWithEvents([
            sqlInvocation(1, 'first-trace', 'SELECT missing\nFROM tracks;'),
            sqlObservation(
                2,
                'first-trace',
                "Athena query failed: COLUMN_NOT_FOUND: line 1:8: Column 'missing' cannot be resolved"
            ),
            sqlInvocation(3, 'retry-trace', 'SELECT   missing FROM tracks'),
            sqlObservation(
                4,
                'retry-trace',
                "Athena query failed: COLUMN_NOT_FOUND: line 2:2: Column 'missing' cannot be resolved"
            )
        ]);

        expect(evaluator.evaluate(interaction)[0]).toMatchObject({
            retryProduced: true,
            sqlChanged: false,
            nextExecutionStatus: 'failed',
            nextNormalizedError: 'COLUMN_NOT_FOUND:missing',
            sameErrorRepeated: true,
            previousErrorResolved: false,
            newErrorIntroduced: false,
            transitionUncertain: false
        });
    });

    it('distinguishes a new retry error from repetition of the previous error', () => {
        const interaction = interactionWithEvents([
            sqlInvocation(1, 'first-trace', 'SELECT missing FROM tracks'),
            sqlObservation(
                2,
                'first-trace',
                "Athena query failed: COLUMN_NOT_FOUND: Column 'missing' cannot be resolved"
            ),
            sqlInvocation(3, 'retry-trace', 'SELECT SUM(name) FROM tracks'),
            sqlObservation(
                4,
                'retry-trace',
                'Athena query failed: TYPE_MISMATCH: name is not numeric'
            )
        ]);

        expect(evaluator.evaluate(interaction)[0]).toMatchObject({
            nextNormalizedError: 'TYPE_MISMATCH',
            sameErrorRepeated: false,
            previousErrorResolved: true,
            newErrorIntroduced: true
        });
    });

    it('records an error with no retry without inventing a next outcome', () => {
        const interaction = interactionWithEvents([
            sqlInvocation(1, 'first-trace', 'SELECT missing FROM tracks'),
            sqlObservation(
                2,
                'first-trace',
                "Athena query failed: COLUMN_NOT_FOUND: Column 'missing' cannot be resolved"
            )
        ]);

        expect(evaluator.evaluate(interaction)[0]).toMatchObject({
            retryProduced: false,
            nextAttempt: null,
            sqlChanged: null,
            nextExecutionStatus: null,
            previousErrorResolved: null,
            transitionUncertain: false
        });
    });

    it('is uncertain when a retry has no matching execution observation', () => {
        const interaction = interactionWithEvents([
            sqlInvocation(1, 'first-trace', 'SELECT missing FROM tracks'),
            sqlObservation(
                2,
                'first-trace',
                "Athena query failed: COLUMN_NOT_FOUND: Column 'missing' cannot be resolved"
            ),
            sqlInvocation(3, 'retry-trace', 'SELECT name FROM tracks')
        ]);

        expect(evaluator.evaluate(interaction)[0]).toMatchObject({
            retryProduced: true,
            nextExecutionStatus: 'pending',
            transitionUncertain: true,
            uncertaintyReason:
                'The retry has no matching execution observation.'
        });
    });

    it('does not create transitions for successful observations', () => {
        const interaction = interactionWithEvents([
            sqlInvocation(1, 'trace-1', 'SELECT name FROM tracks'),
            sqlObservation(2, 'trace-1', { queryExecutionId: 'query-1' })
        ]);

        expect(evaluator.evaluate(interaction)).toEqual([]);
    });
});

function interactionWithEvents(traceEvents: StoredTraceEvent[]) {
    const interaction = createStoredRunInteraction();
    return createStoredRunInteraction({
        response: {
            ...interaction.response,
            traceEvents
        }
    });
}

function sqlInvocation(
    sequenceNumber: number,
    traceId: string,
    query: string
): StoredTraceEvent {
    return createStoredTraceEvent({
        sequenceNumber,
        traceId,
        eventType: 'INVOCATION',
        actionName: 'executeAthenaQuery',
        actionInput: {
            parameters: [{ name: 'query', value: query }]
        }
    });
}

function sqlObservation(
    sequenceNumber: number,
    traceId: string,
    observation: unknown
): StoredTraceEvent {
    return createStoredTraceEvent({
        sequenceNumber,
        traceId,
        eventType: 'OBSERVATION',
        observation
    });
}
