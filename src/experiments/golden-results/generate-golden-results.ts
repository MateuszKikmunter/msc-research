import path from 'node:path';

import {
    configureExperimentEnvironment,
    runExperimentCli
} from '../shared/experiment-cli';
import { loadBenchmark } from '../shared/benchmark-loader';
import { buildGoldQueryDefinitions } from './gold-query-definition-builder';
import { GoldenResultGenerator } from './golden-result-generator';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');

async function main(): Promise<void> {
    configureExperimentEnvironment(REPOSITORY_ROOT);

    const benchmark = await loadBenchmark();
    const definitions = buildGoldQueryDefinitions(benchmark);
    await GoldenResultGenerator.generate(definitions);

    console.info(`Saved ${definitions.length} golden SQL results.`);
}

if (require.main === module) {
    runExperimentCli(main, 'Golden SQL generation failed.');
}
