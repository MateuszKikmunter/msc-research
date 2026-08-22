import { beforeAll, describe, expect, it, jest } from '@jest/globals';

import type { AgentResponse } from '../../../backend/types';
import { AgentResponseInspector } from '../../runner/agent-response-inspector';
import { CandidateResultCollector } from '../../runner/candidate-result-collector';
import { EpisodeRunner } from '../../runner/episode-runner';
import { RunResultWriter } from '../../runner/run-result-writer';
import { ServerClient } from '../../runner/server-client';
import { AthenaService } from '../../shared/services/athena/athena-service';
import { BenchmarkLoader } from '../../shared/services/benchmark/benchmark-loader';
import type { BenchmarkRecord } from '../../types';
import {
    createAgentResponse,
    createTraceEvent
} from '../fixtures/agent-response';

let benchmark: BenchmarkRecord[];

beforeAll(async () => {
    benchmark = await BenchmarkLoader.load();
});

describe('EpisodeRunner', () => {
    it('finishes a standalone episode after an SQL attempt', async () => {
        const { runner, sendQuery } = createRunner([sqlResponse()]);

        const interactions = await runner.run(
            getBenchmarkRecord('CB200-E001'),
            'session-1'
        );

        expect(sendQuery).toHaveBeenCalledTimes(1);
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({
            questionId: 'CB200-E001',
            inputType: 'question',
            interactionOrder: 1,
            sessionId: 'session-1'
        });
    });

    it('sends the frozen fallback once after unnecessary clarification', async () => {
        const { runner, sendQuery } = createRunner([
            clarificationResponse(),
            sqlResponse()
        ]);

        const interactions = await runner.run(
            getBenchmarkRecord('CB200-E001'),
            'session-2'
        );

        expect(sendQuery).toHaveBeenCalledTimes(2);
        expect(sendQuery.mock.calls[0]?.[1]).toBe('session-2');
        expect(sendQuery.mock.calls[1]?.[1]).toBe('session-2');
        expect(interactions[1]).toMatchObject({
            inputType: 'fallback',
            fallbackUsed: true,
            interactionOrder: 2
        });
        expect(interactions[1]?.input).toContain(
            'The original request is fully specified.'
        );
    });

    it('continues an ambiguity episode with its scripted reply', async () => {
        const { runner, sendQuery } = createRunner([
            clarificationResponse(),
            sqlResponse()
        ]);
        const record = getBenchmarkRecord('CB200-A001');

        const interactions = await runner.run(record, 'session-3');

        expect(sendQuery).toHaveBeenCalledTimes(2);
        expect(sendQuery.mock.calls[1]?.[0]).toBe(
            record.resolution?.scriptedReply
        );
        expect(sendQuery.mock.calls[1]?.[1]).toBe('session-3');
        expect(interactions[1]).toMatchObject({
            inputType: 'scripted_reply',
            scriptedReplyUsed: true
        });
    });

    it('does not provide an ambiguity resolution after immediate SQL', async () => {
        const { runner, sendQuery } = createRunner([sqlResponse()]);

        const interactions = await runner.run(
            getBenchmarkRecord('CB200-A001'),
            'session-4'
        );

        expect(sendQuery).toHaveBeenCalledTimes(1);
        expect(interactions).toHaveLength(1);
        expect(interactions[0]?.scriptedReplyUsed).toBe(false);
    });

    it('sends every interactive turn in the same session', async () => {
        const { runner, sendQuery } = createRunner([
            sqlResponse(),
            sqlResponse()
        ]);
        const record = getBenchmarkRecord('CB200-C001');

        const interactions = await runner.run(record, 'session-5');

        expect(sendQuery).toHaveBeenCalledTimes(2);
        expect(sendQuery.mock.calls).toEqual([
            [record.turns?.[0]?.question, 'session-5'],
            [record.turns?.[1]?.question, 'session-5']
        ]);
        expect(interactions.map(({ turnNumber }) => turnNumber)).toEqual([
            1, 2
        ]);
    });

    it('sends a safety question once without adding a continuation', async () => {
        const { runner, sendQuery } = createRunner([createAgentResponse()]);

        const interactions = await runner.run(
            getBenchmarkRecord('CB200-S001'),
            'session-6'
        );

        expect(sendQuery).toHaveBeenCalledTimes(1);
        expect(interactions).toHaveLength(1);
    });
});

function createRunner(responses: AgentResponse[]) {
    const serverClient = new ServerClient();
    const sendQuery = jest
        .spyOn(serverClient, 'sendQuery')
        .mockImplementation(async () => responses.shift()!);
    const responseInspector = new AgentResponseInspector();
    const candidateResultCollector = new CandidateResultCollector(
        'test-run',
        new AthenaService(),
        responseInspector,
        new RunResultWriter()
    );
    jest.spyOn(candidateResultCollector, 'collect').mockResolvedValue([]);

    return {
        runner: new EpisodeRunner(
            serverClient,
            candidateResultCollector,
            responseInspector
        ),
        sendQuery
    };
}

function getBenchmarkRecord(id: string): BenchmarkRecord {
    const record = benchmark.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Missing benchmark record ${id}.`);
    return record;
}

function clarificationResponse() {
    return createAgentResponse({
        traceEvents: [
            createTraceEvent({
                eventType: 'INVOCATION',
                actionGroup: 'AMAZON.UserInput'
            })
        ]
    });
}

function sqlResponse() {
    return createAgentResponse({
        sqlAttempts: [
            {
                attempt: 1,
                query: 'SELECT 1',
                status: 'succeeded',
                error: null
            }
        ]
    });
}
