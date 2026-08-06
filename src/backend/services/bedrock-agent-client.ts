import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
    Metadata,
    ResponseStream,
    Trace
} from '@aws-sdk/client-bedrock-agent-runtime';

import type {
    AgentMetrics,
    AgentResponse,
    SqlAttempt,
    TokenUsage
} from '../types';

export class BedrockAgentClient {
    private client: BedrockAgentRuntimeClient;

    constructor() {
        this.client = new BedrockAgentRuntimeClient({
            region: process.env.REGION ?? 'eu-west-1',
            credentials: {
                accessKeyId: process.env.ACCESS_KEY_ID as string,
                secretAccessKey: process.env.ACCESS_SECRET as string
            }
        });
    }

    public async sendQuery(
        query: string,
        sessionId: string
    ): Promise<AgentResponse> {
        if (!query) {
            throw new Error('Query not provided!');
        }

        if (!sessionId) {
            throw new Error('Session ID not provided!');
        }

        const startedAt = performance.now();
        const command = new InvokeAgentCommand({
            agentId: process.env.AGENT_ID,
            agentAliasId: process.env.AGENT_ALIAS,
            sessionId,
            enableTrace: true,
            inputText: query
        });

        const response = await this.client.send(command);
        const {
            answer,
            foundationModel,
            tokenUsage,
            agentMetrics,
            sqlAttempts
        } = await this.aggregateAgentResponse(response.completion);

        return {
            answer,
            foundationModel,
            elapsedTimeSeconds:
                Math.round((performance.now() - startedAt) / 100) / 10,
            tokenUsage,
            agentMetrics,
            sqlAttempts
        };
    }

    private async aggregateAgentResponse(
        completion: AsyncIterable<ResponseStream> | undefined
    ): Promise<Omit<AgentResponse, 'elapsedTimeSeconds'>> {
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
            sqlAttempts
        };
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
        if (!trace) {
            return null;
        }

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
        if (modelOutput) {
            if (
                !modelOutput.traceId ||
                !countedModelInvocationIds.has(modelOutput.traceId)
            ) {
                metrics.modelInvocations += 1;
                if (modelOutput.traceId) {
                    countedModelInvocationIds.add(modelOutput.traceId);
                }
            }
        }

        const orchestrationTrace = trace.orchestrationTrace;
        const orchestrationOutput = orchestrationTrace?.modelInvocationOutput;
        if (
            orchestrationOutput &&
            (!orchestrationOutput.traceId ||
                !countedStepIds.has(orchestrationOutput.traceId))
        ) {
            metrics.totalSteps += 1;
            if (orchestrationOutput.traceId) {
                countedStepIds.add(orchestrationOutput.traceId);
            }
        }

        const invocation = orchestrationTrace?.invocationInput;
        if (
            invocation?.actionGroupInvocationInput &&
            (!invocation.traceId ||
                !countedActionInvocationIds.has(invocation.traceId))
        ) {
            metrics.actionInvocations += 1;
            if (invocation.traceId) {
                countedActionInvocationIds.add(invocation.traceId);
            }
        }
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
