import express, { Application } from 'express';
import { config } from 'dotenv';
import path from 'node:path';

import { BedrockAgentClient } from './services/bedrock-agent-client';
import { HttpCode } from './types';

export class Server {
    private app: Application;
    private port = process.env.PORT ?? '8000';
    private bedrockAgent: BedrockAgentClient;

    constructor() {
        this.app = express();
        this.init();
        this.bedrockAgent = new BedrockAgentClient();
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
            if (!query.trim()) {
                res.status(HttpCode.BAD_REQUEST).json({
                    error: 'Query not provided!'
                });
                return;
            }

            const sessionId = req.body?.sessionId;
            if (!sessionId.trim()) {
                res.status(HttpCode.BAD_REQUEST).json({
                    error: 'Session ID not provided!'
                });
                return;
            }

            try {
                const result = await this.bedrockAgent.sendQuery(
                    query.trim(),
                    sessionId.trim()
                );
                res.json(result);
            } catch (error) {
                console.error(error);
                res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
                    error: 'Bedrock request failed'
                });
            }
        });
    }
}
