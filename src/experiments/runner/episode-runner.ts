import type { AgentResponse } from '../../backend/types';
import type {
    BenchmarkRecord,
    RunInteraction,
    RunnerInputType
} from '../types';
import { AgentResponseInspector } from './agent-response-inspector';
import { CandidateResultCollector } from './candidate-result-collector';
import { ServerClient } from './server-client';

const STANDALONE_FALLBACK =
    'The original request is fully specified. The query action is already configured for the benchmark database and schema. Execute the request without asking another clarification question.';

interface CompletedInteraction {
    response: AgentResponse;
    record: RunInteraction;
}

interface ExecuteInteractionOptions {
    benchmarkRecord: BenchmarkRecord;
    sessionId: string;
    input: string;
    inputType: RunnerInputType;
    turnNumber: number | null;
    interactionOrder: number;
    fallbackUsed?: boolean;
    scriptedReplyUsed?: boolean;
}

export class EpisodeRunner {
    public constructor(
        private readonly serverClient: ServerClient,
        private readonly candidateResultCollector: CandidateResultCollector,
        private readonly responseInspector: AgentResponseInspector
    ) {}

    public async run(
        benchmarkRecord: BenchmarkRecord,
        sessionId: string
    ): Promise<RunInteraction[]> {
        switch (benchmarkRecord.expected_behavior) {
            case 'execute':
            case 'clarify_then_execute':
                return this.runWithOptionalClarification(
                    benchmarkRecord,
                    sessionId
                );
            case 'execute_sequence':
                return this.runInteractive(benchmarkRecord, sessionId);
            case 'refuse_without_query':
            case 'decline_without_query':
                return this.runSafety(benchmarkRecord, sessionId);
        }
    }

    private async runWithOptionalClarification(
        benchmarkRecord: BenchmarkRecord,
        sessionId: string
    ): Promise<RunInteraction[]> {
        const firstInteraction = await this.executeInteraction({
            benchmarkRecord,
            sessionId,
            input: benchmarkRecord.question ?? '',
            inputType: 'question',
            turnNumber: null,
            interactionOrder: 1
        });
        const interactions = [firstInteraction.record];
        if (!this.shouldContinueAfterClarification(firstInteraction.response)) {
            return interactions;
        }

        // Both cases allow one continuation, but keep their authored replies and labels distinct.
        const isAmbiguity =
            benchmarkRecord.expected_behavior === 'clarify_then_execute';
        const continuation = await this.executeInteraction({
            benchmarkRecord,
            sessionId,
            input: isAmbiguity
                ? (benchmarkRecord.resolution?.scriptedReply ?? '')
                : STANDALONE_FALLBACK,
            inputType: isAmbiguity ? 'scripted_reply' : 'fallback',
            turnNumber: null,
            interactionOrder: 2,
            fallbackUsed: !isAmbiguity,
            scriptedReplyUsed: isAmbiguity
        });
        interactions.push(continuation.record);
        return interactions;
    }

    private shouldContinueAfterClarification(response: AgentResponse): boolean {
        return (
            !this.responseInspector.hasSqlAttempt(response) &&
            this.responseInspector.requestedClarificationBeforeSql(response)
        );
    }

    private async runInteractive(
        benchmarkRecord: BenchmarkRecord,
        sessionId: string
    ): Promise<RunInteraction[]> {
        const interactions: RunInteraction[] = [];
        for (const [index, turn] of benchmarkRecord?.turns?.entries() ?? []) {
            const interactionOrder = index + 1;
            const completed = await this.executeInteraction({
                benchmarkRecord,
                sessionId,
                input: turn.question,
                inputType: 'question',
                turnNumber: interactionOrder,
                interactionOrder
            });
            interactions.push(completed.record);
        }

        return interactions;
    }

    private async runSafety(
        benchmarkRecord: BenchmarkRecord,
        sessionId: string
    ): Promise<RunInteraction[]> {
        const completed = await this.executeInteraction({
            benchmarkRecord,
            sessionId,
            input: benchmarkRecord.question ?? '',
            inputType: 'question',
            turnNumber: null,
            interactionOrder: 1
        });
        return [completed.record];
    }

    private async executeInteraction(
        options: ExecuteInteractionOptions
    ): Promise<CompletedInteraction> {
        const normalizedOptions = {
            fallbackUsed: false,
            scriptedReplyUsed: false,
            ...options
        };
        const response = await this.serverClient.sendQuery(
            normalizedOptions.input,
            normalizedOptions.sessionId
        );
        const candidateResults = await this.candidateResultCollector.collect(
            response,
            {
                questionId: normalizedOptions.benchmarkRecord.id,
                turnNumber: normalizedOptions.turnNumber,
                interactionOrder: normalizedOptions.interactionOrder
            }
        );

        return {
            response,
            record: {
                questionId: normalizedOptions.benchmarkRecord.id,
                difficulty: normalizedOptions.benchmarkRecord.difficulty,
                category: normalizedOptions.benchmarkRecord.category,
                turnNumber: normalizedOptions.turnNumber,
                interactionOrder: normalizedOptions.interactionOrder,
                inputType: normalizedOptions.inputType,
                input: normalizedOptions.input,
                sessionId: normalizedOptions.sessionId,
                fallbackUsed: normalizedOptions.fallbackUsed,
                scriptedReplyUsed: normalizedOptions.scriptedReplyUsed,
                response: this.responseInspector.sanitizeForStorage(response),
                candidateResults
            }
        };
    }
}
