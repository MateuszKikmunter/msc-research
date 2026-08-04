import express from 'express';
import { config } from 'dotenv';
import path from 'node:path';
import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'node:crypto';

//TODO: move to startup function
config({
    path: path.resolve(__dirname + '/../../.env')
});
const app = express();
const port = process.env.PORT ?? '8000';
const bedrockClient = new BedrockAgentRuntimeClient({
    region: process.env.region ?? 'eu-west-1',

    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID as string,
        secretAccessKey: process.env.ACCESS_SECRET as string
    }
});

const sessionId = randomUUID();

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Hello World!' });
});

app.post('/athena-intelligence', async (req, res) => {
    const query = req.body?.query;
    if (!query) {
        res.json({ error: 'Query not provided!' }).sendStatus(400);
        return;
    }

    const command = new InvokeAgentCommand({
        agentId: process.env.AGENT_ID,
        agentAliasId: process.env.AGENT_ALIAS,
        sessionId,
        enableTrace: true,
        inputText: query
    });

    const response = await bedrockClient.send(command);
    const result = await aggregateAgentResponse(response.completion);

    res.json({ result });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

async function aggregateAgentResponse(
    completion: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }> | undefined
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
