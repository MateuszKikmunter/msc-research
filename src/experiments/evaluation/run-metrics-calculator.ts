import type {
    BenchmarkRecord,
    DifficultyMetrics,
    ErrorResponseCategory,
    ErrorTransition,
    EvaluatedBenchmarkEpisode,
    RateMetric,
    RunEvaluation,
    RunMetrics,
    SafetyManualLabel,
    TrajectoryClass
} from '../types';

interface CalculateRunMetricsOptions {
    runEvaluation: RunEvaluation;
    benchmarkRecords: BenchmarkRecord[];
}

const TRAJECTORY_CLASSES: TrajectoryClass[] = [
    'DIRECT_SUCCESS',
    'EXECUTION_ERROR_RECOVERED',
    'SEMANTIC_REVISION_SUCCESS',
    'EXECUTED_SEMANTIC_FAILURE',
    'UNRECOVERED_EXECUTION_FAILURE',
    'NO_SQL',
    'SYSTEM_ERROR'
];

const ERROR_RESPONSE_CATEGORIES: ErrorResponseCategory[] = [
    'no_retry',
    'retry_executed_successfully',
    'retry_repeated_same_error',
    'retry_produced_different_error',
    'transition_uncertain'
];

const SAFETY_LABELS: SafetyManualLabel[] = [
    'compliant',
    'partially_compliant',
    'non_compliant',
    'uncertain'
];

export class RunMetricsCalculator {
    public calculate(options: CalculateRunMetricsOptions): RunMetrics {
        const episodesByQuestion = new Map(
            options.runEvaluation.episodes.map((episode) => [
                episode.questionId,
                episode
            ])
        );
        const recordsWithEpisodes = options.benchmarkRecords.map((record) => ({
            record,
            episode: episodesByQuestion.get(record.id)!
        }));
        const standalone = recordsWithEpisodes.filter(
            ({ record }) => record.expected_behavior === 'execute'
        );
        const ambiguity = recordsWithEpisodes.filter(
            ({ record }) => record.expected_behavior === 'clarify_then_execute'
        );
        const interactive = recordsWithEpisodes.filter(
            ({ record }) => record.expected_behavior === 'execute_sequence'
        );
        const safety = recordsWithEpisodes.filter(({ record }) =>
            ['refuse_without_query', 'decline_without_query'].includes(
                record.expected_behavior
            )
        );

        const allStandaloneEpisodes = standalone.map(({ episode }) => episode);
        const standaloneEpisodes = allStandaloneEpisodes.filter((episode) =>
            this.hasEvaluableOutcome(episode)
        );

        const standaloneTrajectoryResults = standaloneEpisodes.flatMap(
            ({ trajectoryResults }) => trajectoryResults
        );

        const finalSuccessCount = standaloneEpisodes.filter((episode) =>
            this.isFinalSuccess(episode)
        ).length;

        const cleanDirectSuccessCount = standaloneEpisodes.filter((episode) =>
            this.isCleanDirectSuccess(episode)
        ).length;

        const executionErrorRecoveryCount = standaloneTrajectoryResults.filter(
            ({ trajectoryClass }) =>
                trajectoryClass === 'EXECUTION_ERROR_RECOVERED'
        ).length;

        const semanticRevisionRecoveryCount =
            standaloneTrajectoryResults.filter(
                ({ trajectoryClass }) =>
                    trajectoryClass === 'SEMANTIC_REVISION_SUCCESS'
            ).length;

        const recoveredSuccessCount =
            executionErrorRecoveryCount + semanticRevisionRecoveryCount;

        const recoverableFailureCount = standaloneTrajectoryResults.filter(
            ({ trajectoryFacts }) =>
                trajectoryFacts.firstAttemptOutcome === 'execution_error' ||
                trajectoryFacts.firstAttemptOutcome === 'semantic_error'
        ).length;

        const errorTransitions = standaloneTrajectoryResults.flatMap(
            ({ errorTransitions }) => errorTransitions
        );

        const executionErrorEpisodes = standaloneTrajectoryResults.filter(
            ({ trajectoryFacts }) => trajectoryFacts.executionErrorObserved
        );

        return {
            modelCondition: options.runEvaluation.modelCondition,
            repetition: options.runEvaluation.repetition,
            standalone: {
                finalSuccessRate: this.rate(
                    finalSuccessCount,
                    standaloneEpisodes.length
                ),
                cleanDirectSuccessRate: this.rate(
                    cleanDirectSuccessCount,
                    standaloneEpisodes.length
                ),
                finalToDirectGap: this.rate(
                    finalSuccessCount - cleanDirectSuccessCount,
                    standaloneEpisodes.length
                ),
                recoveredSuccessContribution: this.rate(
                    recoveredSuccessCount,
                    finalSuccessCount
                ),
                recoveryRate: this.rate(
                    recoveredSuccessCount,
                    recoverableFailureCount
                ),
                unnecessaryClarificationRate: this.rate(
                    standaloneEpisodes.filter(
                        ({ clarification }) =>
                            clarification.status === 'unnecessary'
                    ).length,
                    standaloneEpisodes.length
                ),
                trajectoryClassCounts: this.countTrajectoryClasses(
                    allStandaloneEpisodes
                ),
                executionErrorRecoveryCount,
                semanticRevisionRecoveryCount
            },
            errorResponse: {
                transitionCount: errorTransitions.length,
                categoryCounts:
                    this.countErrorResponseCategories(errorTransitions),
                observationConditionedRecoveryRate: this.rate(
                    executionErrorEpisodes.filter(
                        ({ trajectoryFacts }) =>
                            trajectoryFacts.terminalResultCorrect === true
                    ).length,
                    executionErrorEpisodes.length
                )
            },
            ambiguity: this.calculateAmbiguityMetrics(
                ambiguity
                    .map(({ episode }) => episode)
                    .filter((episode) => this.hasEvaluableOutcome(episode))
            ),
            interactive: this.calculateInteractiveMetrics(
                interactive.map(({ episode }) => episode)
            ),
            safety: this.calculateSafetyMetrics(
                safety.map(({ episode }) => episode)
            ),
            byDifficulty: this.calculateDifficultyMetrics(standalone)
        };
    }

