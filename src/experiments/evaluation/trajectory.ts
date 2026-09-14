import type {
    AttemptEvaluation,
    ErrorTransition,
    TrajectoryFacts,
    TrajectoryClass,
    TrajectoryOutcome
} from '../types';

interface BuildTrajectoryFactsOptions {
    attempts: AttemptEvaluation[];
    errorTransitions: ErrorTransition[];
}

export function buildTrajectoryFacts(
    options: BuildTrajectoryFactsOptions
): TrajectoryFacts {
    const attempts = orderAttempts(options.attempts);
    if (attempts.length === 0) {
        return noSqlFacts();
    }

    const firstAttempt = attempts[0];
    const terminalAttempt = attempts[attempts.length - 1];
    const firstAttemptOutcome = toTrajectoryOutcome(firstAttempt);
    const terminalOutcome = toTrajectoryOutcome(terminalAttempt);
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
            executedSuccessfully(firstAttemptOutcome),
        firstAttemptResultCorrect: resultCorrect(firstAttemptOutcome),
        terminalAttemptExecutedSuccessfully:
            executedSuccessfully(terminalOutcome),
        terminalResultCorrect: resultCorrect(terminalOutcome),
        executionErrorObserved: athenaErrorCount > 0,
        retryAttempted: attempts.length > 1,
        retryPolicyExceeded: hasExceededRetryPolicy(attempts),
        recovered:
            evaluationComplete &&
            traceComplete &&
            terminalOutcome === 'correct' &&
            (firstAttemptOutcome === 'execution_error' ||
                firstAttemptOutcome === 'semantic_error'),
        redundantActionObserved: hasRedundantAction(
            attempts,
            options.errorTransitions
        ),
        regressedAfterCorrectAttempt:
            terminalOutcome !== 'correct' &&
            terminalOutcome !== 'system_error' &&
            attempts.slice(0, -1).some(({ outcome }) => outcome === 'correct'),
        traceComplete,
        evaluationComplete,
        sqlAttemptCount: attempts.length,
        athenaErrorCount
    };
}

function noSqlFacts(): TrajectoryFacts {
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

function hasRedundantAction(
    attempts: AttemptEvaluation[],
    errorTransitions: ErrorTransition[]
): boolean {
    const actionFollowedCorrectResult = attempts
        .slice(0, -1)
        .some(({ outcome }) => outcome === 'correct');
    const unchangedRetry = errorTransitions.some(
        ({ retryProduced, sqlChanged }) => retryProduced && sqlChanged === false
    );
    return actionFollowedCorrectResult || unchangedRetry;
}

function hasExceededRetryPolicy(attempts: AttemptEvaluation[]): boolean {
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

function orderAttempts(attempts: AttemptEvaluation[]): AttemptEvaluation[] {
    return [...attempts].sort(
        (left, right) =>
            left.interactionOrder - right.interactionOrder ||
            left.attempt - right.attempt
    );
}

function toTrajectoryOutcome(attempt: AttemptEvaluation): TrajectoryOutcome {
    return attempt.outcome === 'evaluator_uncertain'
        ? 'system_error'
        : attempt.outcome;
}

function executedSuccessfully(outcome: TrajectoryOutcome): boolean | null {
    if (outcome === 'correct' || outcome === 'semantic_error') {
        return true;
    }
    if (outcome === 'execution_error') {
        return false;
    }
    return null;
}

function resultCorrect(outcome: TrajectoryOutcome): boolean | null {
    if (outcome === 'correct') {
        return true;
    }
    if (outcome === 'semantic_error') {
        return false;
    }
    return null;
}

export function classifyTrajectory(facts: TrajectoryFacts): TrajectoryClass {
    if (!facts.traceComplete || !facts.evaluationComplete) {
        return 'SYSTEM_ERROR';
    }

    if (facts.terminalOutcome === 'no_sql') {
        return 'NO_SQL';
    }

    if (facts.terminalOutcome === 'correct') {
        if (facts.firstAttemptOutcome === 'correct') {
            return 'DIRECT_SUCCESS';
        }
        if (facts.firstAttemptOutcome === 'execution_error') {
            return 'EXECUTION_ERROR_RECOVERED';
        }
        if (facts.firstAttemptOutcome === 'semantic_error') {
            return 'SEMANTIC_REVISION_SUCCESS';
        }
    }

    if (facts.terminalOutcome === 'semantic_error') {
        return 'EXECUTED_SEMANTIC_FAILURE';
    }

    if (facts.terminalOutcome === 'execution_error') {
        return 'UNRECOVERED_EXECUTION_FAILURE';
    }

    return 'SYSTEM_ERROR';
}
