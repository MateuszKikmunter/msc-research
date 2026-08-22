import path from 'node:path';

import type { GoldenResultFile, GoldQueryDefinition } from '../types';
import { AthenaService } from '../shared/services/athena/athena-service';
import { GoldSqlResolver } from './gold-sql-resolver';
import { GoldenResultWriter } from './golden-result-writer';

export class GoldenResultGenerator {
    private static readonly DEFAULT_OUTPUT_DIRECTORY = path.resolve(
        __dirname,
        '../runs/golden-sql'
    );

    public static async generate(
        definitions: GoldQueryDefinition[],
        athenaService = new AthenaService(),
        outputDirectory = GoldenResultGenerator.DEFAULT_OUTPUT_DIRECTORY
    ): Promise<void> {
        // Keep earlier query results so dependent turns can resolve SQL placeholders from them.
        const completedResults = new Map<string, GoldenResultFile>();
        for (const [index, definition] of definitions.entries()) {
            console.info(
                `[${index + 1}/${definitions.length}] Executing ${definition.artifactId}`
            );

            const sql = GoldSqlResolver.resolve(definition, completedResults);
            const queryResult = await athenaService.executeQuery(sql);
            const goldenResult: GoldenResultFile = {
                questionId: definition.questionId,
                turnNumber: definition.turnNumber,
                columns: queryResult.columns,
                rows: queryResult.rows,
                rowCount: queryResult.rowCount
            };

            const outputPath = await GoldenResultWriter.write(
                outputDirectory,
                definition.artifactId,
                goldenResult
            );
            completedResults.set(definition.artifactId, goldenResult);
            console.info(`Saved ${outputPath}`);
        }
    }
}
