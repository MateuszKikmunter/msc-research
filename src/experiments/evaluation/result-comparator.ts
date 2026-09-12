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
        // Each candidate occurrence has one owner, so duplicates cannot be reused.
        // -1 means the candidate has not been assigned to a golden row yet.
        const goldenForCandidate = candidateRows.map(() => -1);

        const assignCandidate = (
            goldenIndex: number,
            visitedCandidates: Set<number>
        ): boolean => {
            for (const candidateIndex of candidateRows.keys()) {
                if (visitedCandidates.has(candidateIndex)) {
                    continue;
                }
                if (
                    !this.rowsEqual(
                        goldenRows[goldenIndex],
                        candidateRows[candidateIndex],
                        numericTolerance
                    )
                ) {
                    continue;
                }

                // Share visited candidates across recursive calls to avoid cycles.
                visitedCandidates.add(candidateIndex);
                const currentOwner = goldenForCandidate[candidateIndex];

                // Take a free candidate, or first move its owner to another match.
                // Tolerance can allow several matches, so earlier choices may move.
                if (
                    currentOwner === -1 ||
                    assignCandidate(currentOwner, visitedCandidates)
                ) {
                    goldenForCandidate[candidateIndex] = goldenIndex;
                    return true;
                }
            }

            // No rearrangement worked; existing assignments remain unchanged.
            return false;
        };

        for (const goldenIndex of goldenRows.keys()) {
            // Start a fresh search for each golden row; previous matches may move.
            if (!assignCandidate(goldenIndex, new Set<number>())) {
                return this.incorrect(
                    'Candidate result is missing an expected row.'
                );
            }
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
