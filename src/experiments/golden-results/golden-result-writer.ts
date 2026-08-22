import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GoldenResultFile } from '../types';

export class GoldenResultWriter {
    public static async write(
        outputDirectory: string,
        artifactId: string,
        result: GoldenResultFile
    ): Promise<string> {
        await mkdir(outputDirectory, { recursive: true });

        const outputPath = path.join(outputDirectory, `${artifactId}.json`);
        await writeFile(
            outputPath,
            `${JSON.stringify(result, null, 4)}\n`,
            'utf8'
        );

        return outputPath;
    }
}
