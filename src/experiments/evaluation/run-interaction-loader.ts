import { readFile } from 'node:fs/promises';

import type { StoredRunInteraction } from '../types';

export class RunInteractionLoader {
    public async load(inputPath: string): Promise<StoredRunInteraction[]> {
        const contents = await readFile(inputPath, 'utf8');
        const interactions: StoredRunInteraction[] = [];

        for (const [index, line] of contents.split('\n').entries()) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                interactions.push(this.parseLine(trimmedLine, index + 1));
            }
        }

        return interactions;
    }

    private parseLine(line: string, lineNumber: number): StoredRunInteraction {
        try {
            return JSON.parse(line) as StoredRunInteraction;
        } catch (error) {
            throw new Error(`Invalid interaction JSON on line ${lineNumber}.`, {
                cause: error
            });
        }
    }
}
