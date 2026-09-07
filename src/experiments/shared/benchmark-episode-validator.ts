import type { BenchmarkEpisodeOptions } from '../types';

export function validateMatchingQuestion(
    options: BenchmarkEpisodeOptions
): void {
    if (options.episode.questionId !== options.benchmarkRecord.id) {
        throw new Error(
            `Episode ${options.episode.questionId} does not match benchmark record ${options.benchmarkRecord.id}.`
        );
    }
}
