import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { RunInteractionLoader } from '../../evaluation/run-interaction-loader';
import { createStoredRunInteraction } from '../fixtures/run-interaction';

jest.mock('node:fs/promises', () => ({
    readFile: jest.fn()
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('RunInteractionLoader', () => {
    it('loads one interaction from each non-empty JSONL line', async () => {
        const firstInteraction = createStoredRunInteraction();
        const secondInteraction = createStoredRunInteraction({
            questionId: 'CB200-E002',
            sessionId: 'session-2'
        });
        jest.mocked(readFile).mockResolvedValue(
            `${JSON.stringify(firstInteraction)}\n\n${JSON.stringify(secondInteraction)}\n`
        );

        const interactions = await new RunInteractionLoader().load(
            'runs/nova-lite/repetition-1/interactions.jsonl'
        );

        expect(interactions).toEqual([firstInteraction, secondInteraction]);
    });

    it('reports the line containing invalid JSON', async () => {
        jest.mocked(readFile).mockResolvedValue(
            `${JSON.stringify(createStoredRunInteraction())}\n\nnot-json\n`
        );

        await expect(
            new RunInteractionLoader().load('interactions.jsonl')
        ).rejects.toThrow('Invalid interaction JSON on line 3.');
    });
});
