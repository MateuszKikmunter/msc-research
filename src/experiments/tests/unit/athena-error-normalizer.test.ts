import { describe, expect, it } from '@jest/globals';

import { AthenaErrorNormalizer } from '../../evaluation/athena-error-normalizer';

describe('AthenaErrorNormalizer', () => {
    const normalizer = new AthenaErrorNormalizer();

    it.each([
        [
            "Athena query failed: COLUMN_NOT_FOUND: line 16:14: Column 'day' cannot be resolved",
            'COLUMN_NOT_FOUND:day'
        ],
        [
            'Athena query failed: TYPE_MISMATCH: line 3:20: value has an incompatible type',
            'TYPE_MISMATCH'
        ],
        [
            'Athena query failed: EXPRESSION_NOT_AGGREGATE: expression must be aggregate',
            'EXPRESSION_NOT_AGGREGATE'
        ],
        [
            "Athena query failed: AMBIGUOUS_NAME: Column 'customer_id' is ambiguous",
            'AMBIGUOUS_NAME:customer_id'
        ],
        [
            "Athena query failed: FUNCTION_NOT_FOUND: Function 'datediff' not registered",
            'FUNCTION_NOT_FOUND:datediff'
        ],
        [
            "Athena query failed: TABLE_NOT_FOUND: Table 'awsdatacatalog.chinook.support_reps' does not exist",
            'TABLE_NOT_FOUND:awsdatacatalog.chinook.support_reps'
        ],
        [
            'Athena query failed: NESTED_AGGREGATION: nested aggregations are not supported',
            'NESTED_AGGREGATION'
        ],
        [
            'Athena query failed: SOME_NEW_ERROR: line 1:2: unknown failure',
            'OTHER:SOME_NEW_ERROR'
        ],
        [
            'Athena query failed: SYNTAX_ERROR: line 1:1: unexpected token',
            'OTHER:SYNTAX_ERROR'
        ]
    ])('normalizes %s', (error, expected) => {
        expect(normalizer.normalize(error)).toBe(expected);
    });

    it('uses an unknown signature when no error code is present', () => {
        expect(normalizer.normalize('Unexpected Athena failure')).toBe(
            'OTHER:UNKNOWN'
        );
    });
});
