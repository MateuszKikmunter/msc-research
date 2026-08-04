import express, { Application } from 'express';
import { config } from 'dotenv';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { BedrockAgentClient } from './services/bedrock-agent-client';

export class Server {
    private app: Application;
    private port = process.env.PORT ?? '8000';
    private bedrockAgent: BedrockAgentClient;

    constructor() {
        this.app = express();
        this.init();
        this.bedrockAgent = new BedrockAgentClient({
            enableTrace: true,
            sessionId: randomUUID()
        });
    }

    public start(): void {
        this.app.listen(this.port, () => {
            console.log(`Example app listening on port ${this.port}`);
        });
    }

    private init(): void {
        this.loadConfig();
        this.registerMiddleware();
        this.registerRoutes();
    }

    private loadConfig(): void {
        config({
            path: path.resolve(__dirname + '/../../.env')
        });
    }

    private registerMiddleware(): void {
        this.app.use(express.json());
    }

    private registerRoutes(): void {
        this.app.get('/', (req, res) => {
            res.json({ message: 'Hello World!' });
        });

        this.app.post('/athena-intelligence', async (req, res) => {
            const query = req.body?.query;
            if (!query) {
                res.json({ error: 'Query not provided!' }).sendStatus(400);
                return;
            }

            const result = await this.bedrockAgent.sendQuery(query);
            res.json({ result });
        });
    }
}
