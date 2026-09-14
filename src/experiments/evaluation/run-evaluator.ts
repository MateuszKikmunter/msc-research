import { buildGoldQueryDefinitions } from '../golden-results/gold-query-definition-builder';
import { isSafetyBenchmarkRecord } from '../shared/benchmark-episode-validator';
import type {
    BenchmarkRecord,
    EvaluatedBenchmarkEpisode,
    EvaluationEpisode,
    ManualSafetyReview,
    RunEvaluation
} from '../types';
import { evaluateClarification, buildSafetyEvidence } from './case-policies';
import { groupEpisodes, loadRunInteractions } from './evaluation-input';
import { EpisodeEvaluator } from './episode-evaluator';

interface EvaluateRunOptions {
    interactionsPath: string;
    benchmarkRecords: BenchmarkRecord[];
    manualSafetyReviews?: ManualSafetyReview[];
}

export class RunEvaluator {
    public constructor(private readonly episodeEvaluator: EpisodeEvaluator) {}

    public async evaluate(options: EvaluateRunOptions): Promise<RunEvaluation> {
        const interactions = await loadRunInteractions(
            options.interactionsPath
        );
        // A failure trace is not evidence of a completed no-SQL or safety outcome.
        // Require review rather than infer whether the failure came from the model or platform.
        for (const interaction of interactions) {
            const failure = interaction.response.traceEvents.find(
                (event) =>
                    event.eventType === 'FAILURE' || event.stage === 'FAILURE'
            );
            if (failure) {
                throw new Error(
                    `Cannot evaluate run: failure trace at ${interaction.questionId}, interaction ${interaction.interactionOrder}, sequence ${failure.sequenceNumber}. Review the stored trace before scoring this run.`
                );
            }
        }
        const episodes = groupEpisodes(interactions);

        if (episodes.length !== options.benchmarkRecords.length) {
            throw new Error(
                `Run is incomplete; expected ${options.benchmarkRecords.length} episodes, received ${episodes.length}.`
            );
        }

        const firstEpisode = episodes[0];
        const episodesByQuestion = new Map(
            episodes.map((episode) => [episode.questionId, episode])
        );
        const goldDefinitions = buildGoldQueryDefinitions(
            options.benchmarkRecords
        );
        const safetyReviewsByQuestion = this.indexSafetyReviews(
            options.manualSafetyReviews ?? [],
            options.benchmarkRecords
        );
        const evaluatedEpisodes: EvaluatedBenchmarkEpisode[] = [];

        for (const benchmarkRecord of options.benchmarkRecords) {
            const episode = episodesByQuestion.get(benchmarkRecord.id);
            if (!episode) {
                throw new Error(
                    `Run is incomplete; missing benchmark question ${benchmarkRecord.id}.`
                );
            }
            this.validateInteractiveTurns(benchmarkRecord, episode);

            const clarification = evaluateClarification({
                benchmarkRecord,
                episode
            });
            let safetyReview = null;
            let trajectoryResults: EvaluatedBenchmarkEpisode['trajectoryResults'] =
                [];
            if (isSafetyBenchmarkRecord(benchmarkRecord)) {
                safetyReview = buildSafetyEvidence({
                    benchmarkRecord,
                    episode
                });
                const manualReview = safetyReviewsByQuestion.get(
                    benchmarkRecord.id
                );
                if (manualReview) {
                    safetyReview.manualLabel = manualReview.manualLabel;
                    safetyReview.manualNotes = manualReview.manualNotes;
                }
            } else if (
                benchmarkRecord.expected_behavior === 'clarify_then_execute' &&
                (clarification.status !== 'appropriate' ||
                    !clarification.scriptedReplyUsed)
            ) {
                // Keep clarification evidence, but do not score an interpretation never supplied.
            } else {
                trajectoryResults = await this.episodeEvaluator.evaluate({
                    benchmarkRecord,
                    episode,
                    goldDefinitions: goldDefinitions.filter(
                        (definition) =>
                            definition.questionId === benchmarkRecord.id
                    )
                });
            }

            evaluatedEpisodes.push({
                questionId: benchmarkRecord.id,
                modelCondition: episode.modelCondition,
                repetition: episode.repetition,
                clarification,
                trajectoryResults,
                safetyReview
            });
        }

        return {
            modelCondition: firstEpisode.modelCondition,
            repetition: firstEpisode.repetition,
            episodes: evaluatedEpisodes
        };
    }

    private indexSafetyReviews(
        reviews: ManualSafetyReview[],
        benchmarkRecords: BenchmarkRecord[]
    ): Map<string, ManualSafetyReview> {
        const safetyQuestionIds = new Set(
            benchmarkRecords.filter(isSafetyBenchmarkRecord).map(({ id }) => id)
        );
        const reviewsByQuestion = new Map<string, ManualSafetyReview>();

        for (const review of reviews) {
            if (!safetyQuestionIds.has(review.questionId)) {
                throw new Error(
                    `Manual safety review references unknown safety question ${review.questionId}.`
                );
            }
            if (reviewsByQuestion.has(review.questionId)) {
                throw new Error(
                    `Duplicate manual safety review for ${review.questionId}.`
                );
            }
            reviewsByQuestion.set(review.questionId, review);
        }

        return reviewsByQuestion;
    }

    private validateInteractiveTurns(
        benchmarkRecord: BenchmarkRecord,
        episode: EvaluationEpisode
    ): void {
        if (benchmarkRecord.expected_behavior !== 'execute_sequence') {
            return;
        }

        const expectedTurns = (benchmarkRecord.turns ?? []).map(
            (_, index) => index + 1
        );
        const actualTurns = episode.interactions
            .map(({ turnNumber }) => turnNumber)
            .sort((left, right) => (left ?? 0) - (right ?? 0));

        if (
            actualTurns.length !== expectedTurns.length ||
            actualTurns.some((turn, index) => turn !== expectedTurns[index])
        ) {
            throw new Error(
                `Interactive episode ${benchmarkRecord.id} does not contain the expected turns ${expectedTurns.join(', ')}.`
            );
        }
    }
}
