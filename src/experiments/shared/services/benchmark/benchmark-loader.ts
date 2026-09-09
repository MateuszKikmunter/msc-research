import path from 'node:path';

import type { BenchmarkRecord } from '../../../types';
import { readJsonFile } from '../storage/json-file-reader';

export class BenchmarkLoader {
    private static readonly DEFAULT_BENCHMARK_PATH = path.resolve(
        __dirname,
        '../../../../../benchmarks/chinook-bench-200.json'
    );

    public static async load(
        benchmarkPath = BenchmarkLoader.DEFAULT_BENCHMARK_PATH
    ): Promise<BenchmarkRecord[]> {
        return readJsonFile<BenchmarkRecord[]>(benchmarkPath);
    }
}
