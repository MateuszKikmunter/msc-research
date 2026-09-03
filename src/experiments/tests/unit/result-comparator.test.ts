import { beforeEach, describe, expect, it } from '@jest/globals';

import { ResultComparator } from '../../evaluation/result-comparator';
import { ResultNormalizer } from '../../evaluation/result-normalizer';
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
    let resultComparator: ResultComparator;

    beforeEach(() => {
        resultComparator = new ResultComparator(new ResultNormalizer());
    });

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

        expect(resultComparator.compare(golden, candidate, comparison)).toEqual(
            {
                status: 'correct',
                reason: null
            }
        );
    });

    it('rejects approximate numbers outside the configured tolerance', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['6', '49.63'],
                ['26', '47.62']
            ]
        };

        expect(resultComparator.compare(golden, candidate, comparison)).toEqual(
            {
                status: 'incorrect',
                reason: 'Candidate result is missing an expected row.'
            }
        );
    });

    it('compares integer identifiers exactly regardless of numeric tolerance', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['7', '49.62'],
                ['26', '47.62']
            ]
        };

        expect(
            resultComparator.compare(golden, candidate, comparison).status
        ).toBe('incorrect');
    });

    it('compares ordered rows one by one when order matters', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [...golden.rows].reverse()
        };

        expect(
            resultComparator.compare(golden, candidate, {
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
            resultComparator.compare(duplicateGolden, candidate, comparison)
                .status
        ).toBe('incorrect');
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
            resultComparator.compare(nullGolden, candidate, {
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
            resultComparator.compare(timestampGolden, candidate, {
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

        expect(resultComparator.compare(golden, candidate, comparison)).toEqual(
            {
                status: 'incorrect',
                reason: 'Column count differs: expected 2, received 1.'
            }
        );
    });

    it('fails closed when a golden artifact is structurally invalid', () => {
        expect(
            resultComparator.compare(
                { ...golden, rowCount: 3 },
                golden,
                comparison
            )
        ).toEqual({
            status: 'evaluator_uncertain',
            reason: 'Invalid golden result: rowCount is 3, but 2 rows are stored.'
        });
    });

    it('rejects candidate values that cannot be normalized to the golden type', () => {
        const candidate: TabularResult = {
            ...golden,
            rows: [
                ['not-an-id', '49.62'],
                ['26', '47.62']
            ]
        };

        const result = resultComparator.compare(golden, candidate, comparison);

        expect(result.status).toBe('incorrect');
        expect(result.reason).toContain(
            'Candidate value does not match the expected type'
        );
    });
});
