import type {
    BenchmarkEpisodeOptions,
    BenchmarkRecord,
    ClarificationEvaluation,
    StoredRunInteraction,
    SafetyReviewRecord
} from '../types';
import {
    validateMatchingQuestion,
    isSafetyBenchmarkRecord
} from '../shared/benchmark-episode-validator';
import * as traceEvents from '../shared/trace-event-inspector';

export function evaluateClarification(
    options: BenchmarkEpisodeOptions
): ClarificationEvaluation {
    validateMatchingQuestion(options);

    const firstInteraction = options.episode.interactions[0];
    const clarificationCount = options.episode.interactions.reduce(
        (total, interaction) =>
            total + getClarificationEvents(interaction).length,
        0
    );
    const clarificationRequestedBeforeSql = firstInteraction
        ? traceEvents.requestedClarificationBeforeSql(
              firstInteraction.response.traceEvents
          )
        : false;

    return {
        questionId: options.benchmarkRecord.id,
        status: getStatus(
            options.benchmarkRecord,
            clarificationRequestedBeforeSql
        ),
        clarificationCount,
        clarificationRequestedBeforeSql,
        scriptedReplyUsed: options.episode.interactions.some(
            ({ scriptedReplyUsed }) => scriptedReplyUsed
        ),
        fallbackUsed: options.episode.interactions.some(
            ({ fallbackUsed }) => fallbackUsed
        )
    };
}

function getStatus(
    benchmarkRecord: BenchmarkRecord,
    clarificationRequestedBeforeSql: boolean
): ClarificationEvaluation['status'] {
    if (benchmarkRecord.expected_behavior === 'clarify_then_execute') {
        return clarificationRequestedBeforeSql ? 'appropriate' : 'missed';
    }

    if (benchmarkRecord.expected_behavior === 'execute') {
        return clarificationRequestedBeforeSql
            ? 'unnecessary'
            : 'not_applicable';
    }

    return 'not_applicable';
}

function getClarificationEvents(
    interaction: StoredRunInteraction
): StoredRunInteraction['response']['traceEvents'] {
    return interaction.response.traceEvents.filter((event) =>
        traceEvents.isClarificationObservation(event)
    );
}

export function buildSafetyEvidence(
    options: BenchmarkEpisodeOptions
): SafetyReviewRecord {
    validateMatchingQuestion(options);
    if (!isSafetyBenchmarkRecord(options.benchmarkRecord)) {
        throw new Error(
            `Benchmark record ${options.benchmarkRecord.id} is not a safety or out-of-domain case.`
        );
    }

    const sqlAttempts = options.episode.interactions.flatMap((interaction) =>
        interaction.response.sqlAttempts.map((attempt) => ({
            interactionOrder: interaction.interactionOrder,
            ...attempt
        }))
    );

    return {
        questionId: options.benchmarkRecord.id,
        category: options.benchmarkRecord.category,
        safetyTarget: options.benchmarkRecord.safety_target ?? null,
        // This is observable evidence only. It is not an automatic safety verdict.
        noQueryObserved: sqlAttempts.length === 0,
        interactions: options.episode.interactions.map((interaction) => ({
            interactionOrder: interaction.interactionOrder,
            input: interaction.input,
            answer: interaction.response.answer
        })),
        sqlAttempts,
        manualLabel: null,
        manualNotes: null
    };
}
