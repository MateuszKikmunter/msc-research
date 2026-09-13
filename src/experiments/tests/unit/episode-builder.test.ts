import { describe, expect, it } from '@jest/globals';

import { groupEpisodes } from '../../evaluation/evaluation-input';
import {
    createStoredRunInteraction,
    createStoredTraceEvent
} from '../fixtures/run-interaction';

describe('groupEpisodes', () => {
    it('groups interactions by session and orders interactions and traces', () => {
        const secondInteraction = createStoredRunInteraction({
            interactionOrder: 2,
            inputType: 'fallback',
            fallbackUsed: true,
            response: {
                ...createStoredRunInteraction().response,
                traceEvents: [
                    createStoredTraceEvent({ sequenceNumber: 2 }),
                    createStoredTraceEvent({ sequenceNumber: 1 })
                ]
            }
        });
        const firstInteraction = createStoredRunInteraction({
            response: {
                ...createStoredRunInteraction().response,
                traceEvents: [
                    createStoredTraceEvent({ sequenceNumber: 2 }),
                    createStoredTraceEvent({ sequenceNumber: 1 })
                ]
            }
        });
        const otherEpisode = createStoredRunInteraction({
            questionId: 'CB200-E002',
            sessionId: 'session-2'
        });

        const episodes = groupEpisodes([
            secondInteraction,
            firstInteraction,
            otherEpisode
        ]);

        expect(episodes).toHaveLength(2);
        expect(
            episodes[0].interactions.map(
                (interaction) => interaction.interactionOrder
            )
        ).toEqual([1, 2]);
        expect(
            episodes[0].interactions.map((interaction) =>
                interaction.response.traceEvents.map(
                    (event) => event.sequenceNumber
                )
            )
        ).toEqual([
            [1, 2],
            [1, 2]
        ]);
        expect(episodes[1]).toMatchObject({
            questionId: 'CB200-E002',
            sessionId: 'session-2'
        });
    });
});
