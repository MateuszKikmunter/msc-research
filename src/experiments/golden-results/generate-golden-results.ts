import path from 'node:path';

import {
    configureExperimentEnvironment,
    runExperimentCli
} from '../shared/experiment-cli';
import { BenchmarkLoader } from '../shared/services/benchmark/benchmark-loader';
import { GoldQueryDefinitionBuilder } from './gold-query-definition-builder';
import { GoldenResultGenerator } from './golden-result-generator';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');

async function main(): Promise<void> {
    configureExperimentEnvironment(REPOSITORY_ROOT);

    const benchmark = await BenchmarkLoader.load();
    const definitions = GoldQueryDefinitionBuilder.build(benchmark);
    await GoldenResultGenerator.generate(definitions);

    console.info(`Saved ${definitions.length} golden SQL results.`);
}

if (require.main === module) {
    runExperimentCli(main, 'Golden SQL generation failed.');
}
