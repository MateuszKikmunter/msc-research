import path from 'node:path';
import { config } from 'dotenv';

import { BenchmarkLoader } from '../shared/services/benchmark/benchmark-loader';
import { GoldQueryDefinitionBuilder } from './gold-query-definition-builder';
import { GoldenResultGenerator } from './golden-result-generator';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');

async function main(): Promise<void> {
    config({ path: path.join(REPOSITORY_ROOT, '.env') });

    const benchmark = await BenchmarkLoader.load();
    const definitions = GoldQueryDefinitionBuilder.build(benchmark);
    await GoldenResultGenerator.generate(definitions);

    console.info(`Saved ${definitions.length} golden SQL results.`);
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error('Golden SQL generation failed.', error);
        process.exitCode = 1;
    });
}
