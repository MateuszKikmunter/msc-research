import path from 'node:path';

import { readJsonFile } from '../shared/services/storage/json-file-reader';
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
        return readJsonFile<GoldenResultFile>(inputPath);
    }

    public async loadCandidateResult(
        relativePath: string
    ): Promise<CandidateResultFile> {
        return readJsonFile<CandidateResultFile>(
            path.join(this.runDirectory, relativePath)
        );
    }
}
