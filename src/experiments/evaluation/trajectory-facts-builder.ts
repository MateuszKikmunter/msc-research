import type {
    AttemptEvaluation,
    ErrorTransition,
    TrajectoryFacts,
    TrajectoryOutcome
} from '../types';

interface BuildTrajectoryFactsOptions {
    attempts: AttemptEvaluation[];
    errorTransitions: ErrorTransition[];
}

export class TrajectoryFactsBuilder {
    public build(options: BuildTrajectoryFactsOptions): TrajectoryFacts {
        const attempts = this.orderAttempts(options.attempts);
        if (attempts.length === 0) {
            return this.noSqlFacts();
        }

        const firstAttempt = attempts[0];
        const terminalAttempt = attempts[attempts.length - 1];
        const firstAttemptOutcome = this.toTrajectoryOutcome(firstAttempt);
        const terminalOutcome = this.toTrajectoryOutcome(terminalAttempt);
        const athenaErrorCount = attempts.filter(
            ({ outcome }) => outcome === 'execution_error'
        ).length;
        const evaluationComplete = attempts.every(
            ({ outcome }) => outcome !== 'evaluator_uncertain'
        );
        const traceComplete =
            athenaErrorCount === options.errorTransitions.length &&
            options.errorTransitions.every(
                ({ transitionUncertain }) => !transitionUncertain
            );

        return {
            firstAttemptOutcome,
            terminalOutcome,
            firstAttemptExecutedSuccessfully:
                this.executedSuccessfully(firstAttemptOutcome),
            firstAttemptResultCorrect: this.resultCorrect(firstAttemptOutcome),
            terminalAttemptExecutedSuccessfully:
                this.executedSuccessfully(terminalOutcome),
            terminalResultCorrect: this.resultCorrect(terminalOutcome),
            executionErrorObserved: athenaErrorCount > 0,
            retryAttempted: attempts.length > 1,
            retryPolicyExceeded: this.hasExceededRetryPolicy(attempts),
            recovered:
                evaluationComplete &&
                traceComplete &&
                terminalOutcome === 'correct' &&
                (firstAttemptOutcome === 'execution_error' ||
                    firstAttemptOutcome === 'semantic_error'),
            redundantActionObserved: this.hasRedundantAction(
                attempts,
                options.errorTransitions
            ),
            regressedAfterCorrectAttempt:
                terminalOutcome !== 'correct' &&
                terminalOutcome !== 'system_error' &&
                attempts
                    .slice(0, -1)
                    .some(({ outcome }) => outcome === 'correct'),
            traceComplete,
            evaluationComplete,
            sqlAttemptCount: attempts.length,
            athenaErrorCount
        };
    }

    private noSqlFacts(): TrajectoryFacts {
        return {
            firstAttemptOutcome: 'no_sql',
            terminalOutcome: 'no_sql',
            firstAttemptExecutedSuccessfully: null,
            firstAttemptResultCorrect: null,
            terminalAttemptExecutedSuccessfully: null,
            terminalResultCorrect: null,
            executionErrorObserved: false,
            retryAttempted: false,
            retryPolicyExceeded: false,
            recovered: false,
            redundantActionObserved: false,
            regressedAfterCorrectAttempt: false,
            traceComplete: true,
            evaluationComplete: true,
            sqlAttemptCount: 0,
            athenaErrorCount: 0
        };
    }

    private hasRedundantAction(
        attempts: AttemptEvaluation[],
        errorTransitions: ErrorTransition[]
    ): boolean {
        const actionFollowedCorrectResult = attempts
            .slice(0, -1)
            .some(({ outcome }) => outcome === 'correct');
        const unchangedRetry = errorTransitions.some(
            ({ retryProduced, sqlChanged }) =>
                retryProduced && sqlChanged === false
        );
        return actionFollowedCorrectResult || unchangedRetry;
    }

    private hasExceededRetryPolicy(attempts: AttemptEvaluation[]): boolean {
        const interactionOrders = new Set(
            attempts.map(({ interactionOrder }) => interactionOrder)
        );

        // The prompt permits one initial SQL action and one retry per interaction.
        return [...interactionOrders].some(
            (interactionOrder) =>
                attempts.filter(
                    (attempt) => attempt.interactionOrder === interactionOrder
                ).length > 2
        );
    }

    private orderAttempts(attempts: AttemptEvaluation[]): AttemptEvaluation[] {
        return [...attempts].sort(
            (left, right) =>
                left.interactionOrder - right.interactionOrder ||
                left.attempt - right.attempt
        );
    }

    private toTrajectoryOutcome(attempt: AttemptEvaluation): TrajectoryOutcome {
        return attempt.outcome === 'evaluator_uncertain'
            ? 'system_error'
            : attempt.outcome;
    }

    private executedSuccessfully(outcome: TrajectoryOutcome): boolean | null {
        if (outcome === 'correct' || outcome === 'semantic_error') {
            return true;
        }
        if (outcome === 'execution_error') {
            return false;
        }
        return null;
    }

    private resultCorrect(outcome: TrajectoryOutcome): boolean | null {
        if (outcome === 'correct') {
            return true;
        }
        if (outcome === 'semantic_error') {
            return false;
        }
        return null;
    }
}
