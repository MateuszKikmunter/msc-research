import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { writeJsonFile } from '../shared/json-file-writer';
import type { CandidateResultFile, StoredRunInteraction } from '../types';

export class RunResultWriter {
    public async appendInteraction(
        runDirectory: string,
        interaction: StoredRunInteraction
    ): Promise<string> {
        await mkdir(runDirectory, { recursive: true });

        const outputPath = path.join(runDirectory, 'interactions.jsonl');
        await appendFile(
            outputPath,
            `${JSON.stringify(interaction)}\n`,
            'utf8'
        );
        return outputPath;
    }

    public async writeCandidateResult(
        outputDirectory: string,
        artifactId: string,
        result: CandidateResultFile
    ): Promise<string> {
        const outputPath = path.join(outputDirectory, `${artifactId}.json`);
        await writeJsonFile(outputPath, result);
        return outputPath;
    }
}
