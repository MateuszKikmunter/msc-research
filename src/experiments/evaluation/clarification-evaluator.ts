import type {
    BenchmarkEpisodeOptions,
    BenchmarkRecord,
    ClarificationEvaluation,
    StoredRunInteraction
} from '../types';
import { validateMatchingQuestion } from '../shared/benchmark-episode-validator';
import { TraceEventInspector } from '../shared/trace-event-inspector';

export class ClarificationEvaluator {
    public constructor(
        private readonly traceEventInspector = new TraceEventInspector()
    ) {}

    public evaluate(options: BenchmarkEpisodeOptions): ClarificationEvaluation {
        validateMatchingQuestion(options);

        const firstInteraction = options.episode.interactions[0];
        const clarificationCount = options.episode.interactions.reduce(
            (total, interaction) =>
                total + this.getClarificationEvents(interaction).length,
            0
        );
        const clarificationRequestedBeforeSql = firstInteraction
            ? this.requestedClarificationBeforeSql(firstInteraction)
            : false;

        return {
            questionId: options.benchmarkRecord.id,
            status: this.getStatus(
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

    private getStatus(
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

    private requestedClarificationBeforeSql(
        interaction: StoredRunInteraction
    ): boolean {
        return this.traceEventInspector.requestedClarificationBeforeSql(
            interaction.response.traceEvents
        );
    }

    private getClarificationEvents(
        interaction: StoredRunInteraction
    ): StoredRunInteraction['response']['traceEvents'] {
        return interaction.response.traceEvents.filter((event) =>
            this.traceEventInspector.isClarificationObservation(event)
        );
    }
}
