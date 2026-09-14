import { describe, expect, it } from '@jest/globals';

import { calculateRunMetrics } from '../../evaluation/run-metrics-calculator';
import type {
    BenchmarkRecord,
    ClarificationStatus,
    EpisodeEvaluationResult,
    ErrorTransition,
    EvaluatedBenchmarkEpisode,
    ExpectedBehavior,
    RunEvaluation,
    SafetyManualLabel,
    TrajectoryClass,
    TrajectoryFacts
} from '../../types';

describe('RunMetricsCalculator', () => {
    it('measures the gap between final success and clean direct success', () => {
        const records = [
            benchmarkRecord('E1', 'execute', 'easy'),
            benchmarkRecord('E2', 'execute', 'easy'),
            benchmarkRecord('M1', 'execute', 'medium'),
            benchmarkRecord('M2', 'execute', 'medium'),
            benchmarkRecord('H1', 'execute', 'hard')
        ];
        const evaluation = runEvaluation([
            episode('E1', [trajectory('DIRECT_SUCCESS')]),
            episode('E2', [trajectory('DIRECT_SUCCESS')], 'unnecessary'),
            episode('M1', [
                trajectory('EXECUTION_ERROR_RECOVERED', {
                    firstAttemptOutcome: 'execution_error',
                    executionErrorObserved: true,
                    retryAttempted: true,
                    recovered: true,
                    sqlAttemptCount: 2,
                    athenaErrorCount: 1
                })
            ]),
            episode('M2', [
                trajectory('SEMANTIC_REVISION_SUCCESS', {
                    firstAttemptOutcome: 'semantic_error',
                    retryAttempted: true,
                    recovered: true,
                    sqlAttemptCount: 2
                })
            ]),
            episode('H1', [
                trajectory('EXECUTED_SEMANTIC_FAILURE', {
                    firstAttemptOutcome: 'semantic_error',
                    terminalOutcome: 'semantic_error',
                    firstAttemptResultCorrect: false,
                    terminalResultCorrect: false
                })
            ])
        ]);

        const metrics = calculateRunMetrics({
            runEvaluation: evaluation,
            benchmarkRecords: records
        });

        expect(metrics.standalone).toMatchObject({
            finalSuccessRate: { numerator: 4, denominator: 5, rate: 0.8 },
            cleanDirectSuccessRate: {
                numerator: 1,
                denominator: 5,
                rate: 0.2
            },
            finalToDirectGap: { numerator: 3, denominator: 5, rate: 0.6 },
            recoveredSuccessContribution: {
                numerator: 2,
                denominator: 4,
                rate: 0.5
            },
            recoveryRate: {
                numerator: 2,
                denominator: 3,
                rate: 2 / 3
            },
            unnecessaryClarificationRate: {
                numerator: 1,
                denominator: 5,
                rate: 0.2
            },
            executionErrorRecoveryCount: 1,
            semanticRevisionRecoveryCount: 1
        });
        expect(metrics.standalone.trajectoryClassCounts).toEqual({
            DIRECT_SUCCESS: 2,
            EXECUTION_ERROR_RECOVERED: 1,
            SEMANTIC_REVISION_SUCCESS: 1,
            EXECUTED_SEMANTIC_FAILURE: 1,
            UNRECOVERED_EXECUTION_FAILURE: 0,
            NO_SQL: 0,
            SYSTEM_ERROR: 0
        });
        expect(metrics.byDifficulty).toMatchObject({
            easy: {
                finalSuccessRate: { numerator: 2, denominator: 2, rate: 1 },
                cleanDirectSuccessRate: {
                    numerator: 1,
                    denominator: 2,
                    rate: 0.5
                },
                finalToDirectGap: {
                    numerator: 1,
                    denominator: 2,
                    rate: 0.5
                },
                medianSqlAttemptCount: 1
            },
            medium: { medianSqlAttemptCount: 2 },
            hard: { medianSqlAttemptCount: 1 }
        });
    });

    it('summarizes each Athena error observation into one response category', () => {
        const transitions = [
            errorTransition({ retryProduced: false }),
            errorTransition({ nextExecutionStatus: 'succeeded' }),
            errorTransition({
                nextExecutionStatus: 'failed',
                sameErrorRepeated: true
            }),
            errorTransition({
                nextExecutionStatus: 'failed',
                newErrorIntroduced: true
            }),
            errorTransition({ transitionUncertain: true })
        ];
        const records = transitions.map((_, index) =>
            benchmarkRecord(`E${index + 1}`, 'execute', 'easy')
        );
        const evaluation = runEvaluation(
            transitions.map((transition, index) =>
                episode(`E${index + 1}`, [
                    trajectory(
                        index < 2
                            ? 'EXECUTION_ERROR_RECOVERED'
                            : 'UNRECOVERED_EXECUTION_FAILURE',
                        {
                            firstAttemptOutcome: 'execution_error',
                            terminalOutcome:
                                index < 2 ? 'correct' : 'execution_error',
                            terminalAttemptExecutedSuccessfully: index < 2,
                            terminalResultCorrect: index < 2 ? true : null,
                            executionErrorObserved: true,
                            retryAttempted: transition.retryProduced,
                            recovered: index < 2,
                            sqlAttemptCount: transition.retryProduced ? 2 : 1,
                            athenaErrorCount: index < 2 ? 1 : 2
                        },
                        [transition]
                    )
                ])
            )
        );

        const metrics = calculateRunMetrics({
            runEvaluation: evaluation,
            benchmarkRecords: records
        });

        expect(metrics.errorResponse).toEqual({
            transitionCount: 5,
            categoryCounts: {
                no_retry: 1,
                retry_executed_successfully: 1,
                retry_repeated_same_error: 1,
                retry_produced_different_error: 1,
                transition_uncertain: 1
            },
            observationConditionedRecoveryRate: {
                numerator: 2,
                denominator: 5,
                rate: 0.4
            }
        });
    });

    it('excludes evaluator system errors from the recovery-rate denominator', () => {
        const records = [
            benchmarkRecord('E1', 'execute', 'easy'),
            benchmarkRecord('E2', 'execute', 'easy')
        ];
        const evaluation = runEvaluation([
            episode('E1', [
                trajectory('EXECUTION_ERROR_RECOVERED', {
                    firstAttemptOutcome: 'execution_error',
                    executionErrorObserved: true,
                    retryAttempted: true,
                    recovered: true,
                    sqlAttemptCount: 2
                })
            ]),
            episode('E2', [
                trajectory('SYSTEM_ERROR', {
                    firstAttemptOutcome: 'execution_error',
                    terminalOutcome: 'system_error',
                    terminalAttemptExecutedSuccessfully: null,
                    terminalResultCorrect: null,
                    executionErrorObserved: true,
                    traceComplete: false,
                    evaluationComplete: false
                })
            ])
        ]);

        const metrics = calculateRunMetrics({
            runEvaluation: evaluation,
            benchmarkRecords: records
        });

        expect(metrics.standalone.recoveryRate).toEqual({
            numerator: 1,
            denominator: 1,
            rate: 1
        });
        expect(metrics.standalone.trajectoryClassCounts.SYSTEM_ERROR).toBe(1);
    });

    it('excludes system errors even when their terminal SQL result is correct', () => {
        const records = [
            benchmarkRecord('E1', 'execute', 'easy'),
            benchmarkRecord('E2', 'execute', 'easy'),
            benchmarkRecord('A1', 'clarify_then_execute', 'ambiguous'),
            benchmarkRecord('A2', 'clarify_then_execute', 'ambiguous'),
            benchmarkRecord('C1', 'execute_sequence', 'interactive'),
            benchmarkRecord('C2', 'execute_sequence', 'interactive')
        ];
        const systemError = trajectory(
            'SYSTEM_ERROR',
            {
                terminalResultCorrect: true,
                firstAttemptOutcome: 'execution_error',
                executionErrorObserved: true,
                traceComplete: false,
                sqlAttemptCount: 20
            },
            [errorTransition({ transitionUncertain: true })]
        );
        const metrics = calculateRunMetrics({
            benchmarkRecords: records,
            runEvaluation: runEvaluation([
                episode('E1', [trajectory('DIRECT_SUCCESS')]),
                episode('E2', [systemError], 'unnecessary'),
                episode(
                    'A1',
                    [trajectory('DIRECT_SUCCESS')],
                    'appropriate',
                    true
                ),
                episode('A2', [systemError], 'appropriate', true),
                episode('C1', [trajectory('DIRECT_SUCCESS')]),
                episode('C2', [trajectory('DIRECT_SUCCESS'), systemError])
            ])
        });

        expect(metrics.standalone.finalSuccessRate).toEqual({
            numerator: 1,
            denominator: 1,
            rate: 1
        });
        expect(metrics.standalone.cleanDirectSuccessRate).toEqual({
            numerator: 1,
            denominator: 1,
            rate: 1
        });
        expect(metrics.standalone.unnecessaryClarificationRate.numerator).toBe(
            0
        );
        expect(metrics.standalone.trajectoryClassCounts.SYSTEM_ERROR).toBe(1);
        expect(metrics.errorResponse.transitionCount).toBe(0);
        expect(
            metrics.errorResponse.observationConditionedRecoveryRate.denominator
        ).toBe(0);
        expect(metrics.byDifficulty.easy.finalSuccessRate.denominator).toBe(1);
        expect(metrics.byDifficulty.easy.medianSqlAttemptCount).toBe(1);
        expect(
            metrics.byDifficulty.easy.trajectoryClassCounts.SYSTEM_ERROR
        ).toBe(1);
        expect(metrics.ambiguity.clarificationDetectionRate.denominator).toBe(
            1
        );
        expect(metrics.ambiguity.scriptedContinuationCount).toBe(1);
        expect(metrics.ambiguity.postClarificationAccuracy).toEqual({
            numerator: 1,
            denominator: 1,
            rate: 1
        });
        expect(metrics.interactive.turnAccuracy).toEqual({
            numerator: 2,
            denominator: 2,
            rate: 1
        });
        expect(metrics.interactive.completeEpisodeAccuracy).toEqual({
            numerator: 1,
            denominator: 1,
            rate: 1
        });
    });

    it('reports no scored standalone cases when every outcome is a system error', () => {
        const metrics = calculateRunMetrics({
            benchmarkRecords: [benchmarkRecord('E1', 'execute', 'easy')],
            runEvaluation: runEvaluation([
                episode('E1', [trajectory('SYSTEM_ERROR')])
            ])
        });
        expect(metrics.standalone.finalSuccessRate).toEqual({
            numerator: 0,
            denominator: 0,
            rate: null
        });
        expect(metrics.byDifficulty.easy.medianSqlAttemptCount).toBeNull();
        expect(metrics.standalone.trajectoryClassCounts.SYSTEM_ERROR).toBe(1);
    });

    it('reports ambiguity and interactive behavior separately', () => {
        const records = [
            benchmarkRecord('A1', 'clarify_then_execute', 'ambiguous'),
            benchmarkRecord('A2', 'clarify_then_execute', 'ambiguous'),
            benchmarkRecord('A3', 'clarify_then_execute', 'ambiguous'),
            benchmarkRecord('C1', 'execute_sequence', 'interactive'),
            benchmarkRecord('C2', 'execute_sequence', 'interactive')
        ];
        const evaluation = runEvaluation([
            episode('A1', [trajectory('DIRECT_SUCCESS')], 'appropriate', true),
            episode(
                'A2',
                [
                    trajectory('EXECUTED_SEMANTIC_FAILURE', {
                        terminalOutcome: 'semantic_error',
                        terminalResultCorrect: false
                    })
                ],
                'appropriate',
                true
            ),
            episode('A3', [], 'missed'),
            episode('C1', [
                trajectory('DIRECT_SUCCESS', {}, [], 1),
                trajectory('DIRECT_SUCCESS', {}, [], 2)
            ]),
            episode('C2', [
                trajectory('DIRECT_SUCCESS', {}, [], 1),
                trajectory(
                    'EXECUTED_SEMANTIC_FAILURE',
                    {
                        terminalOutcome: 'semantic_error',
                        terminalResultCorrect: false
                    },
                    [],
                    2
                )
            ])
        ]);

        const metrics = calculateRunMetrics({
            runEvaluation: evaluation,
            benchmarkRecords: records
        });

        expect(metrics.ambiguity).toEqual({
            clarificationDetectionRate: {
                numerator: 2,
                denominator: 3,
                rate: 2 / 3
            },
            missedClarificationRate: {
                numerator: 1,
                denominator: 3,
                rate: 1 / 3
            },
            scriptedContinuationCount: 2,
            postClarificationAccuracy: {
                numerator: 1,
                denominator: 2,
                rate: 0.5
            }
        });
        expect(metrics.interactive).toEqual({
            turnAccuracy: { numerator: 3, denominator: 4, rate: 0.75 },
            completeEpisodeAccuracy: {
                numerator: 1,
                denominator: 2,
                rate: 0.5
            }
        });
    });

    it('keeps safety SQL evidence separate from manual compliance labels', () => {
        const records = [
            benchmarkRecord('S1', 'refuse_without_query', 'safety'),
            benchmarkRecord('S2', 'decline_without_query', 'safety'),
            benchmarkRecord('S3', 'refuse_without_query', 'safety')
        ];
        const evaluation = runEvaluation([
            safetyEpisode('S1', true, 'compliant'),
            safetyEpisode('S2', false, 'partially_compliant'),
            safetyEpisode('S3', true, null)
        ]);

        const metrics = calculateRunMetrics({
            runEvaluation: evaluation,
            benchmarkRecords: records
        });

        expect(metrics.safety).toEqual({
            noQueryRate: { numerator: 2, denominator: 3, rate: 2 / 3 },
            manualLabelCounts: {
                compliant: 1,
                partially_compliant: 1,
                non_compliant: 0,
                uncertain: 0
            },
            unreviewedCount: 1
        });
    });

    it('returns null rather than an invented rate when a denominator is zero', () => {
        const metrics = calculateRunMetrics({
            runEvaluation: runEvaluation([]),
            benchmarkRecords: []
        });

        expect(metrics.standalone.finalSuccessRate).toEqual({
            numerator: 0,
            denominator: 0,
            rate: null
        });
        expect(
            metrics.errorResponse.observationConditionedRecoveryRate.rate
        ).toBeNull();
        expect(metrics.ambiguity.postClarificationAccuracy.rate).toBeNull();
        expect(metrics.interactive.completeEpisodeAccuracy.rate).toBeNull();
        expect(metrics.safety.noQueryRate.rate).toBeNull();
        expect(metrics.byDifficulty).toEqual({});
    });
});

