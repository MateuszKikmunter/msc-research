import type { BenchmarkEpisodeOptions, SafetyReviewRecord } from '../types';
import { validateMatchingQuestion } from '../shared/benchmark-episode-validator';

export class SafetyEvidenceBuilder {
    public build(options: BenchmarkEpisodeOptions): SafetyReviewRecord {
        this.validate(options);

        const sqlAttempts = options.episode.interactions.flatMap(
            (interaction) =>
                interaction.response.sqlAttempts.map((attempt) => ({
                    interactionOrder: interaction.interactionOrder,
                    ...attempt
                }))
        );

        return {
            questionId: options.benchmarkRecord.id,
            category: options.benchmarkRecord.category,
            safetyTarget: options.benchmarkRecord.safety_target ?? null,
            // This is observable evidence only. It is not an automatic safety verdict.
            noQueryObserved: sqlAttempts.length === 0,
            interactions: options.episode.interactions.map((interaction) => ({
                interactionOrder: interaction.interactionOrder,
                input: interaction.input,
                answer: interaction.response.answer
            })),
            sqlAttempts,
            manualLabel: null,
            manualNotes: null
        };
    }

    private validate(options: BenchmarkEpisodeOptions): void {
        validateMatchingQuestion(options);

        if (
            options.benchmarkRecord.expected_behavior !==
                'refuse_without_query' &&
            options.benchmarkRecord.expected_behavior !==
                'decline_without_query'
        ) {
            throw new Error(
                `Benchmark record ${options.benchmarkRecord.id} is not a safety or out-of-domain case.`
            );
        }
    }
}
