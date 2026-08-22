import { setTimeout } from 'node:timers/promises';
import { describe, expect, it, jest } from '@jest/globals';

import { AgentResponseInspector } from '../../runner/agent-response-inspector';
import { CandidateResultCollector } from '../../runner/candidate-result-collector';
import { EpisodeRunner } from '../../runner/episode-runner';
import { QuestionRunner } from '../../runner/question-runner';
import { RunResultWriter } from '../../runner/run-result-writer';
import { ServerClient } from '../../runner/server-client';
import { AthenaService } from '../../shared/services/athena/athena-service';
import type { BenchmarkRecord } from '../../types';
import { createAgentResponse } from '../fixtures/agent-response';

jest.mock('node:timers/promises', () => ({
    setTimeout: jest.fn(() => Promise.resolve())
}));

describe('QuestionRunner', () => {
    it('runs every benchmark record sequentially with a new session', async () => {
        const benchmark = [
            benchmarkRecord('CB200-E001'),
            benchmarkRecord('CB200-E002')
        ];
        const episodeRunner = createEpisodeRunner();
        const responseInspector = new AgentResponseInspector();
        const firstInteraction = interactionRecord(
            'CB200-E001',
            'session-from-episode-1',
            responseInspector
        );
        const secondInteraction = interactionRecord(
            'CB200-E002',
            'session-from-episode-2',
            responseInspector
        );
        const runEpisode = jest
            .spyOn(episodeRunner, 'run')
            .mockResolvedValueOnce([firstInteraction])
            .mockResolvedValueOnce([secondInteraction]);
        const runResultWriter = new RunResultWriter();
        const appendInteraction = jest
            .spyOn(runResultWriter, 'appendInteraction')
            .mockResolvedValue('test-run/interactions.jsonl');
        const runner = new QuestionRunner(
            episodeRunner,
            runResultWriter,
            'test-run'
        );

        const result = await runner.run(benchmark, 'nova-lite', 1);

        expect(runEpisode).toHaveBeenNthCalledWith(
            1,
            benchmark[0],
            expect.any(String)
        );
        expect(runEpisode).toHaveBeenNthCalledWith(
            2,
            benchmark[1],
            expect.any(String)
        );
        expect(runEpisode.mock.calls[0]?.[1]).not.toBe(
            runEpisode.mock.calls[1]?.[1]
        );
        expect(result).toMatchObject({
            modelCondition: 'nova-lite',
            repetition: 1,
            interactions: [firstInteraction, secondInteraction]
        });
        expect(result.startedAt).toBeTruthy();
        expect(result.completedAt).toBeTruthy();
        expect(appendInteraction).toHaveBeenNthCalledWith(1, 'test-run', {
            modelCondition: 'nova-lite',
            repetition: 1,
            ...firstInteraction
        });
        expect(appendInteraction).toHaveBeenNthCalledWith(2, 'test-run', {
            modelCondition: 'nova-lite',
            repetition: 1,
            ...secondInteraction
        });
        expect(setTimeout).toHaveBeenCalledWith(5000);
    });

    it('reports the current case and session when execution fails', async () => {
        const episodeRunner = createEpisodeRunner();
        jest.spyOn(episodeRunner, 'run').mockRejectedValue(
            new Error('Server unavailable')
        );
        const runner = new QuestionRunner(
            episodeRunner,
            new RunResultWriter(),
            'test-run'
        );

        await expect(
            runner.run([benchmarkRecord('CB200-E001')], 'nova-lite', 1)
        ).rejects.toThrow(
            /Benchmark execution stopped at CB200-E001 \(session .+\)\./
        );
    });
});

function createEpisodeRunner(): EpisodeRunner {
    const responseInspector = new AgentResponseInspector();
    const candidateResultCollector = new CandidateResultCollector(
        'test-run',
        new AthenaService(),
        responseInspector,
        new RunResultWriter()
    );

    return new EpisodeRunner(
        new ServerClient(),
        candidateResultCollector,
        responseInspector
    );
}

function benchmarkRecord(id: string): BenchmarkRecord {
    return {
        id,
        difficulty: 'easy',
        category: 'single_table_count',
        expected_behavior: 'execute',
        question: 'How many artists are in the catalogue?'
    };
}

function interactionRecord(
    questionId: string,
    sessionId: string,
    responseInspector: AgentResponseInspector
) {
    return {
        questionId,
        difficulty: 'easy',
        category: 'single_table_count',
        turnNumber: null,
        interactionOrder: 1,
        inputType: 'question' as const,
        input: 'How many artists are in the catalogue?',
        sessionId,
        fallbackUsed: false,
        scriptedReplyUsed: false,
        response: responseInspector.sanitizeForStorage(createAgentResponse()),
        candidateResults: []
    };
}
