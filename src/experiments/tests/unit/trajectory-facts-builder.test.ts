import { describe, expect, it } from '@jest/globals';

import { TrajectoryClassifier } from '../../evaluation/trajectory-classifier';
import { TrajectoryFactsBuilder } from '../../evaluation/trajectory-facts-builder';
import type { AttemptEvaluation, ErrorTransition } from '../../types';

describe('TrajectoryFactsBuilder', () => {
    const factsBuilder = new TrajectoryFactsBuilder();
    const classifier = new TrajectoryClassifier();

    it('builds and classifies a direct success', () => {
        const facts = factsBuilder.build({
            attempts: [createAttempt('correct')],
            errorTransitions: []
        });

        expect(facts).toEqual({
            firstAttemptOutcome: 'correct',
            terminalOutcome: 'correct',
            firstAttemptExecutedSuccessfully: true,
            firstAttemptResultCorrect: true,
            terminalAttemptExecutedSuccessfully: true,
            terminalResultCorrect: true,
            executionErrorObserved: false,
            retryAttempted: false,
            retryPolicyExceeded: false,
            recovered: false,
            redundantActionObserved: false,
            regressedAfterCorrectAttempt: false,
            traceComplete: true,
            evaluationComplete: true,
            sqlAttemptCount: 1,
            athenaErrorCount: 0
        });
        expect(classifier.classify(facts)).toBe('DIRECT_SUCCESS');
    });

    it('recognizes recovery from an execution error', () => {
        const facts = factsBuilder.build({
            attempts: [
                createAttempt('execution_error'),
                createAttempt('correct', { attempt: 2 })
            ],
            errorTransitions: [createErrorTransition()]
        });

        expect(facts).toMatchObject({
            firstAttemptOutcome: 'execution_error',
            terminalOutcome: 'correct',
            executionErrorObserved: true,
            retryAttempted: true,
            recovered: true,
            traceComplete: true
        });
        expect(classifier.classify(facts)).toBe('EXECUTION_ERROR_RECOVERED');
    });

    it('recognizes a successful semantic revision', () => {
        const facts = factsBuilder.build({
            attempts: [
                createAttempt('semantic_error'),
                createAttempt('correct', { attempt: 2 })
            ],
            errorTransitions: []
        });

        expect(facts.recovered).toBe(true);
        expect(classifier.classify(facts)).toBe('SEMANTIC_REVISION_SUCCESS');
    });

    it('records regression and a redundant action after a correct result', () => {
        const facts = factsBuilder.build({
            attempts: [
                createAttempt('correct'),
                createAttempt('semantic_error', { attempt: 2 })
            ],
            errorTransitions: []
        });

        expect(facts).toMatchObject({
            terminalOutcome: 'semantic_error',
            redundantActionObserved: true,
            regressedAfterCorrectAttempt: true
        });
        expect(classifier.classify(facts)).toBe('EXECUTED_SEMANTIC_FAILURE');
    });

    it('classifies a terminal execution error as unrecovered', () => {
        const facts = factsBuilder.build({
            attempts: [createAttempt('execution_error')],
            errorTransitions: [
                createErrorTransition({
                    retryProduced: false,
                    sqlChanged: null,
                    nextAttempt: null,
                    nextExecutionStatus: null,
                    sameErrorRepeated: null,
                    previousErrorResolved: null,
                    newErrorIntroduced: null
                })
            ]
        });

        expect(classifier.classify(facts)).toBe(
            'UNRECOVERED_EXECUTION_FAILURE'
        );
    });

    it('classifies an evaluation unit without SQL as no SQL', () => {
        const facts = factsBuilder.build({
            attempts: [],
            errorTransitions: []
        });

        expect(facts).toMatchObject({
            firstAttemptOutcome: 'no_sql',
            terminalOutcome: 'no_sql',
            sqlAttemptCount: 0,
            traceComplete: true,
            evaluationComplete: true
        });
        expect(classifier.classify(facts)).toBe('NO_SQL');
    });

    it('fails closed when result evaluation is uncertain', () => {
        const facts = factsBuilder.build({
            attempts: [createAttempt('evaluator_uncertain')],
            errorTransitions: []
        });

        expect(facts).toMatchObject({
            firstAttemptOutcome: 'system_error',
            terminalOutcome: 'system_error',
            evaluationComplete: false
        });
        expect(classifier.classify(facts)).toBe('SYSTEM_ERROR');
    });

    it('fails closed when an execution error has no trace transition', () => {
        const facts = factsBuilder.build({
            attempts: [createAttempt('execution_error')],
            errorTransitions: []
        });

        expect(facts.traceComplete).toBe(false);
        expect(classifier.classify(facts)).toBe('SYSTEM_ERROR');
    });

    it('marks an unchanged retry as a redundant SQL action', () => {
        const facts = factsBuilder.build({
            attempts: [
                createAttempt('execution_error'),
                createAttempt('execution_error', { attempt: 2 })
            ],
            errorTransitions: [
                createErrorTransition({ sqlChanged: false }),
                createErrorTransition({
                    observationSequence: 4,
                    precedingAttempt: 2,
                    retryProduced: false,
                    sqlChanged: null,
                    nextAttempt: null,
                    nextExecutionStatus: null,
                    sameErrorRepeated: null,
                    previousErrorResolved: null,
                    newErrorIntroduced: null
                })
            ]
        });

        expect(facts.redundantActionObserved).toBe(true);
    });

    it('records more than one retry without automatically calling it redundant', () => {
        const facts = factsBuilder.build({
            attempts: [
                createAttempt('semantic_error'),
                createAttempt('semantic_error', { attempt: 2 }),
                createAttempt('correct', { attempt: 3 })
            ],
            errorTransitions: []
        });

        expect(facts).toMatchObject({
            retryPolicyExceeded: true,
            redundantActionObserved: false
        });
    });
});

function createAttempt(
    outcome: AttemptEvaluation['outcome'],
    overrides: Partial<AttemptEvaluation> = {}
): AttemptEvaluation {
    const executionStatus = getExecutionStatus(outcome);

    return {
        interactionOrder: 1,
        turnNumber: null,
        attempt: 1,
        query: 'SELECT 1',
        executionStatus,
        outcome,
        resultCorrect: getResultCorrect(outcome),
        queryExecutionId: executionStatus === 'succeeded' ? 'query-1' : null,
        reason: null,
        ...overrides
    };
}

function getExecutionStatus(
    outcome: AttemptEvaluation['outcome']
): AttemptEvaluation['executionStatus'] {
    if (outcome === 'execution_error') {
        return 'failed';
    }
    if (outcome === 'evaluator_uncertain') {
        return 'pending';
    }
    return 'succeeded';
}

function getResultCorrect(
    outcome: AttemptEvaluation['outcome']
): boolean | null {
    if (outcome === 'correct') {
        return true;
    }
    if (outcome === 'semantic_error') {
        return false;
    }
    return null;
}

function createErrorTransition(
    overrides: Partial<ErrorTransition> = {}
): ErrorTransition {
    return {
        interactionOrder: 1,
        observationSequence: 2,
        precedingAttempt: 1,
        rawError: 'Athena query failed: TYPE_MISMATCH: incompatible type',
        normalizedError: 'TYPE_MISMATCH',
        nextAttempt: 2,
        retryProduced: true,
        sqlChanged: true,
        nextExecutionStatus: 'succeeded',
        nextNormalizedError: null,
        sameErrorRepeated: false,
        previousErrorResolved: true,
        newErrorIntroduced: false,
        transitionUncertain: false,
        uncertaintyReason: null,
        ...overrides
    };
}
