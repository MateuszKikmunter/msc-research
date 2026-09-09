import type {
    AttemptEvaluation,
    BenchmarkEpisodeOptions,
    EpisodeEvaluationResult,
    ErrorTransition,
    GoldQueryDefinition,
    StoredRunInteraction
} from '../types';
import {
    isSafetyBenchmarkRecord,
    validateMatchingQuestion
} from '../shared/benchmark-episode-validator';
import { AttemptEvaluator } from './attempt-evaluator';
import { ErrorTransitionEvaluator } from './error-transition-evaluator';
import { TrajectoryClassifier } from './trajectory-classifier';
import { TrajectoryFactsBuilder } from './trajectory-facts-builder';

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
        private readonly attemptEvaluator: AttemptEvaluator,
        private readonly errorTransitionEvaluator: ErrorTransitionEvaluator,
        private readonly trajectoryFactsBuilder: TrajectoryFactsBuilder,
        private readonly trajectoryClassifier: TrajectoryClassifier
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
                ...(await this.attemptEvaluator.evaluate({
                    interaction,
                    goldDefinition: options.goldDefinition
                }))
            );
            errorTransitions.push(
                ...this.errorTransitionEvaluator.evaluate(interaction)
            );
        }

        const trajectoryFacts = this.trajectoryFactsBuilder.build({
            attempts: attemptEvaluations,
            errorTransitions
        });

        return {
            questionId: options.questionId,
            turnNumber: options.turnNumber,
            attemptEvaluations,
            errorTransitions,
            trajectoryFacts,
            trajectoryClass: this.trajectoryClassifier.classify(trajectoryFacts)
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