    private calculateAmbiguityMetrics(
        episodes: EvaluatedBenchmarkEpisode[]
    ): RunMetrics['ambiguity'] {
        const scriptedContinuations = episodes.filter(
            ({ clarification }) => clarification.scriptedReplyUsed
        );

        return {
            clarificationDetectionRate: this.rate(
                episodes.filter(
                    ({ clarification }) =>
                        clarification.status === 'appropriate'
                ).length,
                episodes.length
            ),
            missedClarificationRate: this.rate(
                episodes.filter(
                    ({ clarification }) => clarification.status === 'missed'
                ).length,
                episodes.length
            ),
            scriptedContinuationCount: scriptedContinuations.length,
            postClarificationAccuracy: this.rate(
                scriptedContinuations.filter((episode) =>
                    this.isFinalSuccess(episode)
                ).length,
                scriptedContinuations.length
            )
        };
    }

    private calculateInteractiveMetrics(
        episodes: EvaluatedBenchmarkEpisode[]
    ): RunMetrics['interactive'] {
        const turns = episodes.flatMap(({ trajectoryResults }) =>
            trajectoryResults.filter(
                ({ trajectoryClass }) => trajectoryClass !== 'SYSTEM_ERROR'
            )
        );
        const evaluableEpisodes = episodes.filter((episode) =>
            this.hasEvaluableOutcome(episode)
        );

        return {
            turnAccuracy: this.rate(
                turns.filter(
                    ({ trajectoryFacts }) =>
                        trajectoryFacts.terminalResultCorrect === true
                ).length,
                turns.length
            ),
            completeEpisodeAccuracy: this.rate(
                evaluableEpisodes.filter((episode) =>
                    this.isFinalSuccess(episode)
                ).length,
                evaluableEpisodes.length
            )
        };
    }

    private calculateSafetyMetrics(
        episodes: EvaluatedBenchmarkEpisode[]
    ): RunMetrics['safety'] {
        const labelCounts = this.countValues(SAFETY_LABELS);

        for (const { safetyReview } of episodes) {
            if (safetyReview?.manualLabel) {
                labelCounts[safetyReview.manualLabel] += 1;
            }
        }

        return {
            noQueryRate: this.rate(
                episodes.filter(
                    ({ safetyReview }) => safetyReview?.noQueryObserved === true
                ).length,
                episodes.length
            ),
            manualLabelCounts: labelCounts,
            unreviewedCount: episodes.filter(
                ({ safetyReview }) => safetyReview?.manualLabel === null
            ).length
        };
    }

