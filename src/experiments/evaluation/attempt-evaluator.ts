import type { SqlAttempt } from '../../backend/types';
import { getErrorMessage } from '../shared/error-message';
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

type AttemptEvaluationBase = Pick<
    AttemptEvaluation,
    'interactionOrder' | 'turnNumber' | 'attempt' | 'query' | 'executionStatus'
>;

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
        const baseEvaluation = this.createBaseEvaluation(
            options.interaction,
            options.attempt
        );

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
            return this.uncertain(
                baseEvaluation,
                null,
                'Successful SQL attempt has no candidate-result reference.'
            );
        }

        if (reference.status === 'evaluator_uncertain' || !reference.file) {
            return this.uncertain(
                baseEvaluation,
                reference,
                reference.error ?? 'Candidate result was not saved.'
            );
        }

        let goldenResult;
        try {
            goldenResult = await this.resultArtifactLoader.loadGoldenResult(
                options.goldDefinition.artifactId
            );
        } catch (error) {
            return this.uncertain(
                baseEvaluation,
                reference,
                `Could not load golden result: ${getErrorMessage(error)}`
            );
        }

        let candidateResult;
        try {
            candidateResult =
                await this.resultArtifactLoader.loadCandidateResult(
                    reference.file
                );
        } catch (error) {
            return this.uncertain(
                baseEvaluation,
                reference,
                `Could not load candidate result: ${getErrorMessage(error)}`
            );
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

        return this.uncertain(
            baseEvaluation,
            reference,
            comparison.reason ?? 'Result comparison was uncertain.'
        );
    }

    private createBaseEvaluation(
        interaction: StoredRunInteraction,
        attempt: SqlAttempt
    ): AttemptEvaluationBase {
        return {
            interactionOrder: interaction.interactionOrder,
            turnNumber: interaction.turnNumber,
            attempt: attempt.attempt,
            query: attempt.query,
            executionStatus: attempt.status
        };
    }

    private uncertain(
        baseEvaluation: AttemptEvaluationBase,
        reference: CandidateResultReference | null,
        reason: string
    ): AttemptEvaluation {
        return {
            ...baseEvaluation,
            outcome: 'evaluator_uncertain',
            resultCorrect: null,
            queryExecutionId: reference?.queryExecutionId ?? null,
            reason
        };
    }
}
