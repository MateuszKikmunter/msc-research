import path from 'node:path';
import { describe, expect, it, jest } from '@jest/globals';

import { CandidateResultCollector } from '../../runner/candidate-result-collector';
import { AgentResponseInspector } from '../../runner/agent-response-inspector';
import { RunResultWriter } from '../../runner/run-result-writer';
import { AthenaService } from '../../shared/services/athena/athena-service';
import {
    createAgentResponse,
    createTraceEvent
} from '../fixtures/agent-response';

describe('CandidateResultCollector', () => {
    it('retrieves and saves a complete original Athena result', async () => {
        const runDirectory = 'test-run';
        const athenaService = new AthenaService();
        jest.spyOn(athenaService, 'getQueryResult').mockResolvedValue({
            queryExecutionId: 'query-123',
            columns: [{ name: 'artist_count', type: 'bigint' }],
            rows: [['275']],
            rowCount: 1
        });
        const runResultWriter = new RunResultWriter();
        const writeCandidateResult = jest
            .spyOn(runResultWriter, 'writeCandidateResult')
            .mockResolvedValue(
                path.join(
                    runDirectory,
                    'candidate-results',
                    'CB200-E001-T01-A01.json'
                )
            );
        const collector = new CandidateResultCollector(
            runDirectory,
            athenaService,
            new AgentResponseInspector(),
            runResultWriter
        );

        const references = await collector.collect(candidateResponse(), {
            questionId: 'CB200-E001',
            turnNumber: null,
            interactionOrder: 1
        });

        expect(references).toEqual([
            {
                attempt: 1,
                queryExecutionId: 'query-123',
                status: 'saved',
                file: path.join('candidate-results', 'CB200-E001-T01-A01.json'),
                error: null
            }
        ]);

        expect(writeCandidateResult).toHaveBeenCalledWith(
            path.join(runDirectory, 'candidate-results'),
            'CB200-E001-T01-A01',
            {
                questionId: 'CB200-E001',
                turnNumber: null,
                interactionOrder: 1,
                attempt: 1,
                queryExecutionId: 'query-123',
                columns: [{ name: 'artist_count', type: 'bigint' }],
                rows: [['275']],
                rowCount: 1
            }
        );
    });

    it('records evaluator uncertainty without re-executing SQL', async () => {
        const runDirectory = 'test-run';
        const athenaService = new AthenaService();
        jest.spyOn(athenaService, 'getQueryResult').mockRejectedValue(
            new Error('Athena result expired')
        );
        const collector = new CandidateResultCollector(
            runDirectory,
            athenaService,
            new AgentResponseInspector(),
            new RunResultWriter()
        );

        const references = await collector.collect(candidateResponse(), {
            questionId: 'CB200-E001',
            turnNumber: null,
            interactionOrder: 1
        });

        expect(references).toEqual([
            {
                attempt: 1,
                queryExecutionId: 'query-123',
                status: 'evaluator_uncertain',
                file: null,
                error: 'Athena result expired'
            }
        ]);
    });
});

function candidateResponse() {
    return createAgentResponse({
        sqlAttempts: [
            {
                attempt: 1,
                query: 'SELECT COUNT(*) FROM artists',
                status: 'succeeded',
                error: null
            }
        ],
        traceEvents: [
            createTraceEvent({
                sequenceNumber: 1,
                traceId: 'trace-1',
                eventType: 'INVOCATION',
                actionInput: {
                    parameters: [
                        {
                            name: 'query',
                            value: 'SELECT COUNT(*) FROM artists'
                        }
                    ]
                }
            }),
            createTraceEvent({
                sequenceNumber: 2,
                traceId: 'trace-1',
                eventType: 'OBSERVATION',
                observation: { queryExecutionId: 'query-123' }
            })
        ]
    });
}
