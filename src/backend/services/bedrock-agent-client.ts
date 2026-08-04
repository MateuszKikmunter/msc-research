import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
    Metadata,
    ResponseStream,
    Trace
} from '@aws-sdk/client-bedrock-agent-runtime';

import type { AgentResponse, TokenUsage } from '../types';

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
        const { answer, tokenUsage } = await this.aggregateAgentResponse(
            response.completion
        );

        return {
            answer,
            elapsedTimeSeconds:
                Math.round((performance.now() - startedAt) / 100) / 10,
            tokenUsage
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
        let inputTokens = 0;
        let outputTokens = 0;
        const countedTraceIds = new Set<string>();

        for await (const event of completion) {
            if (event.chunk?.bytes) {
                answer += decoder.decode(event.chunk.bytes, { stream: true });
            }

            const usage = this.getTokenUsage(
                event.trace?.trace,
                countedTraceIds
            );
            inputTokens += usage.inputTokens;
            outputTokens += usage.outputTokens;
        }

        answer += decoder.decode();

        return {
            answer,
            tokenUsage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens
            }
        };
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
