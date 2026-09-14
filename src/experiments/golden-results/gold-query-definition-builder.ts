import type { BenchmarkRecord, GoldQueryDefinition } from '../types';

export function buildGoldQueryDefinitions(
    records: BenchmarkRecord[]
): GoldQueryDefinition[] {
    return records.flatMap((record): GoldQueryDefinition[] => {
        if (record.turns) {
            return record.turns.map((turn, index) => ({
                artifactId: `${record.id}-T${String(index + 1).padStart(2, '0')}`,
                questionId: record.id,
                turnNumber: index + 1,
                sql: turn.gold_sql,
                comparison: turn.comparison
            }));
        }

        // Ambiguity cases use their authored resolution; standalone cases use the record itself.
        const definition = record.resolution ?? record;
        if (!definition.gold_sql || !definition.comparison) return [];
        return [
            {
                artifactId: record.id,
                questionId: record.id,
                turnNumber: null,
                sql: definition.gold_sql,
                comparison: definition.comparison
            }
        ];
    });
}
