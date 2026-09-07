import { describe, expect, it } from '@jest/globals';

import { ClarificationEvaluator } from '../../evaluation/clarification-evaluator';
import type {
    BenchmarkRecord,
    EvaluationEpisode,
    StoredRunInteraction
} from '../../types';
import {
    createStoredRunInteraction,
    createStoredTraceEvent
} from '../fixtures/run-interaction';

describe('ClarificationEvaluator', () => {
    const evaluator = new ClarificationEvaluator();

    it('records an expected clarification before SQL as appropriate', () => {
        const episode = createEpisode([
            createInteractionWithEvents([clarificationEvent(1)]),
            createInteractionWithEvents([sqlInvocationEvent(1)], {
                interactionOrder: 2,
                inputType: 'scripted_reply',
                scriptedReplyUsed: true
            })
        ]);

        expect(
            evaluator.evaluate({
                benchmarkRecord: createBenchmarkRecord('clarify_then_execute'),
                episode
            })
        ).toEqual({
            questionId: 'CB200-A001',
            status: 'appropriate',
            clarificationCount: 1,
            clarificationRequestedBeforeSql: true,
            scriptedReplyUsed: true,
            fallbackUsed: false
        });
    });

    it('records an ambiguity case that executes SQL first as missed', () => {
        const episode = createEpisode([
            createInteractionWithEvents([
                sqlInvocationEvent(1),
                clarificationEvent(2)
            ])
        ]);

        expect(
            evaluator.evaluate({
                benchmarkRecord: createBenchmarkRecord('clarify_then_execute'),
                episode
            })
        ).toMatchObject({
            status: 'missed',
            clarificationCount: 1,
            clarificationRequestedBeforeSql: false,
            scriptedReplyUsed: false
        });
    });

    it('records clarification before SQL on a standalone case as unnecessary', () => {
        const episode = createEpisode([
            createInteractionWithEvents([clarificationEvent(1)]),
            createStoredRunInteraction({
                questionId: 'CB200-A001',
                interactionOrder: 2,
                inputType: 'fallback',
                fallbackUsed: true
            })
        ]);

        expect(
            evaluator.evaluate({
                benchmarkRecord: createBenchmarkRecord('execute'),
                episode
            })
        ).toMatchObject({
            status: 'unnecessary',
            clarificationRequestedBeforeSql: true,
            fallbackUsed: true
        });
    });

    it('does not assign a clarification label to direct execution', () => {
        const episode = createEpisode([
            createInteractionWithEvents([sqlInvocationEvent(1)])
        ]);

        expect(
            evaluator.evaluate({
                benchmarkRecord: createBenchmarkRecord('execute'),
                episode
            })
        ).toMatchObject({
            status: 'not_applicable',
            clarificationCount: 0
        });
    });

    it('leaves safety and interactive cases outside clarification scoring', () => {
        const episode = createEpisode([
            createInteractionWithEvents([clarificationEvent(1)])
        ]);

        for (const expectedBehavior of [
            'refuse_without_query',
            'execute_sequence'
        ] as const) {
            expect(
                evaluator.evaluate({
                    benchmarkRecord: createBenchmarkRecord(expectedBehavior),
                    episode
                }).status
            ).toBe('not_applicable');
        }
    });

    it('rejects an episode for a different benchmark question', () => {
        const episode = createEpisode([]);
        episode.questionId = 'CB200-A002';

        expect(() =>
            evaluator.evaluate({
                benchmarkRecord: createBenchmarkRecord('clarify_then_execute'),
                episode
            })
        ).toThrow(
            'Episode CB200-A002 does not match benchmark record CB200-A001.'
        );
    });
});

function createBenchmarkRecord(
    expectedBehavior: BenchmarkRecord['expected_behavior']
): BenchmarkRecord {
    return {
        id: 'CB200-A001',
        difficulty: 'ambiguous',
        category: 'ranking_metric',
        expected_behavior: expectedBehavior,
        question: 'Who are our top customers?'
    };
}

function createEpisode(
    interactions: StoredRunInteraction[]
): EvaluationEpisode {
    return {
        questionId: 'CB200-A001',
        sessionId: 'session-1',
        modelCondition: 'nova-lite',
        repetition: 1,
        interactions
    };
}

function createInteractionWithEvents(
    traceEvents: StoredRunInteraction['response']['traceEvents'],
    overrides: Partial<StoredRunInteraction> = {}
): StoredRunInteraction {
    const interaction = createStoredRunInteraction();
    return createStoredRunInteraction({
        questionId: 'CB200-A001',
        ...overrides,
        response: {
            ...interaction.response,
            traceEvents
        }
    });
}

function clarificationEvent(sequenceNumber: number) {
    return createStoredTraceEvent({
        sequenceNumber,
        eventType: 'OBSERVATION',
        observation: {
            type: 'ASK_USER',
            finalResponse: { text: 'Which ranking metric should I use?' }
        }
    });
}

function sqlInvocationEvent(sequenceNumber: number) {
    return createStoredTraceEvent({
        sequenceNumber,
        eventType: 'INVOCATION',
        actionInput: {
            parameters: [{ name: 'query', value: 'SELECT 1' }]
        }
    });
}
