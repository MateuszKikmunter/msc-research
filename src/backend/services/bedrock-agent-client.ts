import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime';

import { TranscriptRepository } from '../data/transcript-repository';
import type { AgentResponse } from '../types';
import { BedrockResponseProcessor } from './bedrock-response-processor';

export class BedrockAgentClient {
    private client: BedrockAgentRuntimeClient;
    private transcriptRepository: TranscriptRepository;
    private responseProcessor: BedrockResponseProcessor;

    constructor() {
        this.transcriptRepository = new TranscriptRepository();
        this.responseProcessor = new BedrockResponseProcessor();
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

        const startedAt = new Date();
        const startedAtPerformance = performance.now();
        const command = new InvokeAgentCommand({
            agentId: process.env.AGENT_ID,
            agentAliasId: process.env.AGENT_ALIAS,
            sessionId,
            enableTrace: true,
            inputText: query
        });

        let result: AgentResponse;
        let elapsedMs: number;

        try {
            const response = await this.client.send(command);
            const processedResponse = await this.responseProcessor.process(
                response.completion
            );
            elapsedMs = performance.now() - startedAtPerformance;
            result = {
                ...processedResponse,
                elapsedTimeSeconds: Math.round(elapsedMs / 100) / 10
            };
        } catch (error) {
            elapsedMs = performance.now() - startedAtPerformance;
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            try {
                await this.transcriptRepository.saveInteraction({
                    ...this.getExperimentMetadata(),
                    sessionId,
                    question: query,
                    answer: '',
                    startedAt,
                    elapsedMs,
                    status: 'failed',
                    error: errorMessage
                });
            } catch (persistenceError) {
                console.error(
                    'Could not persist failed Bedrock interaction',
                    persistenceError
                );
            }

            throw error;
        }

        await this.transcriptRepository.saveInteraction({
            ...this.getExperimentMetadata(),
            sessionId,
            question: query,
            answer: result.answer,
            startedAt,
            elapsedMs,
            status: 'succeeded',
            foundationModel: result.foundationModel,
            tokenUsage: result.tokenUsage,
            agentMetrics: result.agentMetrics,
            sqlAttempts: result.sqlAttempts,
            traceEvents: result.traceEvents
        });

        return result;
    }

    private getExperimentMetadata(): {
        experimentName: string | null;
        experimentCondition: string | null;
        promptVersion: string | null;
        agentId: string | null;
        agentAlias: string | null;
        region: string;
    } {
        return {
            experimentName: process.env.EXPERIMENT_NAME ?? null,
            experimentCondition: process.env.EXPERIMENT_CONDITION ?? null,
            promptVersion: process.env.PROMPT_VERSION ?? null,
            agentId: process.env.AGENT_ID ?? null,
            agentAlias: process.env.AGENT_ALIAS ?? null,
            region: process.env.REGION ?? 'eu-west-1'
        };
    }
}
