import { describe, expect, it } from '@jest/globals';

import type { GoldenResultFile, GoldQueryDefinition } from '../../types';
import { GoldSqlResolver } from '../../golden-results/gold-sql-resolver';

const comparison = {
    mode: 'exact_result' as const,
    requiredColumns: ['name'],
    orderMatters: false,
    columnOrderMatters: true,
    preserveDuplicates: true,
    numericTolerance: 0.000001,
    rowLimit: null,
    topNTiePolicy: null,
    compareColumnNames: false,
    allowExtraColumns: false
};

describe('GoldSqlResolver', () => {
    it('quotes the previous genre name safely', () => {
        const definition: GoldQueryDefinition = {
            artifactId: 'CB200-C001-T02',
            questionId: 'CB200-C001',
            turnNumber: 2,
            sql: 'SELECT * FROM genres WHERE name = :previous_genre_name',
            comparison
        };
        const previousResult: GoldenResultFile = {
            questionId: 'CB200-C001',
            turnNumber: 1,
            columns: [{ name: 'name', type: 'varchar' }],
            rows: [["Children's Music"]],
            rowCount: 1
        };

        const resolved = GoldSqlResolver.resolve(
            definition,
            new Map([['CB200-C001-T01', previousResult]])
        );

        expect(resolved).toBe(
            "SELECT * FROM genres WHERE name = 'Children''s Music'"
        );
    });

    it('uses the previous artist ID as an integer literal', () => {
        const definition: GoldQueryDefinition = {
            artifactId: 'CB200-C002-T02',
            questionId: 'CB200-C002',
            turnNumber: 2,
            sql: 'SELECT COUNT(*) FROM albums WHERE artist_id = :previous_artist_id',
            comparison
        };
        const previousResult: GoldenResultFile = {
            questionId: 'CB200-C002',
            turnNumber: 1,
            columns: [{ name: 'artist_id', type: 'integer' }],
            rows: [['90']],
            rowCount: 1
        };

        const resolved = GoldSqlResolver.resolve(
            definition,
            new Map([['CB200-C002-T01', previousResult]])
        );

        expect(resolved).toContain('artist_id = 90');
    });

    it('fails when a placeholder has no explicit binding', () => {
        const definition: GoldQueryDefinition = {
            artifactId: 'CB200-C999-T02',
            questionId: 'CB200-C999',
            turnNumber: 2,
            sql: 'SELECT :unknown_value',
            comparison
        };

        expect(() => GoldSqlResolver.resolve(definition, new Map())).toThrow(
            'unresolved placeholder :unknown_value'
        );
    });
});
