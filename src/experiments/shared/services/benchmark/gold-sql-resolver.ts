import type { GoldenResultFile, GoldQueryDefinition } from '../../../types';

type BindingValueType = 'integer' | 'string';

interface GoldBinding {
    placeholder: string;
    sourceArtifactId: string;
    sourceColumn: string;
    sourceRow: number;
    valueType: BindingValueType;
}

export class GoldSqlResolver {
    private static readonly BINDINGS: Readonly<Record<string, GoldBinding[]>> =
        {
            'CB200-C001-T02': [
                {
                    placeholder: 'previous_genre_name',
                    sourceArtifactId: 'CB200-C001-T01',
                    sourceColumn: 'name',
                    sourceRow: 0,
                    valueType: 'string'
                }
            ],
            'CB200-C002-T02': [
                {
                    placeholder: 'previous_artist_id',
                    sourceArtifactId: 'CB200-C002-T01',
                    sourceColumn: 'artist_id',
                    sourceRow: 0,
                    valueType: 'integer'
                }
            ]
        };

    public static resolve(
        definition: GoldQueryDefinition,
        completedResults: ReadonlyMap<string, GoldenResultFile>
    ): string {
        const bindings = GoldSqlResolver.BINDINGS[definition.artifactId] ?? [];
        let sql = definition.sql;

        for (const binding of bindings) {
            const value = GoldSqlResolver.getBindingValue(
                binding,
                completedResults
            );
            const token = `:${binding.placeholder}`;

            if (!sql.includes(token)) {
                throw new Error(
                    `${definition.artifactId} does not contain expected placeholder ${token}.`
                );
            }

            sql = sql.replaceAll(
                token,
                GoldSqlResolver.toSqlLiteral(value, binding.valueType)
            );
        }

        const unresolved = sql.match(/:[A-Za-z_][A-Za-z0-9_]*/);
        if (unresolved) {
            throw new Error(
                `${definition.artifactId} contains unresolved placeholder ${unresolved[0]}.`
            );
        }

        return sql;
    }

    private static getBindingValue(
        binding: GoldBinding,
        completedResults: ReadonlyMap<string, GoldenResultFile>
    ): string {
        const source = completedResults.get(binding.sourceArtifactId);
        if (!source) {
            throw new Error(
                `Golden result ${binding.sourceArtifactId} is required before resolving ${binding.placeholder}.`
            );
        }

        const columnIndex = source.columns.findIndex(
            (column) => column.name === binding.sourceColumn
        );
        if (columnIndex === -1) {
            throw new Error(
                `Column ${binding.sourceColumn} is missing from ${binding.sourceArtifactId}.`
            );
        }

        const value = source.rows[binding.sourceRow]?.[columnIndex];
        if (value === null || value === undefined) {
            throw new Error(
                `Value for ${binding.placeholder} is missing from ${binding.sourceArtifactId}.`
            );
        }

        return value;
    }

    private static toSqlLiteral(
        value: string,
        valueType: BindingValueType
    ): string {
        if (valueType === 'integer') {
            if (!/^-?\d+$/.test(value)) {
                throw new Error(
                    `Expected an integer binding value but received ${value}.`
                );
            }

            return value;
        }

        return `'${value.replaceAll("'", "''")}'`;
    }
}
