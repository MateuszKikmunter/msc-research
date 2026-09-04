import type { SqlAttempt } from '../../backend/types';
import type {
    AttemptEvaluation,
    CandidateResultReference,
    GoldQueryDefinition,
    StoredRunInteraction
} from '../types';
import { ResultArtifactLoader } from './result-artifact-loader';
import { ResultComparator } from './result-comparator';

interface EvaluateAttemptsOptions {
    interaction: StoredRunInteraction;
    goldDefinition: GoldQueryDefinition;
}

interface EvaluateAttemptOptions extends EvaluateAttemptsOptions {
    attempt: SqlAttempt;
}

interface UncertainAttemptOptions {
    interaction: StoredRunInteraction;
    attempt: SqlAttempt;
    reference: CandidateResultReference | null;
    reason: string;
}

export class AttemptEvaluator {
    public constructor(
        private readonly resultComparator: ResultComparator,
        private readonly resultArtifactLoader: ResultArtifactLoader
    ) {}

    public async evaluate(
        options: EvaluateAttemptsOptions
    ): Promise<AttemptEvaluation[]> {
        const attempts = [...options.interaction.response.sqlAttempts].sort(
            (left, right) => left.attempt - right.attempt
        );
        const evaluations: AttemptEvaluation[] = [];

        for (const attempt of attempts) {
            evaluations.push(
                await this.evaluateAttempt({
                    interaction: options.interaction,
                    goldDefinition: options.goldDefinition,
                    attempt
                })
            );
        }

        return evaluations;
    }

    private async evaluateAttempt(
        options: EvaluateAttemptOptions
    ): Promise<AttemptEvaluation> {
        const baseEvaluation = {
            interactionOrder: options.interaction.interactionOrder,
            turnNumber: options.interaction.turnNumber,
            attempt: options.attempt.attempt,
            query: options.attempt.query,
            executionStatus: options.attempt.status
        };

        if (options.attempt.status === 'failed') {
            return {
                ...baseEvaluation,
                outcome: 'execution_error',
                resultCorrect: null,
                queryExecutionId: null,
                reason: options.attempt.error
            };
        }

        if (options.attempt.status === 'pending') {
            return {
                ...baseEvaluation,
                outcome: 'evaluator_uncertain',
                resultCorrect: null,
                queryExecutionId: null,
                reason: 'SQL attempt has no final execution status.'
            };
        }

        const reference = options.interaction.candidateResults.find(
            (candidateResult) =>
                candidateResult.attempt === options.attempt.attempt
        );
        if (!reference) {
            return this.uncertain({
                interaction: options.interaction,
                attempt: options.attempt,
                reference: null,
                reason: 'Successful SQL attempt has no candidate-result reference.'
            });
        }

        if (reference.status === 'evaluator_uncertain' || !reference.file) {
            return this.uncertain({
                interaction: options.interaction,
                attempt: options.attempt,
                reference,
                reason: reference.error ?? 'Candidate result was not saved.'
            });
        }

        let goldenResult;
        try {
            goldenResult = await this.resultArtifactLoader.loadGoldenResult(
                options.goldDefinition.artifactId
            );
        } catch (error) {
            return this.uncertain({
                interaction: options.interaction,
                attempt: options.attempt,
                reference,
                reason: `Could not load golden result: ${this.toError(error).message}`
            });
        }

        let candidateResult;
        try {
            candidateResult =
                await this.resultArtifactLoader.loadCandidateResult(
                    reference.file
                );
        } catch (error) {
            return this.uncertain({
                interaction: options.interaction,
                attempt: options.attempt,
                reference,
                reason: `Could not load candidate result: ${this.toError(error).message}`
            });
        }

        const comparison = this.resultComparator.compare(
            goldenResult,
            candidateResult,
            options.goldDefinition.comparison
        );

        if (comparison.status === 'correct') {
            return {
                ...baseEvaluation,
                outcome: 'correct',
                resultCorrect: true,
                queryExecutionId: reference.queryExecutionId,
                reason: null
            };
        }

        if (comparison.status === 'incorrect') {
            return {
                ...baseEvaluation,
                outcome: 'semantic_error',
                resultCorrect: false,
                queryExecutionId: reference.queryExecutionId,
                reason: comparison.reason
            };
        }

        return this.uncertain({
            interaction: options.interaction,
            attempt: options.attempt,
            reference,
            reason: comparison.reason ?? 'Result comparison was uncertain.'
        });
    }

    private uncertain(options: UncertainAttemptOptions): AttemptEvaluation {
        return {
            interactionOrder: options.interaction.interactionOrder,
            turnNumber: options.interaction.turnNumber,
            attempt: options.attempt.attempt,
            query: options.attempt.query,
            executionStatus: options.attempt.status,
            outcome: 'evaluator_uncertain',
            resultCorrect: null,
            queryExecutionId: options.reference?.queryExecutionId ?? null,
            reason: options.reason
        };
    }

    private toError(error: unknown): Error {
        return error instanceof Error ? error : new Error(String(error));
    }
}
