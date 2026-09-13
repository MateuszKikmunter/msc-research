import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SqlAttempt } from '../../../backend/types';
import { AthenaErrorNormalizer } from '../../evaluation/athena-error-normalizer';
import { AttemptEvaluator } from '../../evaluation/attempt-evaluator';
import { EpisodeEvaluator } from '../../evaluation/episode-evaluator';
import { ErrorTransitionEvaluator } from '../../evaluation/error-transition-evaluator';
import { ResultArtifactLoader } from '../../evaluation/result-artifact-loader';
import { ResultComparator } from '../../evaluation/result-comparator';
import { ResultNormalizer } from '../../evaluation/result-normalizer';
import { TrajectoryFactsBuilder } from '../../evaluation/trajectory-facts-builder';
import type {
    BenchmarkRecord,
    CandidateResultFile,
    EvaluationEpisode,
    GoldenResultFile,
    GoldQueryDefinition,
    StoredRunInteraction,
    StoredTraceEvent
} from '../../types';
import {
    createStoredRunInteraction,
    createStoredTraceEvent
} from '../fixtures/run-interaction';

const comparison: GoldQueryDefinition['comparison'] = {
    mode: 'exact_result',
    requiredColumns: ['value'],
    orderMatters: false,
    columnOrderMatters: true,
    preserveDuplicates: true,
    numericTolerance: 0.000001,
    rowLimit: null,
    topNTiePolicy: null,
    compareColumnNames: false,
    allowExtraColumns: false
};

const goldenResult: GoldenResultFile = {
    questionId: 'CB200-E001',
    turnNumber: null,
    columns: [{ name: 'value', type: 'bigint' }],
    rows: [['1']],
    rowCount: 1
};

const candidateResult: CandidateResultFile = {
    questionId: 'CB200-E001',
    turnNumber: null,
    interactionOrder: 1,
    attempt: 1,
    queryExecutionId: 'query-1-1',
    columns: [{ name: 'value', type: 'bigint' }],
    rows: [['1']],
    rowCount: 1
};

describe('EpisodeEvaluator', () => {
    let artifactLoader: ResultArtifactLoader;
    let attemptEvaluator: AttemptEvaluator;
    let episodeEvaluator: EpisodeEvaluator;

    beforeEach(() => {
        artifactLoader = new ResultArtifactLoader('golden-sql', 'run');
        jest.spyOn(artifactLoader, 'loadGoldenResult').mockResolvedValue(
            goldenResult
        );
        jest.spyOn(artifactLoader, 'loadCandidateResult').mockResolvedValue(
            candidateResult
        );
        attemptEvaluator = new AttemptEvaluator(
            new ResultComparator(new ResultNormalizer()),
            artifactLoader
        );
        episodeEvaluator = new EpisodeEvaluator(
            attemptEvaluator,
            new ErrorTransitionEvaluator(new AthenaErrorNormalizer()),
            new TrajectoryFactsBuilder()
        );
    });

    it('classifies a successful first attempt as direct success', async () => {
        const interaction = createInteraction([successfulAttempt()]);

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('execute'),
            episode: createEpisode([interaction]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result).toMatchObject({
            questionId: 'CB200-E001',
            turnNumber: null,
            trajectoryClass: 'DIRECT_SUCCESS',
            trajectoryFacts: {
                sqlAttemptCount: 1,
                terminalResultCorrect: true
            }
        });
    });

    it('classifies repeated failed attempts without candidate files', async () => {
        const interaction = createInteraction([
            failedAttempt(1),
            failedAttempt(2),
            failedAttempt(3)
        ]);

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('execute'),
            episode: createEpisode([interaction]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result).toMatchObject({
            trajectoryClass: 'UNRECOVERED_EXECUTION_FAILURE',
            trajectoryFacts: {
                terminalOutcome: 'execution_error',
                retryPolicyExceeded: true,
                recovered: false,
                traceComplete: true,
                sqlAttemptCount: 3,
                athenaErrorCount: 3
            }
        });
        expect(result.errorTransitions).toHaveLength(3);
        expect(artifactLoader.loadGoldenResult).not.toHaveBeenCalled();
        expect(artifactLoader.loadCandidateResult).not.toHaveBeenCalled();
    });

    it('classifies a failed attempt followed by a correct result as recovered', async () => {
        const interaction = createInteraction([
            failedAttempt(1),
            successfulAttempt(2)
        ]);

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('execute'),
            episode: createEpisode([interaction]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result).toMatchObject({
            trajectoryClass: 'EXECUTION_ERROR_RECOVERED',
            trajectoryFacts: {
                firstAttemptOutcome: 'execution_error',
                terminalOutcome: 'correct',
                recovered: true,
                traceComplete: true
            }
        });
    });

    it('fails closed when a successful attempt has no candidate reference', async () => {
        const interaction = createInteraction([successfulAttempt()], {
            candidateResults: []
        });

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('execute'),
            episode: createEpisode([interaction]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result).toMatchObject({
            trajectoryClass: 'SYSTEM_ERROR',
            trajectoryFacts: {
                evaluationComplete: false
            },
            attemptEvaluations: [
                {
                    outcome: 'evaluator_uncertain',
                    reason: 'Successful SQL attempt has no candidate-result reference.'
                }
            ]
        });
    });

    it('combines a standalone fallback with the original interaction', async () => {
        const question = createInteraction([]);
        const fallback = createInteraction([successfulAttempt()], {
            interactionOrder: 2,
            inputType: 'fallback',
            fallbackUsed: true
        });

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('execute'),
            episode: createEpisode([question, fallback]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result.trajectoryClass).toBe('DIRECT_SUCCESS');
        expect(result.attemptEvaluations).toHaveLength(1);
        expect(result.attemptEvaluations[0].interactionOrder).toBe(2);
    });

    it('combines an ambiguity clarification with its scripted continuation', async () => {
        const clarification = createInteraction([]);
        const continuation = createInteraction([successfulAttempt()], {
            interactionOrder: 2,
            inputType: 'scripted_reply',
            scriptedReplyUsed: true
        });

        const [result] = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('clarify_then_execute'),
            episode: createEpisode([clarification, continuation]),
            goldDefinitions: [createGoldDefinition()]
        });

        expect(result.trajectoryClass).toBe('DIRECT_SUCCESS');
        expect(result.attemptEvaluations[0].interactionOrder).toBe(2);
    });

    it('evaluates interactive turns separately', async () => {
        const firstTurn = createInteraction([successfulAttempt()], {
            turnNumber: 1
        });
        const secondTurn = createInteraction([successfulAttempt()], {
            interactionOrder: 2,
            turnNumber: 2
        });

        const results = await episodeEvaluator.evaluate({
            benchmarkRecord: {
                ...createBenchmarkRecord('execute_sequence'),
                turns: [
                    { question: 'First?', gold_sql: 'SELECT 1', comparison },
                    { question: 'Second?', gold_sql: 'SELECT 1', comparison }
                ]
            },
            episode: createEpisode([firstTurn, secondTurn]),
            goldDefinitions: [createGoldDefinition(1), createGoldDefinition(2)]
        });

        expect(results.map(({ turnNumber }) => turnNumber)).toEqual([1, 2]);
        expect(results.map(({ trajectoryClass }) => trajectoryClass)).toEqual([
            'DIRECT_SUCCESS',
            'DIRECT_SUCCESS'
        ]);
        expect(artifactLoader.loadGoldenResult).toHaveBeenNthCalledWith(
            1,
            'CB200-E001-T01'
        );
        expect(artifactLoader.loadGoldenResult).toHaveBeenNthCalledWith(
            2,
            'CB200-E001-T02'
        );
    });

    it('leaves safety evaluation to the safety-contract stage', async () => {
        const results = await episodeEvaluator.evaluate({
            benchmarkRecord: createBenchmarkRecord('refuse_without_query'),
            episode: createEpisode([createInteraction([])]),
            goldDefinitions: []
        });

        expect(results).toEqual([]);
        expect(artifactLoader.loadGoldenResult).not.toHaveBeenCalled();
    });
});

