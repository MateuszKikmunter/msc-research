import { AthenaErrorNormalizer } from './athena-error-normalizer';
import type {
    AttemptEvaluation,
    BenchmarkEpisodeOptions,
    EpisodeEvaluationResult,
    ErrorTransition,
    GoldQueryDefinition,
    StoredRunInteraction,
    CandidateResultReference
} from '../types';
import {
    isSafetyBenchmarkRecord,
    validateMatchingQuestion
} from '../shared/benchmark-episode-validator';
import type { SqlAttempt } from '../../backend/types';

import { getErrorMessage } from '../shared/error-message';
import {
    loadGoldenResult,
    loadCandidateResult,
    type EvaluationPaths
} from './evaluation-input';
import { ResultComparator } from './result-comparator';
import { ErrorTransitionEvaluator } from './error-transition-evaluator';
import { classifyTrajectory, buildTrajectoryFacts } from './trajectory';

interface EvaluateEpisodeOptions extends BenchmarkEpisodeOptions {
    goldDefinitions: GoldQueryDefinition[];
}

interface EvaluateUnitOptions {
    questionId: string;
    turnNumber: number | null;
    interactions: StoredRunInteraction[];
    goldDefinition: GoldQueryDefinition;
}

export class EpisodeEvaluator {
    public constructor(
        private readonly paths: EvaluationPaths,
        private readonly errorTransitionEvaluator = new ErrorTransitionEvaluator(
            new AthenaErrorNormalizer()
        )
    ) {}

    public async evaluate(
        options: EvaluateEpisodeOptions
    ): Promise<EpisodeEvaluationResult[]> {
        validateMatchingQuestion(options);

        if (isSafetyBenchmarkRecord(options.benchmarkRecord)) {
            return [];
        }

        if (options.benchmarkRecord.expected_behavior === 'execute_sequence') {
            return this.evaluateInteractiveTurns(options);
        }

        return [
            await this.evaluateUnit({
                questionId: options.benchmarkRecord.id,
                turnNumber: null,
                interactions: options.episode.interactions,
                goldDefinition: this.getGoldDefinition(
                    options.goldDefinitions,
                    options.benchmarkRecord.id,
                    null
                )
            })
        ];
    }

    private async evaluateInteractiveTurns(
        options: EvaluateEpisodeOptions
    ): Promise<EpisodeEvaluationResult[]> {
        const results: EpisodeEvaluationResult[] = [];

        for (const interaction of options.episode.interactions) {
            if (interaction.turnNumber === null) {
                throw new Error(
                    `Interactive episode ${options.benchmarkRecord.id} contains an interaction without a turn number.`
                );
            }

            results.push(
                await this.evaluateUnit({
                    questionId: options.benchmarkRecord.id,
                    turnNumber: interaction.turnNumber,
                    interactions: [interaction],
                    goldDefinition: this.getGoldDefinition(
                        options.goldDefinitions,
                        options.benchmarkRecord.id,
                        interaction.turnNumber
                    )
                })
            );
        }

        return results;
    }

    private async evaluateUnit(
        options: EvaluateUnitOptions
    ): Promise<EpisodeEvaluationResult> {
        const attemptEvaluations: AttemptEvaluation[] = [];
        const errorTransitions: ErrorTransition[] = [];

        for (const interaction of options.interactions) {
            attemptEvaluations.push(
                ...(await evaluateAttempts(
                    {
                        interaction,
                        goldDefinition: options.goldDefinition
                    },
                    this.paths
                ))
            );
            errorTransitions.push(
                ...this.errorTransitionEvaluator.evaluate(interaction)
            );
        }

        const trajectoryFacts = buildTrajectoryFacts({
            attempts: attemptEvaluations,
            errorTransitions
        });

        return {
            questionId: options.questionId,
            turnNumber: options.turnNumber,
            attemptEvaluations,
            errorTransitions,
            trajectoryFacts,
            trajectoryClass: classifyTrajectory(trajectoryFacts)
        };
    }

    private getGoldDefinition(
        definitions: GoldQueryDefinition[],
        questionId: string,
        turnNumber: number | null
    ): GoldQueryDefinition {
        const definition = definitions.find(
            (candidate) =>
                candidate.questionId === questionId &&
                candidate.turnNumber === turnNumber
        );

        if (!definition) {
            const turn = turnNumber === null ? '' : ` turn ${turnNumber}`;
            throw new Error(
                `Golden query definition not found for ${questionId}${turn}.`
            );
        }

        return definition;
    }
}

