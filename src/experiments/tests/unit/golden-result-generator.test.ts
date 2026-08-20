import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { GoldQueryDefinition } from '../../types';
import type { AthenaService } from '../../shared/services/athena/athena-service';
import { GoldenResultGenerator } from '../../shared/services/golden-results/golden-result-generator';
import { GoldenResultWriter } from '../../shared/services/golden-results/golden-result-writer';

const OUTPUT_DIRECTORY = 'golden-results';
const OUTPUT_PATH = `${OUTPUT_DIRECTORY}/CB200-E001.json`;

afterEach(() => {
    jest.restoreAllMocks();
});

describe('GoldenResultGenerator', () => {
    it('executes and saves each supplied golden definition', async () => {
        const definition: GoldQueryDefinition = {
            artifactId: 'CB200-E001',
            questionId: 'CB200-E001',
            turnNumber: null,
            sql: 'SELECT COUNT(*) AS artist_count FROM artists',
            comparison: {
                mode: 'exact_result',
                requiredColumns: ['artist_count'],
                orderMatters: false,
                columnOrderMatters: true,
                preserveDuplicates: true,
                numericTolerance: 0.000001,
                rowLimit: null,
                topNTiePolicy: null,
                compareColumnNames: false,
                allowExtraColumns: false
            }
        };
        const executeQuery = jest.fn(async () => ({
            queryExecutionId: 'query-1',
            columns: [{ name: 'artist_count', type: 'bigint' }],
            rows: [['275']],
            rowCount: 1
        }));
        const athenaService = { executeQuery } as unknown as AthenaService;
        const writeResult = jest
            .spyOn(GoldenResultWriter, 'write')
            .mockResolvedValue(OUTPUT_PATH);

        await GoldenResultGenerator.generate(
            [definition],
            athenaService,
            OUTPUT_DIRECTORY
        );

        expect(executeQuery).toHaveBeenCalledWith(definition.sql);
        expect(writeResult).toHaveBeenCalledWith(
            OUTPUT_DIRECTORY,
            definition.artifactId,
            {
                questionId: definition.questionId,
                turnNumber: definition.turnNumber,
                columns: [{ name: 'artist_count', type: 'bigint' }],
                rows: [['275']],
                rowCount: 1
            }
        );
    });
});
