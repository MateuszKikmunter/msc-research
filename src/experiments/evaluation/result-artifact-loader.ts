import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CandidateResultFile, GoldenResultFile } from '../types';

export class ResultArtifactLoader {
    public constructor(
        private readonly goldenResultDirectory: string,
        private readonly runDirectory: string
    ) {}

    public async loadGoldenResult(
        artifactId: string
    ): Promise<GoldenResultFile> {
        const inputPath = path.join(
            this.goldenResultDirectory,
            `${artifactId}.json`
        );
        return this.load<GoldenResultFile>(inputPath);
    }

    public async loadCandidateResult(
        relativePath: string
    ): Promise<CandidateResultFile> {
        return this.load<CandidateResultFile>(
            path.join(this.runDirectory, relativePath)
        );
    }

    private async load<Result>(inputPath: string): Promise<Result> {
        const contents = await readFile(inputPath, 'utf8');
        return JSON.parse(contents) as Result;
    }
}
