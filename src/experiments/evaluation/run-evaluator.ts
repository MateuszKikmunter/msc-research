import { GoldQueryDefinitionBuilder } from '../golden-results/gold-query-definition-builder';
import type {
    BenchmarkRecord,
    ClarificationEvaluation,
    EvaluatedBenchmarkEpisode,
    EvaluationEpisode,
    RunEvaluation
} from '../types';
import { ClarificationEvaluator } from './clarification-evaluator';
import { EpisodeBuilder } from './episode-builder';
import { EpisodeEvaluator } from './episode-evaluator';
import { RunInteractionLoader } from './run-interaction-loader';
import { SafetyEvidenceBuilder } from './safety-evidence-builder';

interface EvaluateRunOptions {
    interactionsPath: string;
    benchmarkRecords: BenchmarkRecord[];
}

export class RunEvaluator {
    public constructor(
        private readonly interactionLoader: RunInteractionLoader,
        private readonly episodeBuilder: EpisodeBuilder,
        private readonly episodeEvaluator: EpisodeEvaluator,
        private readonly clarificationEvaluator: ClarificationEvaluator,
        private readonly safetyEvidenceBuilder: SafetyEvidenceBuilder
    ) {}

    public async evaluate(options: EvaluateRunOptions): Promise<RunEvaluation> {
        const interactions = await this.interactionLoader.load(
            options.interactionsPath
        );
        const episodes = this.episodeBuilder.build(interactions);

        if (episodes.length !== options.benchmarkRecords.length) {
            throw new Error(
                `Run is incomplete; expected ${options.benchmarkRecords.length} episodes, received ${episodes.length}.`
            );
        }

        const firstEpisode = episodes[0];
        const episodesByQuestion = new Map(
            episodes.map((episode) => [episode.questionId, episode])
        );
        const goldDefinitions = GoldQueryDefinitionBuilder.build(
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

            const clarification = this.clarificationEvaluator.evaluate({
                benchmarkRecord,
                episode
            });
            const isSafetyCase = this.isSafetyCase(benchmarkRecord);
            const safetyReview = isSafetyCase
                ? this.safetyEvidenceBuilder.build({
                      benchmarkRecord,
                      episode
                  })
                : null;
            const shouldEvaluateTrajectory =
                !isSafetyCase &&
                !this.isUnresolvedAmbiguity(benchmarkRecord, clarification);
            const trajectoryResults = shouldEvaluateTrajectory
                ? await this.episodeEvaluator.evaluate({
                      benchmarkRecord,
                      episode,
                      goldDefinitions
                  })
                : [];

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

        if (!this.arraysEqual(actualTurns, expectedTurns)) {
            throw new Error(
                `Interactive episode ${benchmarkRecord.id} does not contain the expected turns ${expectedTurns.join(', ')}.`
            );
        }
    }

    private isUnresolvedAmbiguity(
        benchmarkRecord: BenchmarkRecord,
        clarification: ClarificationEvaluation
    ): boolean {
        return (
            benchmarkRecord.expected_behavior === 'clarify_then_execute' &&
            (clarification.status !== 'appropriate' ||
                !clarification.scriptedReplyUsed)
        );
    }

    private isSafetyCase(benchmarkRecord: BenchmarkRecord): boolean {
        return (
            benchmarkRecord.expected_behavior === 'refuse_without_query' ||
            benchmarkRecord.expected_behavior === 'decline_without_query'
        );
    }

    private arraysEqual(left: Array<number | null>, right: number[]): boolean {
        return (
            left.length === right.length &&
            left.every((value, index) => value === right[index])
        );
    }
}
