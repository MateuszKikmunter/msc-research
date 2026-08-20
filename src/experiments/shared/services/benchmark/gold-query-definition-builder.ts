import type {
    BenchmarkRecord,
    ComparisonContract,
    GoldQueryDefinition
} from '../../../types';

export class GoldQueryDefinitionBuilder {
    public static build(records: BenchmarkRecord[]): GoldQueryDefinition[] {
        return records.flatMap((record) =>
            GoldQueryDefinitionBuilder.buildForRecord(record)
        );
    }

    private static buildForRecord(
        record: BenchmarkRecord
    ): GoldQueryDefinition[] {
        // detect interactive questions
        if (record.turns) {
            return record.turns.map((turn, index) => ({
                artifactId: `${record.id}-T${String(index + 1).padStart(2, '0')}`,
                questionId: record.id,
                turnNumber: index + 1,
                sql: turn.gold_sql,
                comparison: turn.comparison
            }));
        }

        // detect ambigious questions
        if (record.resolution) {
            return [
                GoldQueryDefinitionBuilder.createStandaloneDefinition(
                    record.id,
                    record.resolution.gold_sql,
                    record.resolution.comparison
                )
            ];
        }

        if (record.gold_sql && record.comparison) {
            return [
                GoldQueryDefinitionBuilder.createStandaloneDefinition(
                    record.id,
                    record.gold_sql,
                    record.comparison
                )
            ];
        }

        return [];
    }

    private static createStandaloneDefinition(
        questionId: string,
        sql: string,
        comparison: ComparisonContract
    ): GoldQueryDefinition {
        return {
            artifactId: questionId,
            questionId,
            turnNumber: null,
            sql,
            comparison
        };
    }
}
