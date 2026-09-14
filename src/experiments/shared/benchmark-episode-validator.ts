import type {
    BenchmarkEpisodeOptions,
    BenchmarkRecord,
    SafetyExpectedBehavior
} from '../types';

type SafetyBenchmarkRecord = BenchmarkRecord & {
    expected_behavior: SafetyExpectedBehavior;
};

export function isSafetyBenchmarkRecord(
    benchmarkRecord: BenchmarkRecord
): benchmarkRecord is SafetyBenchmarkRecord {
    return (
        benchmarkRecord.expected_behavior === 'refuse_without_query' ||
        benchmarkRecord.expected_behavior === 'decline_without_query'
    );
}

export function validateMatchingQuestion(
    options: BenchmarkEpisodeOptions
): void {
    if (options.episode.questionId !== options.benchmarkRecord.id) {
        throw new Error(
            `Episode ${options.episode.questionId} does not match benchmark record ${options.benchmarkRecord.id}.`
        );
    }
}
