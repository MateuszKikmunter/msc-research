import path from 'node:path';

import {
    configureExperimentEnvironment,
    runExperimentCli
} from '../shared/experiment-cli';
import { AthenaService } from '../shared/services/athena/athena-service';
import { BenchmarkLoader } from '../shared/services/benchmark/benchmark-loader';
import { AgentResponseInspector } from './agent-response-inspector';
import { CandidateResultCollector } from './candidate-result-collector';
import { EpisodeRunner } from './episode-runner';
import { QuestionRunner } from './question-runner';
import { RunResultWriter } from './run-result-writer';
import { ServerClient } from './server-client';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const EXPERIMENT_RUNS_DIRECTORY = path.resolve(__dirname, '../runs');
const DEFAULT_MODEL_CONDITION = 'nova-lite';
const DEFAULT_REPETITION = 1;

async function main(): Promise<void> {
    configureExperimentEnvironment(REPOSITORY_ROOT);

    const modelCondition =
        process.env.MODEL_CONDITION ?? DEFAULT_MODEL_CONDITION;
    const repetition = Number(
        process.env.REPETITION ?? String(DEFAULT_REPETITION)
    );
    const questionId = process.env.QUESTION_ID;

    const runDirectory = path.join(
        EXPERIMENT_RUNS_DIRECTORY,
        modelCondition,
        `repetition-${repetition}`
    );
    const athenaService = new AthenaService();
    const serverClient = new ServerClient();
    const responseInspector = new AgentResponseInspector();
    const runResultWriter = new RunResultWriter();
    const candidateResultCollector = new CandidateResultCollector(
        runDirectory,
        athenaService,
        responseInspector,
        runResultWriter
    );
    const episodeRunner = new EpisodeRunner(
        serverClient,
        candidateResultCollector,
        responseInspector
    );
    const questionRunner = new QuestionRunner(
        episodeRunner,
        runResultWriter,
        runDirectory
    );

    const benchmark = await BenchmarkLoader.load();
    const run = await questionRunner.run(
        benchmark,
        modelCondition,
        repetition,
        questionId
    );
    const outputPath = path.join(runDirectory, 'interactions.jsonl');

    console.info(
        `Saved ${run.interactions.length} interactions to ${outputPath}`
    );
}

if (require.main === module) {
    runExperimentCli(main, 'Benchmark execution failed.');
}
