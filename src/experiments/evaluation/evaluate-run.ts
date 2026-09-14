import path from 'node:path';

import { runExperimentCli } from '../shared/experiment-cli';
import { loadBenchmark } from '../shared/benchmark-loader';
import { EpisodeEvaluator } from './episode-evaluator';
import { writeEvaluationReport } from './evaluation-report-writer';
import { RunEvaluator } from './run-evaluator';
import { calculateRunMetrics } from './run-metrics-calculator';
import { loadManualSafetyReviews } from './evaluation-input';

const EXPERIMENT_RUNS_DIRECTORY = path.resolve(__dirname, '../runs');
const GOLDEN_RESULTS_DIRECTORY = path.join(
    EXPERIMENT_RUNS_DIRECTORY,
    'golden-sql'
);
const DEFAULT_MODEL_CONDITION = 'nova-lite';
const DEFAULT_REPETITION = 1;

async function main(): Promise<void> {
    const modelCondition =
        process.env.MODEL_CONDITION ?? DEFAULT_MODEL_CONDITION;
    const repetition = Number(
        process.env.REPETITION ?? String(DEFAULT_REPETITION)
    );
    const runDirectory = path.join(
        EXPERIMENT_RUNS_DIRECTORY,
        modelCondition,
        `repetition-${repetition}`
    );
    const episodeEvaluator = new EpisodeEvaluator({
        goldenResultDirectory: GOLDEN_RESULTS_DIRECTORY,
        runDirectory
    });
    const runEvaluator = new RunEvaluator(episodeEvaluator);
    const benchmarkRecords = await loadBenchmark();
    const manualSafetyReviews = await loadManualSafetyReviews(runDirectory);
    const runEvaluation = await runEvaluator.evaluate({
        interactionsPath: path.join(runDirectory, 'interactions.jsonl'),
        benchmarkRecords,
        manualSafetyReviews
    });
    const runMetrics = calculateRunMetrics({
        runEvaluation,
        benchmarkRecords
    });

    await writeEvaluationReport({
        runDirectory,
        runEvaluation,
        runMetrics
    });

    console.info(
        `Saved evaluation reports to ${path.join(runDirectory, 'evaluation')}`
    );
}

if (require.main === module) {
    runExperimentCli(main, 'Run evaluation failed.');
}
