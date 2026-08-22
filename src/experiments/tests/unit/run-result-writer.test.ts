import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { RunResultWriter } from '../../runner/run-result-writer';

jest.mock('node:fs/promises', () => ({
    appendFile: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn()
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('RunResultWriter', () => {
    it('appends each completed interaction as one JSON line', async () => {
        const writer = new RunResultWriter();
        const runDirectory = path.join('test-output', 'repetition-1');
        const firstInteraction = interaction('CB200-E001', 'session-1');
        const secondInteraction = interaction('CB200-E002', 'session-2');

        const outputPath = await writer.appendInteraction(
            runDirectory,
            firstInteraction
        );
        await writer.appendInteraction(runDirectory, secondInteraction);

        expect(outputPath).toBe(path.join(runDirectory, 'interactions.jsonl'));
        expect(mkdir).toHaveBeenCalledTimes(2);
        expect(mkdir).toHaveBeenCalledWith(runDirectory, { recursive: true });
        expect(appendFile).toHaveBeenNthCalledWith(
            1,
            outputPath,
            `${JSON.stringify(firstInteraction)}\n`,
            'utf8'
        );
        expect(appendFile).toHaveBeenNthCalledWith(
            2,
            outputPath,
            `${JSON.stringify(secondInteraction)}\n`,
            'utf8'
        );
    });

    it('writes a candidate result as formatted JSON', async () => {
        const writer = new RunResultWriter();
        const outputDirectory = path.join(
            'test-output',
            'repetition-1',
            'candidate-results'
        );
        const result = {
            questionId: 'CB200-E001',
            turnNumber: null,
            interactionOrder: 1,
            attempt: 1,
            queryExecutionId: 'query-123',
            columns: [{ name: 'artist_count', type: 'bigint' }],
            rows: [['275']],
            rowCount: 1
        };

        const outputPath = await writer.writeCandidateResult(
            outputDirectory,
            'CB200-E001-T01-A01',
            result
        );

        expect(outputPath).toBe(
            path.join(outputDirectory, 'CB200-E001-T01-A01.json')
        );
        expect(mkdir).toHaveBeenCalledWith(outputDirectory, {
            recursive: true
        });
        expect(writeFile).toHaveBeenCalledWith(
            outputPath,
            `${JSON.stringify(result, null, 4)}\n`,
            'utf8'
        );
    });
});

function interaction(questionId: string, sessionId: string) {
    return {
        modelCondition: 'nova-lite',
        repetition: 1,
        questionId,
        difficulty: 'easy',
        category: 'single_table_count',
        turnNumber: null,
        interactionOrder: 1,
        inputType: 'question' as const,
        input: 'How many artists are in the catalogue?',
        sessionId,
        fallbackUsed: false,
        scriptedReplyUsed: false,
        response: {
            answer: 'There are 275 artists.',
            foundationModel: 'test-model',
            elapsedTimeSeconds: 1,
            tokenUsage: {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15
            },
            agentMetrics: {
                totalSteps: 1,
                modelInvocations: 1,
                actionInvocations: 1,
                retryCount: 0,
                firstAttemptSucceeded: true
            },
            sqlAttempts: [],
            traceEvents: []
        },
        candidateResults: []
    };
}
