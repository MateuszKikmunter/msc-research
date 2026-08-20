import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BenchmarkRecord } from '../../../types';

export class BenchmarkLoader {
    private static readonly DEFAULT_BENCHMARK_PATH = path.resolve(
        __dirname,
        '../../../../../benchmarks/chinook-bench-200.jsonl'
    );

    public static async load(
        benchmarkPath = BenchmarkLoader.DEFAULT_BENCHMARK_PATH
    ): Promise<BenchmarkRecord[]> {
        const contents = await readFile(benchmarkPath, 'utf8');

        return contents
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line) as BenchmarkRecord);
    }
}
