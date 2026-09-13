import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
    loadGoldenResult,
    loadCandidateResult
} from '../../evaluation/evaluation-input';

jest.mock('node:fs/promises', () => ({
    readFile: jest.fn()
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Result loading', () => {
    it('loads golden results from the shared golden-result directory', async () => {
        const result = {
            questionId: 'CB200-E001',
            turnNumber: null,
            columns: [{ name: 'artist_count', type: 'bigint' }],
            rows: [['275']],
            rowCount: 1
        };
        jest.mocked(readFile).mockResolvedValue(JSON.stringify(result));

        await expect(
            loadGoldenResult('golden-sql', 'CB200-E001')
        ).resolves.toEqual(result);
        expect(readFile).toHaveBeenCalledWith(
            path.join('golden-sql', 'CB200-E001.json'),
            'utf8'
        );
    });

    it('loads candidate results using the path saved in the interaction', async () => {
        const result = {
            questionId: 'CB200-E001',
            turnNumber: null,
            interactionOrder: 1,
            attempt: 1,
            queryExecutionId: 'query-1',
            columns: [{ name: 'artist_count', type: 'bigint' }],
            rows: [['275']],
            rowCount: 1
        };
        jest.mocked(readFile).mockResolvedValue(JSON.stringify(result));

        await expect(
            loadCandidateResult(
                'run',
                path.join('candidate-results', 'CB200-E001-T01-A01.json')
            )
        ).resolves.toEqual(result);
        expect(readFile).toHaveBeenCalledWith(
            path.join('run', 'candidate-results', 'CB200-E001-T01-A01.json'),
            'utf8'
        );
    });
});
