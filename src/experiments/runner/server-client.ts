import type { AgentResponse } from '../../backend/types';

const DEFAULT_SERVER_ADDRESS = 'http://localhost:8000/api/analytics-pipeline';

export class ServerClient {
    public async sendQuery(
        query: string,
        sessionId: string
    ): Promise<AgentResponse> {
        if (!query.trim()) {
            throw new Error('Query not provided!');
        }

        if (!sessionId.trim()) {
            throw new Error('Session ID not provided!');
        }

        const response = await fetch(DEFAULT_SERVER_ADDRESS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, sessionId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                `Server error: ${errorData?.error ?? 'Unknown error'}`
            );
        }

        return (await response.json()) as AgentResponse;
    }
}
