import type {
    ComparisonContract,
    ResultComparison,
    TabularResult
} from '../types';
import { getErrorMessage } from '../shared/error-message';
import {
    ResultNormalizer,
    type NormalizedRow,
    type NormalizedValue
} from './result-normalizer';

export class ResultComparator {
    public constructor(private readonly resultNormalizer: ResultNormalizer) {}

    public compare(
        golden: TabularResult,
        candidate: TabularResult,
        contract: ComparisonContract
    ): ResultComparison {
        const validationResult = this.validate(golden, candidate, contract);
        if (validationResult) {
            return validationResult;
        }

        let goldenRows: NormalizedRow[];
        try {
            goldenRows = golden.rows.map((row) =>
                this.resultNormalizer.normalizeRow(row, golden.columns)
            );
        } catch (error) {
            return this.uncertain(
                `Could not normalize golden result: ${getErrorMessage(error)}`
            );
        }

        let candidateRows: NormalizedRow[];
        try {
            // Golden types define the expected semantic type at every positional column.
            candidateRows = candidate.rows.map((row) =>
                this.resultNormalizer.normalizeRow(row, golden.columns)
            );
        } catch (error) {
            return this.incorrect(
                `Candidate value does not match the expected type: ${getErrorMessage(error)}`
            );
        }

        return contract.orderMatters
            ? this.compareOrderedRows(
                  goldenRows,
                  candidateRows,
                  contract.numericTolerance
              )
            : this.compareUnorderedRows(
                  goldenRows,
                  candidateRows,
                  contract.numericTolerance
              );
    }

    private validate(
        golden: TabularResult,
        candidate: TabularResult,
        contract: ComparisonContract
    ): ResultComparison | undefined {
        const goldenStructureError = this.getStructureError(golden);
        if (goldenStructureError) {
            return this.uncertain(
                `Invalid golden result: ${goldenStructureError}`
            );
        }

        const candidateStructureError = this.getStructureError(candidate);
        if (candidateStructureError) {
            return this.uncertain(
                `Invalid candidate result: ${candidateStructureError}`
            );
        }

        if (golden.columns.length !== contract.requiredColumns.length) {
            return this.uncertain(
                'Golden column count does not match requiredColumns.'
            );
        }

        if (candidate.columns.length !== contract.requiredColumns.length) {
            return this.incorrect(
                `Column count differs: expected ${contract.requiredColumns.length}, received ${candidate.columns.length}.`
            );
        }

        if (candidate.rows.length !== golden.rows.length) {
            return this.incorrect(
                `Row count differs: expected ${golden.rows.length}, received ${candidate.rows.length}.`
            );
        }
    }

    private getStructureError(result: TabularResult): string | null {
        if (result.rowCount !== result.rows.length) {
            return `rowCount is ${result.rowCount}, but ${result.rows.length} rows are stored.`;
        }

        const invalidRowIndex = result.rows.findIndex(
            (row) => row.length !== result.columns.length
        );
        if (invalidRowIndex >= 0) {
            return `row ${invalidRowIndex + 1} has ${result.rows[invalidRowIndex].length} values for ${result.columns.length} columns.`;
        }

        return null;
    }

    private compareOrderedRows(
        goldenRows: NormalizedRow[],
        candidateRows: NormalizedRow[],
        numericTolerance: number
    ): ResultComparison {
        for (let index = 0; index < goldenRows.length; index += 1) {
            if (
                !this.rowsEqual(
                    goldenRows[index],
                    candidateRows[index],
                    numericTolerance
                )
            ) {
                return this.incorrect(`Ordered row ${index + 1} differs.`);
            }
        }

        return this.correct();
    }

    private compareUnorderedRows(
        goldenRows: NormalizedRow[],
        candidateRows: NormalizedRow[],
        numericTolerance: number
    ): ResultComparison {
        const unmatchedCandidateRows = [...candidateRows];

        for (const goldenRow of goldenRows) {
            const matchingIndex = unmatchedCandidateRows.findIndex(
                (candidateRow) =>
                    this.rowsEqual(goldenRow, candidateRow, numericTolerance)
            );

            if (matchingIndex < 0) {
                return this.incorrect(
                    'Candidate result is missing an expected row.'
                );
            }

            // Removing a matched row ensures duplicate occurrences are counted separately.
            unmatchedCandidateRows.splice(matchingIndex, 1);
        }

        if (unmatchedCandidateRows.length > 0) {
            return this.incorrect(
                'Candidate result contains an unexpected row.'
            );
        }

        return this.correct();
    }

    private rowsEqual(
        golden: NormalizedRow,
        candidate: NormalizedRow,
        numericTolerance: number
    ): boolean {
        return golden.every((value, index) =>
            this.valuesEqual(value, candidate[index], numericTolerance)
        );
    }

    private valuesEqual(
        golden: NormalizedValue,
        candidate: NormalizedValue,
        numericTolerance: number
    ): boolean {
        if (golden.kind !== candidate.kind) {
            return false;
        }

        if (golden.kind === 'null' || candidate.kind === 'null') {
            return golden.kind === candidate.kind;
        }

        if (golden.kind === 'number' && candidate.kind === 'number') {
            // Equivalent SQL can produce small floating-point differences, so compare
            // numeric distance using the tolerance defined by the benchmark contract.
            return Math.abs(golden.value - candidate.value) <= numericTolerance;
        }

        return golden.value === candidate.value;
    }

    private correct(): ResultComparison {
        return { status: 'correct', reason: null };
    }

    private incorrect(reason: string): ResultComparison {
        return { status: 'incorrect', reason };
    }

    private uncertain(reason: string): ResultComparison {
        return { status: 'evaluator_uncertain', reason };
    }
}
