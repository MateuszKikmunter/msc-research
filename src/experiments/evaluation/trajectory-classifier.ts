import type { TrajectoryClass, TrajectoryFacts } from '../types';

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