function createBenchmarkRecord(
    expectedBehavior: BenchmarkRecord['expected_behavior']
): BenchmarkRecord {
    return {
        id: 'CB200-E001',
        difficulty: 'easy',
        category: 'test',
        expected_behavior: expectedBehavior,
        question: 'Return one.',
        gold_sql: 'SELECT 1',
        comparison,
        resolution:
            expectedBehavior === 'clarify_then_execute'
                ? {
                      acceptedSlots: [],
                      scriptedReply: 'Use one.',
                      gold_sql: 'SELECT 1',
                      comparison
                  }
                : undefined
    };
}

function createGoldDefinition(
    turnNumber: number | null = null
): GoldQueryDefinition {
    return {
        artifactId:
            turnNumber === null
                ? 'CB200-E001'
                : `CB200-E001-T${String(turnNumber).padStart(2, '0')}`,
        questionId: 'CB200-E001',
        turnNumber,
        sql: 'SELECT 1',
        comparison
    };
}

function createEpisode(
    interactions: StoredRunInteraction[]
): EvaluationEpisode {
    return {
        questionId: 'CB200-E001',
        sessionId: 'session-1',
        modelCondition: 'nova-lite',
        repetition: 1,
        interactions
    };
}

function createInteraction(
    sqlAttempts: SqlAttempt[],
    overrides: Partial<StoredRunInteraction> = {}
): StoredRunInteraction {
    const base = createStoredRunInteraction();
    const interactionOrder = overrides.interactionOrder ?? 1;
    const candidateResults = sqlAttempts
        .filter(({ status }) => status === 'succeeded')
        .map(({ attempt }) => ({
            attempt,
            queryExecutionId: `query-${interactionOrder}-${attempt}`,
            status: 'saved' as const,
            file: `candidate-results/result-${interactionOrder}-${attempt}.json`,
            error: null
        }));

    return createStoredRunInteraction({
        ...overrides,
        response: {
            ...base.response,
            sqlAttempts,
            traceEvents: createTraceEvents(sqlAttempts)
        },
        candidateResults: overrides.candidateResults ?? candidateResults
    });
}

function successfulAttempt(attempt = 1): SqlAttempt {
    return {
        attempt,
        query: 'SELECT 1',
        status: 'succeeded',
        error: null
    };
}

function failedAttempt(attempt: number): SqlAttempt {
    return {
        attempt,
        query: 'SELECT missing FROM artists',
        status: 'failed',
        error: 'Athena query failed: COLUMN_NOT_FOUND: missing'
    };
}

function createTraceEvents(sqlAttempts: SqlAttempt[]): StoredTraceEvent[] {
    return sqlAttempts.flatMap((attempt, index) => {
        const traceId = `trace-${attempt.attempt}`;
        const sequenceNumber = index * 2 + 1;

        return [
            createStoredTraceEvent({
                sequenceNumber,
                traceId,
                eventType: 'INVOCATION',
                actionName: 'executeAthenaQuery',
                actionInput: {
                    parameters: [{ name: 'query', value: attempt.query }]
                }
            }),
            createStoredTraceEvent({
                sequenceNumber: sequenceNumber + 1,
                traceId,
                eventType: 'OBSERVATION',
                observation:
                    attempt.status === 'failed'
                        ? { error: attempt.error }
                        : {
                              queryExecutionId: `query-1-${attempt.attempt}`
                          }
            })
        ];
    });
}
