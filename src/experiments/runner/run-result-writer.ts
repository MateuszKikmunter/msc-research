import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
        await mkdir(outputDirectory, { recursive: true });

        const outputPath = path.join(outputDirectory, `${artifactId}.json`);
        await this.writeJson(outputPath, result);
        return outputPath;
    }

    private async writeJson(outputPath: string, value: unknown): Promise<void> {
        await writeFile(
            outputPath,
            `${JSON.stringify(value, null, 4)}\n`,
            'utf8'
        );
    }
}
