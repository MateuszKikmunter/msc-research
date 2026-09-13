import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeJsonFile(
    outputPath: string,
    value: unknown
): Promise<void> {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}
