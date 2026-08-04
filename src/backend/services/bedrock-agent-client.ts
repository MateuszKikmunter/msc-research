import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime';
import { UUID } from 'node:crypto';

export interface BedrockConfig {
    enableTrace: boolean;
    sessionId: UUID;
}

export class BedrockAgentClient {
    private client: BedrockAgentRuntimeClient;

    constructor(private config: BedrockConfig) {
        this.client = new BedrockAgentRuntimeClient({
            region: process.env.region ?? 'eu-west-1',
            credentials: {
                accessKeyId: process.env.ACCESS_KEY_ID as string,
                secretAccessKey: process.env.ACCESS_SECRET as string
            }
        });
    }

    public async sendQuery(query: string): Promise<string> {
        if (!query) {
            throw new Error('Query not provided!');
        }

        const command = new InvokeAgentCommand({
            agentId: process.env.AGENT_ID,
            agentAliasId: process.env.AGENT_ALIAS,
            sessionId: this.config.sessionId,
            enableTrace: this.config.enableTrace,
            inputText: query
        });

        const response = await this.client.send(command);
        return await this.aggregateAgentResponse(response.completion);
    }

    private async aggregateAgentResponse(
        completion:
            AsyncIterable<{ chunk?: { bytes?: Uint8Array } }> | undefined
    ): Promise<string> {
        if (!completion) {
            console.log('no completion!');
            return '';
        }

        const decoder = new TextDecoder('utf-8');
        let result = '';

        for await (const event of completion) {
            if (event.chunk) {
                result += decoder.decode(event.chunk.bytes, { stream: true });
            }
        }

        return result;
    }
}