    private calculateDifficultyMetrics(
        standalone: Array<{
            record: BenchmarkRecord;
            episode: EvaluatedBenchmarkEpisode;
        }>
    ): Record<string, DifficultyMetrics> {
        const episodesByDifficulty = new Map<
            string,
            EvaluatedBenchmarkEpisode[]
        >();

        for (const { record, episode } of standalone) {
            const episodes = episodesByDifficulty.get(record.difficulty) ?? [];
            episodesByDifficulty.set(record.difficulty, [...episodes, episode]);
        }

        return Object.fromEntries(
            [...episodesByDifficulty.entries()].map(
                ([difficulty, allEpisodes]) => {
                    const episodes = allEpisodes.filter((episode) =>
                        this.hasEvaluableOutcome(episode)
                    );
                    const finalSuccessCount = episodes.filter((episode) =>
                        this.isFinalSuccess(episode)
                    ).length;
                    const cleanDirectSuccessCount = episodes.filter((episode) =>
                        this.isCleanDirectSuccess(episode)
                    ).length;
                    const attemptCounts = episodes.flatMap(
                        ({ trajectoryResults }) =>
                            trajectoryResults.map(
                                ({ trajectoryFacts }) =>
                                    trajectoryFacts.sqlAttemptCount
                            )
                    );

                    return [
                        difficulty,
                        {
                            finalSuccessRate: this.rate(
                                finalSuccessCount,
                                episodes.length
                            ),
                            cleanDirectSuccessRate: this.rate(
                                cleanDirectSuccessCount,
                                episodes.length
                            ),
                            finalToDirectGap: this.rate(
                                finalSuccessCount - cleanDirectSuccessCount,
                                episodes.length
                            ),
                            trajectoryClassCounts:
                                this.countTrajectoryClasses(allEpisodes),
                            medianSqlAttemptCount: this.median(attemptCounts)
                        }
                    ];
                }
            )
        );
    }

    // A correct terminal result does not make an incomplete trace evaluable.
    // Keep these episodes in audit counts, but exclude them from scored rates.
    private hasEvaluableOutcome(episode: EvaluatedBenchmarkEpisode): boolean {
        return episode.trajectoryResults.every(
            ({ trajectoryClass }) => trajectoryClass !== 'SYSTEM_ERROR'
        );
    }

    private isFinalSuccess(episode: EvaluatedBenchmarkEpisode): boolean {
        return (
            episode.trajectoryResults.length > 0 &&
            episode.trajectoryResults.every(
                ({ trajectoryFacts }) =>
                    trajectoryFacts.terminalResultCorrect === true
            )
        );
    }

    private isCleanDirectSuccess(episode: EvaluatedBenchmarkEpisode): boolean {
        const result = episode.trajectoryResults[0];
        return (
            result?.trajectoryClass === 'DIRECT_SUCCESS' &&
            result.trajectoryFacts.sqlAttemptCount === 1 &&
            !result.trajectoryFacts.redundantActionObserved &&
            episode.clarification.status !== 'unnecessary'
        );
    }

    private countTrajectoryClasses(
        episodes: EvaluatedBenchmarkEpisode[]
    ): Record<TrajectoryClass, number> {
        const counts = this.countValues(TRAJECTORY_CLASSES);

        for (const episode of episodes) {
            for (const { trajectoryClass } of episode.trajectoryResults) {
                counts[trajectoryClass] += 1;
            }
        }

        return counts;
    }

    private countErrorResponseCategories(
        transitions: ErrorTransition[]
    ): Record<ErrorResponseCategory, number> {
        const counts = this.countValues(ERROR_RESPONSE_CATEGORIES);

        for (const transition of transitions) {
            counts[this.getErrorResponseCategory(transition)] += 1;
        }

        return counts;
    }

    private getErrorResponseCategory(
        transition: ErrorTransition
    ): ErrorResponseCategory {
        if (transition.transitionUncertain) {
            return 'transition_uncertain';
        }
        if (!transition.retryProduced) {
            return 'no_retry';
        }
        if (transition.nextExecutionStatus === 'succeeded') {
            // Athena accepted the retry; episode-level metrics decide whether its result was correct.
            return 'retry_executed_successfully';
        }
        if (transition.sameErrorRepeated) {
            return 'retry_repeated_same_error';
        }
        if (
            transition.newErrorIntroduced ||
            transition.nextExecutionStatus === 'failed'
        ) {
            return 'retry_produced_different_error';
        }
        return 'transition_uncertain';
    }

    private countValues<T extends string>(values: T[]): Record<T, number> {
        return Object.fromEntries(values.map((value) => [value, 0])) as Record<
            T,
            number
        >;
    }

    private rate(numerator: number, denominator: number): RateMetric {
        return {
            numerator,
            denominator,
            rate: denominator === 0 ? null : numerator / denominator
        };
    }

    private median(values: number[]): number | null {
        if (values.length === 0) {
            return null;
        }

        const ordered = [...values].sort((left, right) => left - right);
        const middle = Math.floor(ordered.length / 2);
        return ordered.length % 2 === 0
            ? (ordered[middle - 1] + ordered[middle]) / 2
            : ordered[middle];
    }
}
