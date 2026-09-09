import { readFile } from 'node:fs/promises';

export async function readJsonFile<Result>(inputPath: string): Promise<Result> {
    const contents = await readFile(inputPath, 'utf8');
    return JSON.parse(contents) as Result;
}