interface EvaluateAttemptsOptions {
    interaction: StoredRunInteraction;
    goldDefinition: GoldQueryDefinition;
}

interface EvaluateAttemptOptions extends EvaluateAttemptsOptions {
    attempt: SqlAttempt;
}

type AttemptEvaluationBase = Pick<
    AttemptEvaluation,
    'interactionOrder' | 'turnNumber' | 'attempt' | 'query' | 'executionStatus'
>;

export async function evaluateAttempts(
    options: EvaluateAttemptsOptions,
    paths: EvaluationPaths
): Promise<AttemptEvaluation[]> {
    const attempts = [...options.interaction.response.sqlAttempts].sort(
        (left, right) => left.attempt - right.attempt
    );
    const evaluations: AttemptEvaluation[] = [];

    for (const attempt of attempts) {
        evaluations.push(
            await evaluateAttempt(
                {
                    interaction: options.interaction,
                    goldDefinition: options.goldDefinition,
                    attempt
                },
                paths
            )
        );
    }

    return evaluations;
}

async function evaluateAttempt(
    options: EvaluateAttemptOptions,
    paths: EvaluationPaths
): Promise<AttemptEvaluation> {
    const baseEvaluation = createBaseEvaluation(
        options.interaction,
        options.attempt
    );

    if (options.attempt.status === 'failed') {
        return {
            ...baseEvaluation,
            outcome: 'execution_error',
            resultCorrect: null,
            queryExecutionId: null,
            reason: options.attempt.error
        };
    }

    if (options.attempt.status === 'pending') {
        return {
            ...baseEvaluation,
            outcome: 'evaluator_uncertain',
            resultCorrect: null,
            queryExecutionId: null,
            reason: 'SQL attempt has no final execution status.'
        };
    }

    const reference = options.interaction.candidateResults.find(
        (candidateResult) => candidateResult.attempt === options.attempt.attempt
    );
    if (!reference) {
        return uncertain(
            baseEvaluation,
            null,
            'Successful SQL attempt has no candidate-result reference.'
        );
    }

    if (reference.status === 'evaluator_uncertain' || !reference.file) {
        return uncertain(
            baseEvaluation,
            reference,
            reference.error ?? 'Candidate result was not saved.'
        );
    }

    let goldenResult;
    try {
        goldenResult = await loadGoldenResult(
            paths.goldenResultDirectory,
            options.goldDefinition.artifactId
        );
    } catch (error) {
        return uncertain(
            baseEvaluation,
            reference,
            `Could not load golden result: ${getErrorMessage(error)}`
        );
    }

    let candidateResult;
    try {
        candidateResult = await loadCandidateResult(
            paths.runDirectory,
            reference.file
        );
    } catch (error) {
        return uncertain(
            baseEvaluation,
            reference,
            `Could not load candidate result: ${getErrorMessage(error)}`
        );
    }

    const comparison = new ResultComparator().compare(
        goldenResult,
        candidateResult,
        options.goldDefinition.comparison
    );

    if (comparison.status === 'correct') {
        return {
            ...baseEvaluation,
            outcome: 'correct',
            resultCorrect: true,
            queryExecutionId: reference.queryExecutionId,
            reason: null
        };
    }

    if (comparison.status === 'incorrect') {
        return {
            ...baseEvaluation,
            outcome: 'semantic_error',
            resultCorrect: false,
            queryExecutionId: reference.queryExecutionId,
            reason: comparison.reason
        };
    }

    return uncertain(
        baseEvaluation,
        reference,
        comparison.reason ?? 'Result comparison was uncertain.'
    );
}

function createBaseEvaluation(
    interaction: StoredRunInteraction,
    attempt: SqlAttempt
): AttemptEvaluationBase {
    return {
        interactionOrder: interaction.interactionOrder,
        turnNumber: interaction.turnNumber,
        attempt: attempt.attempt,
        query: attempt.query,
        executionStatus: attempt.status
    };
}

function uncertain(
    baseEvaluation: AttemptEvaluationBase,
    reference: CandidateResultReference | null,
    reason: string
): AttemptEvaluation {
    return {
        ...baseEvaluation,
        outcome: 'evaluator_uncertain',
        resultCorrect: null,
        queryExecutionId: reference?.queryExecutionId ?? null,
        reason
    };
}
