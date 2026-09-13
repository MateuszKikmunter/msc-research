import path from 'node:path';

import type { BenchmarkRecord } from '../types';
import { readJsonFile } from './json-file-reader';

const DEFAULT_BENCHMARK_PATH = path.resolve(
    __dirname,
    '../../../benchmarks/chinook-bench-200.json'
);

export async function loadBenchmark(
    benchmarkPath = DEFAULT_BENCHMARK_PATH
): Promise<BenchmarkRecord[]> {
    return readJsonFile<BenchmarkRecord[]>(benchmarkPath);
}
