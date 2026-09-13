import { describe, expect, it } from '@jest/globals';

import { compareResults } from '../../evaluation/result-comparator';
import type { ComparisonContract, TabularResult } from '../../types';

const comparison: ComparisonContract = {
    mode: 'exact_result',
    requiredColumns: ['customer_id', 'revenue'],
    orderMatters: false,
    columnOrderMatters: true,
    preserveDuplicates: true,
    numericTolerance: 0.000001,
    rowLimit: null,
    topNTiePolicy: null,
    compareColumnNames: false,
    allowExtraColumns: false
};

const golden: TabularResult = {
    columns: [
        { name: 'customer_id', type: 'integer' },
        { name: 'revenue', type: 'double' }
    ],
    rows: [
        ['6', '49.62'],
        ['26', '47.62']
    ],
    rowCount: 2
};

describe('ResultComparator', () => {
    it('compares unordered rows by position while ignoring aliases', () => {
        const candidate: TabularResult = {
            columns: [
                { name: 'id', type: 'bigint' },
                { name: 'total_revenue', type: 'decimal(10,2)' }
            ],
            rows: [
                ['26', '47.6200004'],
                ['6', '49.6200004']
            ],
            rowCount: 2
        };

        expect(compareResults(golden, candidate, comparison)).toEqual({
            status: 'correct',
            reason: null
        });
    });

    it('rejects approximate numbers outside the configured tolerance', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['6', '49.63'],
                ['26', '47.62']
            ]
        };

        expect(compareResults(golden, candidate, comparison)).toEqual({
            status: 'incorrect',
            reason: 'Candidate result is missing an expected row.'
        });
    });

    it('compares integer identifiers exactly regardless of numeric tolerance', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['7', '49.62'],
                ['26', '47.62']
            ]
        };

        expect(compareResults(golden, candidate, comparison).status).toBe(
            'incorrect'
        );
    });

    it('compares ordered rows one by one when order matters', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [...golden.rows].reverse()
        };

        expect(
            compareResults(golden, candidate, {
                ...comparison,
                orderMatters: true
            })
        ).toEqual({
            status: 'incorrect',
            reason: 'Ordered row 1 differs.'
        });
    });

    it('preserves duplicate row counts in unordered comparisons', () => {
        const duplicateGolden: TabularResult = {
            ...golden,
            rows: [
                ['6', '49.62'],
                ['6', '49.62'],
                ['26', '47.62']
            ],
            rowCount: 3
        };
        const candidate: TabularResult = {
            ...duplicateGolden,
            rows: [
                ['6', '49.62'],
                ['26', '47.62'],
                ['26', '47.62']
            ]
        };

        expect(
            compareResults(duplicateGolden, candidate, comparison).status
        ).toBe('incorrect');
    });

    it('finds a one-to-one match regardless of row order when tolerances overlap', () => {
        const result = (values: string[]): TabularResult => ({
            columns: [{ name: 'value', type: 'double' }],
            rows: values.map((value) => [value]),
            rowCount: values.length
        });
        const contract = { ...comparison, requiredColumns: ['value'] };

        for (const goldenValues of [
            ['0.000001', '0'],
            ['0', '0.000001']
        ]) {
            for (const candidateValues of [
                ['0', '0.000002'],
                ['0.000002', '0']
            ]) {
                expect(
                    compareResults(
                        result(goldenValues),
                        result(candidateValues),
                        contract
                    )
                ).toEqual({ status: 'correct', reason: null });
            }
        }
    });

    it('rejects overlapping matches when no distinct candidate exists for every row', () => {
        const result = (values: string[]): TabularResult => ({
            columns: [{ name: 'value', type: 'double' }],
            rows: values.map((value) => [value]),
            rowCount: values.length
        });

        expect(
            compareResults(
                result(['0', '0', '0.000003']),
                result(['0.000001', '0.000003', '0.000003']),
                { ...comparison, requiredColumns: ['value'] }
            ).status
        ).toBe('incorrect');
    });

    it('can reassign multiple earlier matches across numeric columns', () => {
        const columns = [
            { name: 'x', type: 'double' },
            { name: 'y', type: 'double' }
        ];
        const goldenResult: TabularResult = {
            columns,
            rows: [
                ['0.125', '0'],
                ['0.25', '0.125'],
                ['0', '0']
            ],
            rowCount: 3
        };
        const candidate: TabularResult = {
            columns,
            rows: [
                ['0', '0'],
                ['0.25', '0'],
                ['0.375', '0.25']
            ],
            rowCount: 3
        };

        expect(
            compareResults(goldenResult, candidate, {
                ...comparison,
                requiredColumns: ['x', 'y'],
                numericTolerance: 0.125
            })
        ).toEqual({ status: 'correct', reason: null });
    });

    it('keeps NULL distinct from an empty string', () => {
        const nullGolden: TabularResult = {
            columns: [{ name: 'company', type: 'varchar' }],
            rows: [[null]],
            rowCount: 1
        };
        const candidate: TabularResult = {
            columns: [{ name: 'company_name', type: 'varchar' }],
            rows: [['']],
            rowCount: 1
        };

        expect(
            compareResults(nullGolden, candidate, {
                ...comparison,
                requiredColumns: ['company']
            }).status
        ).toBe('incorrect');
    });

    it('accepts timestamps returned in the Athena result format', () => {
        const timestampGolden: TabularResult = {
            columns: [{ name: 'invoice_date', type: 'timestamp' }],
            rows: [['2013-01-01 00:00:00.000']],
            rowCount: 1
        };
        const candidate: TabularResult = {
            columns: [{ name: 'date', type: 'varchar' }],
            rows: [['2013-01-01 00:00:00.000']],
            rowCount: 1
        };

        expect(
            compareResults(timestampGolden, candidate, {
                ...comparison,
                requiredColumns: ['invoice_date']
            })
        ).toEqual({ status: 'correct', reason: null });
    });

    it('rejects a candidate with the wrong column count', () => {
        const candidate: TabularResult = {
            columns: [{ name: 'customer_id', type: 'integer' }],
            rows: [['6'], ['26']],
            rowCount: 2
        };

        expect(compareResults(golden, candidate, comparison)).toEqual({
            status: 'incorrect',
            reason: 'Column count differs: expected 2, received 1.'
        });
    });

    it('accepts valid empty results and null cells', () => {
        for (const rows of [[], [[null, null]]] as TabularResult['rows'][]) {
            const result = { ...golden, rows, rowCount: rows.length };
            expect(compareResults(result, result, comparison)).toEqual({
                status: 'correct',
                reason: null
            });
        }
    });

    it('rejects candidate values that cannot be normalized to the golden type', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['not-an-id', '49.62'],
                ['26', '47.62']
            ]
        };

        const result = compareResults(golden, candidate, comparison);

        expect(result.status).toBe('incorrect');
        expect(result.reason).toContain(
            'Candidate value does not match the expected type'
        );
    });
});
