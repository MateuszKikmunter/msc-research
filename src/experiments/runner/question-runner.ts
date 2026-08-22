import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import type {
    BenchmarkRecord,
    ExperimentRunSummary,
    RunInteraction,
    StoredRunInteraction
} from '../types';
import { EpisodeRunner } from './episode-runner';
import { RunResultWriter } from './run-result-writer';

export class QuestionRunner {
    private readonly episodeRunner: EpisodeRunner;
    private readonly runResultWriter: RunResultWriter;
    private readonly runDirectory: string;

    public constructor(
        episodeRunner: EpisodeRunner,
        runResultWriter: RunResultWriter,
        runDirectory: string
    ) {
        this.episodeRunner = episodeRunner;
        this.runResultWriter = runResultWriter;
        this.runDirectory = runDirectory;
    }

    public async run(
        benchmark: BenchmarkRecord[],
        modelCondition: string,
        repetition: number,
        questionId?: string
    ): Promise<ExperimentRunSummary> {
        const startedAt = new Date().toISOString();
        const interactions: RunInteraction[] = [];

        for (const [index, benchmarkRecord] of this.runSingleQuestion(
            benchmark,
            questionId
        ).entries()) {
            if (index > 0) {
                console.info(
                    'Waiting 5 seconds before executing the next benchmark...'
                );
                await setTimeout(5000);
            }

            const sessionId = randomUUID();
            console.info(
                `[${index + 1}/${benchmark.length}] Executing ${benchmarkRecord.id}`
            );

            try {
                const completedInteractions = await this.episodeRunner.run(
                    benchmarkRecord,
                    sessionId
                );

                for (const interaction of completedInteractions) {
                    const storedInteraction: StoredRunInteraction = {
                        modelCondition,
                        repetition,
                        ...interaction
                    };
                    await this.runResultWriter.appendInteraction(
                        this.runDirectory,
                        storedInteraction
                    );
                    interactions.push(interaction);
                }
            } catch (error) {
                throw new Error(
                    `Benchmark execution stopped at ${benchmarkRecord.id} (session ${sessionId}).`,
                    { cause: error }
                );
            }
        }

        return {
            modelCondition,
            repetition,
            startedAt,
            completedAt: new Date().toISOString(),
            interactions
        };
    }

    private runSingleQuestion(
        benchmark: BenchmarkRecord[],
        questionId?: string
    ) {
        if (!questionId) {
            return benchmark;
        }

        return benchmark.filter((record) => record.id === questionId);
    }
}
