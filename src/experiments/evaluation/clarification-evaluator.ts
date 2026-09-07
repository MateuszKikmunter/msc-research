import type {
    BenchmarkEpisodeOptions,
    BenchmarkRecord,
    ClarificationEvaluation,
    StoredRunInteraction,
    StoredTraceEvent
} from '../types';
import { validateMatchingQuestion } from '../shared/benchmark-episode-validator';
import { TraceEventInspector } from '../shared/services/trace/trace-event-inspector';
import { isRecord } from '../shared/type-guards';

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
        const events = [...interaction.response.traceEvents].sort(
            (left, right) => left.sequenceNumber - right.sequenceNumber
        );
        const clarification = events.find((event) =>
            this.isClarification(event)
        );

        if (!clarification) {
            return false;
        }

        const sqlInvocation = events.find((event) =>
            this.traceEventInspector.isSqlInvocation(event)
        );

        return (
            !sqlInvocation ||
            clarification.sequenceNumber < sqlInvocation.sequenceNumber
        );
    }

    private getClarificationEvents(
        interaction: StoredRunInteraction
    ): StoredTraceEvent[] {
        return interaction.response.traceEvents.filter((event) =>
            this.isClarification(event)
        );
    }

    private isClarification(event: StoredTraceEvent): boolean {
        return (
            event.eventType === 'OBSERVATION' &&
            isRecord(event.observation) &&
            event.observation.type === 'ASK_USER'
        );
    }
}
