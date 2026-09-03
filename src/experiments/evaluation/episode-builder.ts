import type { EvaluationEpisode, StoredRunInteraction } from '../types';

export class EpisodeBuilder {
    public build(interactions: StoredRunInteraction[]): EvaluationEpisode[] {
        const interactionsBySession = new Map<string, StoredRunInteraction[]>();

        for (const interaction of interactions) {
            const existingInteractions =
                interactionsBySession.get(interaction.sessionId) ?? [];

            interactionsBySession.set(interaction.sessionId, [
                ...existingInteractions,
                interaction
            ]);
        }

        return [...interactionsBySession.values()].map((episodeInteractions) =>
            this.createEpisode(episodeInteractions)
        );
    }

    private createEpisode(
        interactions: StoredRunInteraction[]
    ): EvaluationEpisode {
        const orderedInteractions = [...interactions]
            .sort(
                (left, right) => left.interactionOrder - right.interactionOrder
            )
            .map((interaction) => this.orderTraceEvents(interaction));
        const firstInteraction = orderedInteractions[0];

        return {
            questionId: firstInteraction.questionId,
            sessionId: firstInteraction.sessionId,
            modelCondition: firstInteraction.modelCondition,
            repetition: firstInteraction.repetition,
            interactions: orderedInteractions
        };
    }

    private orderTraceEvents(
        interaction: StoredRunInteraction
    ): StoredRunInteraction {
        return {
            ...interaction,
            response: {
                ...interaction.response,
                traceEvents: [...interaction.response.traceEvents].sort(
                    (left, right) => left.sequenceNumber - right.sequenceNumber
                )
            }
        };
    }
}