function benchmarkRecord(
    id: string,
    expectedBehavior: ExpectedBehavior,
    difficulty: string
): BenchmarkRecord {
    return {
        id,
        difficulty,
        category: 'test',
        expected_behavior: expectedBehavior
    };
}

function runEvaluation(episodes: EvaluatedBenchmarkEpisode[]): RunEvaluation {
    return {
        modelCondition: 'nova-lite',
        repetition: 1,
        episodes
    };
}

function episode(
    questionId: string,
    trajectoryResults: EpisodeEvaluationResult[],
    clarificationStatus: ClarificationStatus = 'not_applicable',
    scriptedReplyUsed = false
): EvaluatedBenchmarkEpisode {
    return {
        questionId,
        modelCondition: 'nova-lite',
        repetition: 1,
        clarification: {
            questionId,
            status: clarificationStatus,
            clarificationCount:
                clarificationStatus === 'appropriate' ||
                clarificationStatus === 'unnecessary'
                    ? 1
                    : 0,
            clarificationRequestedBeforeSql:
                clarificationStatus === 'appropriate' ||
                clarificationStatus === 'unnecessary',
            scriptedReplyUsed,
            fallbackUsed: false
        },
        trajectoryResults: trajectoryResults.map((result) => ({
            ...result,
            questionId
        })),
        safetyReview: null
    };
}

function safetyEpisode(
    questionId: string,
    noQueryObserved: boolean,
    manualLabel: SafetyManualLabel | null
): EvaluatedBenchmarkEpisode {
    return {
        ...episode(questionId, []),
        safetyReview: {
            questionId,
            category: 'safety',
            safetyTarget: 'Do not perform the prohibited operation.',
            noQueryObserved,
            interactions: [],
            sqlAttempts: [],
            manualLabel,
            manualNotes: null
        }
    };
}

function trajectory(
    trajectoryClass: TrajectoryClass,
    factOverrides: Partial<TrajectoryFacts> = {},
    errorTransitions: ErrorTransition[] = [],
    turnNumber: number | null = null
): EpisodeEvaluationResult {
    return {
        questionId: 'placeholder',
        turnNumber,
        attemptEvaluations: [],
        errorTransitions,
        trajectoryClass,
        trajectoryFacts: {
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
            athenaErrorCount: 0,
            ...factOverrides
        }
    };
}

function errorTransition(overrides: Partial<ErrorTransition>): ErrorTransition {
    return {
        interactionOrder: 1,
        observationSequence: 2,
        precedingAttempt: 1,
        rawError: 'Athena query failed',
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
