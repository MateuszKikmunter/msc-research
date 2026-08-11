import type {
    Metadata,
    ModelInvocationInput,
    ResponseStream,
    Trace,
    TracePart
} from '@aws-sdk/client-bedrock-agent-runtime';

import type {
    AgentMetrics,
    AgentResponse,
    AgentTraceEvent,
    AgentTraceEventType,
    AgentTraceStage,
    SqlAttempt,
    TokenUsage
} from '../types';

type ProcessedAgentResponse = Omit<AgentResponse, 'elapsedTimeSeconds'>;

export class BedrockResponseProcessor {
    public async process(
        completion: AsyncIterable<ResponseStream> | undefined
    ): Promise<ProcessedAgentResponse> {
        if (!completion) {
            throw new Error('Bedrock returned no completion stream');
        }

        const decoder = new TextDecoder('utf-8');
        let answer = '';
        let foundationModel: string | null = null;
        let inputTokens = 0;
        let outputTokens = 0;
        const countedTraceIds = new Set<string>();
        const countedStepIds = new Set<string>();
        const countedModelInvocationIds = new Set<string>();
        const countedActionInvocationIds = new Set<string>();
        const sqlAttempts: SqlAttempt[] = [];
        const traceEvents: AgentTraceEvent[] = [];
        const sqlAttemptIndexesByTraceId = new Map<string, number>();
        const agentMetrics: AgentMetrics = {
            totalSteps: 0,
            modelInvocations: 0,
            actionInvocations: 0,
            retryCount: 0,
            firstAttemptSucceeded: null
        };

        for await (const event of completion) {
            if (event.chunk?.bytes) {
                answer += decoder.decode(event.chunk.bytes, { stream: true });
            }

            const trace = event.trace?.trace;
            if (event.trace) {
                traceEvents.push(
                    this.extractTraceEvent(event.trace, traceEvents.length + 1)
                );
            }
            foundationModel ??= this.getFoundationModel(trace);

            const usage = this.getTokenUsage(trace, countedTraceIds);
            inputTokens += usage.inputTokens;
            outputTokens += usage.outputTokens;

            this.updateAgentMetrics(
                trace,
                agentMetrics,
                countedStepIds,
                countedModelInvocationIds,
                countedActionInvocationIds
            );
            this.updateSqlAttempts(
                trace,
                sqlAttempts,
                sqlAttemptIndexesByTraceId
            );
        }

        answer += decoder.decode();
        agentMetrics.retryCount = Math.max(sqlAttempts.length - 1, 0);
        const firstAttempt = sqlAttempts[0];
        agentMetrics.firstAttemptSucceeded =
            firstAttempt && firstAttempt.status !== 'pending'
                ? firstAttempt.status === 'succeeded'
                : null;

        return {
            answer,
            foundationModel,
            tokenUsage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens
            },
            agentMetrics,
            sqlAttempts,
            traceEvents
        };
    }

    private extractTraceEvent(
        tracePart: TracePart,
        sequenceNumber: number
    ): AgentTraceEvent {
        const { stage, eventType, stageTrace } = this.classifyTrace(
            tracePart.trace
        );
        const orchestrationTrace = tracePart.trace?.orchestrationTrace;
        const modelInput = stageTrace?.modelInvocationInput as
            ModelInvocationInput | undefined;
        const modelOutput = stageTrace?.modelInvocationOutput as
            { traceId?: string; metadata?: Metadata } | undefined;
        const rationale = orchestrationTrace?.rationale;
        const invocation = orchestrationTrace?.invocationInput;
        const observation = orchestrationTrace?.observation;
        const actionInput = invocation?.actionGroupInvocationInput;
        const actionOutput = observation?.actionGroupInvocationOutput;

        return {
            sequenceNumber,
            traceId:
                rationale?.traceId ??
                invocation?.traceId ??
                observation?.traceId ??
                modelInput?.traceId ??
                modelOutput?.traceId ??
                this.getTopLevelTraceId(tracePart.trace) ??
                null,
            eventTime: tracePart.eventTime ?? null,
            stage,
            eventType,
            agentId: tracePart.agentId ?? null,
            agentAliasId: tracePart.agentAliasId ?? null,
            agentVersion: tracePart.agentVersion ?? null,
            foundationModel: modelInput?.foundationModel ?? null,
            rationale: rationale?.text ?? null,
            actionGroup: actionInput?.actionGroupName ?? null,
            actionName: actionInput?.function ?? actionInput?.apiPath ?? null,
            actionInput: actionInput ?? null,
            observation:
                this.parseJsonIfPossible(actionOutput?.text) ??
                observation ??
                null,
            inputTokens: modelOutput?.metadata?.usage?.inputTokens ?? null,
            outputTokens: modelOutput?.metadata?.usage?.outputTokens ?? null,
            modelLatencyMs: modelOutput?.metadata?.totalTimeMs ?? null,
            actionLatencyMs: actionOutput?.metadata?.totalTimeMs ?? null,
            sanitizedEvent: this.sanitizeTracePart(tracePart),
            rawEvent: this.shouldStoreRawTraces() ? tracePart : null
        };
    }

    private classifyTrace(trace: Trace | undefined): {
        stage: AgentTraceStage;
        eventType: AgentTraceEventType;
        stageTrace: Record<string, unknown> | undefined;
    } {
        const stageEntry = trace ? this.getStageEntry(trace) : undefined;
        if (!stageEntry) {
            return {
                stage: 'UNKNOWN',
                eventType: 'UNKNOWN',
                stageTrace: undefined
            };
        }

        return {
            stage: stageEntry.stage,
            eventType: this.getEventType(stageEntry.value),
            stageTrace: stageEntry.value
        };
    }

    private getStageEntry(
        trace: Trace
    ): { stage: AgentTraceStage; value: Record<string, unknown> } | undefined {
        const stages: Array<[AgentTraceStage, unknown]> = [
            ['PRE_PROCESSING', trace.preProcessingTrace],
            ['ORCHESTRATION', trace.orchestrationTrace],
            ['POST_PROCESSING', trace.postProcessingTrace],
            ['ROUTING_CLASSIFIER', trace.routingClassifierTrace],
            ['GUARDRAIL', trace.guardrailTrace],
            ['FAILURE', trace.failureTrace],
            ['CUSTOM_ORCHESTRATION', trace.customOrchestrationTrace]
        ];

        const match = stages.find(([, value]) => value !== undefined);
        return match
            ? { stage: match[0], value: this.toJsonObject(match[1]) }
            : undefined;
    }

    private getEventType(
        stageTrace: Record<string, unknown>
    ): AgentTraceEventType {
        if ('modelInvocationInput' in stageTrace) return 'MODEL_INPUT';
        if ('modelInvocationOutput' in stageTrace) return 'MODEL_OUTPUT';
        if ('rationale' in stageTrace) return 'RATIONALE';
        if ('invocationInput' in stageTrace) return 'INVOCATION';
        if ('observation' in stageTrace) return 'OBSERVATION';
        if ('failureReason' in stageTrace) return 'FAILURE';
        if ('action' in stageTrace) return 'GUARDRAIL';
        return 'UNKNOWN';
    }

    private getTopLevelTraceId(trace: Trace | undefined): string | undefined {
        return trace?.guardrailTrace?.traceId ?? trace?.failureTrace?.traceId;
    }

    private sanitizeTracePart(tracePart: TracePart): unknown {
        const sanitized = this.toJsonObject(tracePart);
        delete sanitized.sessionId;
        delete sanitized.callerChain;
        this.removeSensitiveModelContent(sanitized);
        return sanitized;
    }

    private removeSensitiveModelContent(value: unknown): void {
        if (!value || typeof value !== 'object') return;

        for (const [key, child] of Object.entries(value)) {
            if (key === 'modelInvocationInput' && this.isJsonObject(child)) {
                delete child.text;
            }
            if (key === 'modelInvocationOutput' && this.isJsonObject(child)) {
                delete child.rawResponse;
            }
            this.removeSensitiveModelContent(child);
        }
    }

    private parseJsonIfPossible(value: string | undefined): unknown | null {
        if (!value) return null;
        try {
            return JSON.parse(value) as unknown;
        } catch {
            return value;
        }
    }

    private toJsonObject(value: unknown): Record<string, unknown> {
        return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    }

    private isJsonObject(value: unknown): value is Record<string, unknown> {
        return (
            Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        );
    }

    private shouldStoreRawTraces(): boolean {
        return process.env.STORE_RAW_AGENT_TRACES?.toLowerCase() === 'true';
    }

    private updateSqlAttempts(
        trace: Trace | undefined,
        attempts: SqlAttempt[],
        indexesByTraceId: Map<string, number>
    ): void {
        const orchestrationTrace = trace?.orchestrationTrace;
        if (!orchestrationTrace) {
            return;
        }

        const invocation = orchestrationTrace.invocationInput;
        const query = invocation?.actionGroupInvocationInput?.parameters
            ?.find(({ name }) => name === 'query')
            ?.value?.trim();

        if (
            query &&
            (!invocation?.traceId || !indexesByTraceId.has(invocation.traceId))
        ) {
            const attemptIndex = attempts.length;
            attempts.push({
                attempt: attemptIndex + 1,
                query,
                status: 'pending',
                error: null
            });
            if (invocation?.traceId) {
                indexesByTraceId.set(invocation.traceId, attemptIndex);
            }
        }

        const observation = orchestrationTrace.observation;
        const output = observation?.actionGroupInvocationOutput?.text;
        if (!output || !observation?.traceId) {
            return;
        }

        const attemptIndex = indexesByTraceId.get(observation.traceId);
        const attempt =
            attemptIndex === undefined ? undefined : attempts[attemptIndex];
        if (!attempt) {
            return;
        }

        try {
            const payload = JSON.parse(output) as { error?: unknown };
            if (typeof payload.error === 'string') {
                attempt.status = 'failed';
                attempt.error = payload.error;
            } else {
                attempt.status = 'succeeded';
            }
        } catch {
            attempt.status = 'failed';
            attempt.error = output;
        }
    }

    private getFoundationModel(trace: Trace | undefined): string | null {
        if (!trace) return null;

        const stage =
            trace.preProcessingTrace ??
            trace.orchestrationTrace ??
            trace.postProcessingTrace ??
            trace.routingClassifierTrace;

        return stage?.modelInvocationInput?.foundationModel ?? null;
    }

    private updateAgentMetrics(
        trace: Trace | undefined,
        metrics: AgentMetrics,
        countedStepIds: Set<string>,
        countedModelInvocationIds: Set<string>,
        countedActionInvocationIds: Set<string>
    ): void {
        if (!trace) {
            return;
        }

        const modelOutput = this.getModelOutput(trace);
        if (
            modelOutput &&
            this.shouldCountTraceEvent(
                modelOutput.traceId,
                countedModelInvocationIds
            )
        ) {
            metrics.modelInvocations += 1;
        }

        const orchestrationTrace = trace.orchestrationTrace;
        const orchestrationOutput = orchestrationTrace?.modelInvocationOutput;
        if (
            orchestrationOutput &&
            this.shouldCountTraceEvent(
                orchestrationOutput.traceId,
                countedStepIds
            )
        ) {
            metrics.totalSteps += 1;
        }

        const invocation = orchestrationTrace?.invocationInput;
        if (
            invocation?.actionGroupInvocationInput &&
            this.shouldCountTraceEvent(
                invocation.traceId,
                countedActionInvocationIds
            )
        ) {
            metrics.actionInvocations += 1;
        }
    }

    private shouldCountTraceEvent(
        traceId: string | undefined,
        countedTraceIds: Set<string>
    ): boolean {
        // Bedrock can emit multiple trace parts for one logical operation, so an
        // available trace ID is counted once. Without an ID, deduplication is not
        // reliable and the event is counted rather than silently discarded.
        if (!traceId) {
            return true;
        }

        if (countedTraceIds.has(traceId)) {
            return false;
        }

        countedTraceIds.add(traceId);
        return true;
    }

    private getTokenUsage(
        trace: Trace | undefined,
        countedTraceIds: Set<string>
    ): Omit<TokenUsage, 'totalTokens'> {
        if (!trace) {
            return { inputTokens: 0, outputTokens: 0 };
        }

        const modelOutput = this.getModelOutput(trace);
        const usage = modelOutput?.metadata?.usage;
        if (
            !usage ||
            (modelOutput.traceId && countedTraceIds.has(modelOutput.traceId))
        ) {
            return { inputTokens: 0, outputTokens: 0 };
        }

        if (modelOutput.traceId) {
            countedTraceIds.add(modelOutput.traceId);
        }

        return {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0
        };
    }

    private getModelOutput(
        trace: Trace
    ): { traceId?: string; metadata?: Metadata } | undefined {
        const stage =
            trace.preProcessingTrace ??
            trace.orchestrationTrace ??
            trace.postProcessingTrace ??
            trace.routingClassifierTrace;

        return stage?.modelInvocationOutput;
    }
}
