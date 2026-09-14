import path from 'node:path';

import { writeJsonFile } from '../shared/json-file-writer';
import type { GoldenResultFile } from '../types';

export class GoldenResultWriter {
    public static async write(
        outputDirectory: string,
        artifactId: string,
        result: GoldenResultFile
    ): Promise<string> {
        const outputPath = path.join(outputDirectory, `${artifactId}.json`);
        await writeJsonFile(outputPath, result);

        return outputPath;
    }
}
