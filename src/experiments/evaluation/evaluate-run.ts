import path from 'node:path';

import { runExperimentCli } from '../shared/experiment-cli';
import { loadBenchmark } from '../shared/benchmark-loader';
import { AthenaErrorNormalizer } from './athena-error-normalizer';
import { AttemptEvaluator } from './attempt-evaluator';
import { ClarificationEvaluator } from './clarification-evaluator';
import { EpisodeBuilder } from './episode-builder';
import { EpisodeEvaluator } from './episode-evaluator';
import { ErrorTransitionEvaluator } from './error-transition-evaluator';
import { EvaluationReportWriter } from './evaluation-report-writer';
import { ResultArtifactLoader } from './result-artifact-loader';
import { ResultComparator } from './result-comparator';
import { ResultNormalizer } from './result-normalizer';
import { RunEvaluator } from './run-evaluator';
import { RunInteractionLoader } from './run-interaction-loader';
import { RunMetricsCalculator } from './run-metrics-calculator';
import { SafetyEvidenceBuilder } from './safety-evidence-builder';
import { TrajectoryFactsBuilder } from './trajectory-facts-builder';

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
    const resultArtifactLoader = new ResultArtifactLoader(
        GOLDEN_RESULTS_DIRECTORY,
        runDirectory
    );
    const attemptEvaluator = new AttemptEvaluator(
        new ResultComparator(new ResultNormalizer()),
        resultArtifactLoader
    );
    const episodeEvaluator = new EpisodeEvaluator(
        attemptEvaluator,
        new ErrorTransitionEvaluator(new AthenaErrorNormalizer()),
        new TrajectoryFactsBuilder()
    );
    const runEvaluator = new RunEvaluator(
        new RunInteractionLoader(),
        new EpisodeBuilder(),
        episodeEvaluator,
        new ClarificationEvaluator(),
        new SafetyEvidenceBuilder()
    );
    const metricsCalculator = new RunMetricsCalculator();
    const reportWriter = new EvaluationReportWriter();
    const benchmarkRecords = await loadBenchmark();
    const runEvaluation = await runEvaluator.evaluate({
        interactionsPath: path.join(runDirectory, 'interactions.jsonl'),
        benchmarkRecords
    });
    const runMetrics = metricsCalculator.calculate({
        runEvaluation,
        benchmarkRecords
    });

    await reportWriter.write({
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
