import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { evaluateAttempts } from '../../evaluation/episode-evaluator';
import * as artifactLoader from '../../evaluation/evaluation-input';
import type {
    CandidateResultFile,
    GoldenResultFile,
    GoldQueryDefinition,
    StoredRunInteraction
} from '../../types';
import { createStoredRunInteraction } from '../fixtures/run-interaction';

const goldDefinition: GoldQueryDefinition = {
    artifactId: 'CB200-E001',
    questionId: 'CB200-E001',
    turnNumber: null,
    sql: 'SELECT COUNT(*) AS artist_count FROM artists',
    comparison: {
        mode: 'exact_result',
        requiredColumns: ['artist_count'],
        orderMatters: false,
        columnOrderMatters: true,
        preserveDuplicates: true,
        numericTolerance: 0.000001,
        rowLimit: null,
        topNTiePolicy: null,
        compareColumnNames: false,
        allowExtraColumns: false
    }
};

const goldenResult: GoldenResultFile = {
    questionId: 'CB200-E001',
    turnNumber: null,
    columns: [{ name: 'artist_count', type: 'bigint' }],
    rows: [['275']],
    rowCount: 1
};

const candidateResult: CandidateResultFile = {
    questionId: 'CB200-E001',
    turnNumber: null,
    interactionOrder: 1,
    attempt: 1,
    queryExecutionId: 'query-1',
    columns: [{ name: 'artists', type: 'bigint' }],
    rows: [['275']],
    rowCount: 1
};

describe('evaluateAttempts', () => {
    const attemptEvaluator = {
        evaluate: (options: Parameters<typeof evaluateAttempts>[0]) =>
            evaluateAttempts(options, {
                goldenResultDirectory: 'golden-sql',
                runDirectory: 'run'
            })
    };

    beforeEach(() => {
        jest.spyOn(artifactLoader, 'loadGoldenResult').mockResolvedValue(
            goldenResult
        );
        jest.spyOn(artifactLoader, 'loadCandidateResult').mockResolvedValue(
            candidateResult
        );
    });

    it('evaluates an execution error and a successful recovery separately', async () => {
        jest.mocked(artifactLoader.loadCandidateResult).mockResolvedValue({
            ...candidateResult,
            attempt: 2,
            queryExecutionId: 'query-2'
        });
        const interaction = createStoredRunInteraction({
            response: {
                ...createStoredRunInteraction().response,
                sqlAttempts: [
                    {
                        attempt: 1,
                        query: 'SELECT missing FROM artists',
                        status: 'failed',
                        error: 'COLUMN_NOT_FOUND: missing'
                    },
                    {
                        attempt: 2,
                        query: goldDefinition.sql,
                        status: 'succeeded',
                        error: null
                    }
                ]
            },
            candidateResults: [
                {
                    attempt: 2,
                    queryExecutionId: 'query-2',
                    status: 'saved',
                    file: 'candidate-results/CB200-E001-T01-A02.json',
                    error: null
                }
            ]
        });

        await expect(
            attemptEvaluator.evaluate({ interaction, goldDefinition })
        ).resolves.toEqual([
            {
                interactionOrder: 1,
                turnNumber: null,
                attempt: 1,
                query: 'SELECT missing FROM artists',
                executionStatus: 'failed',
                outcome: 'execution_error',
                resultCorrect: null,
                queryExecutionId: null,
                reason: 'COLUMN_NOT_FOUND: missing'
            },
            {
                interactionOrder: 1,
                turnNumber: null,
                attempt: 2,
                query: goldDefinition.sql,
                executionStatus: 'succeeded',
                outcome: 'correct',
                resultCorrect: true,
                queryExecutionId: 'query-2',
                reason: null
            }
        ]);
    });

    it('evaluates multiple failed attempts without candidate-result files', async () => {
        const interaction = createStoredRunInteraction({
            response: {
                ...createStoredRunInteraction().response,
                sqlAttempts: [
                    {
                        attempt: 1,
                        query: 'SELECT missing FROM artists',
                        status: 'failed',
                        error: 'COLUMN_NOT_FOUND: missing'
                    },
                    {
                        attempt: 2,
                        query: 'SELECT other_missing FROM artists',
                        status: 'failed',
                        error: 'COLUMN_NOT_FOUND: other_missing'
                    }
                ]
            },
            candidateResults: []
        });

        const evaluations = await attemptEvaluator.evaluate({
            interaction,
            goldDefinition
        });

        expect(evaluations.map(({ outcome }) => outcome)).toEqual([
            'execution_error',
            'execution_error'
        ]);
        expect(artifactLoader.loadGoldenResult).not.toHaveBeenCalled();
        expect(artifactLoader.loadCandidateResult).not.toHaveBeenCalled();
    });

    it('marks an executable but different result as a semantic error', async () => {
        jest.spyOn(artifactLoader, 'loadCandidateResult').mockResolvedValue({
            ...candidateResult,
            rows: [['274']]
        });
        const interaction = succeededInteraction();

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction,
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            outcome: 'semantic_error',
            resultCorrect: false
        });
    });

    it('returns no attempt evaluations when the interaction contains no SQL', async () => {
        const evaluations = await attemptEvaluator.evaluate({
            interaction: createStoredRunInteraction(),
            goldDefinition
        });

        expect(evaluations).toEqual([]);
        expect(artifactLoader.loadGoldenResult).not.toHaveBeenCalled();
        expect(artifactLoader.loadCandidateResult).not.toHaveBeenCalled();
    });

    it('is uncertain when a successful attempt has no candidate reference', async () => {
        const interaction = succeededInteraction({ candidateResults: [] });

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction,
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            outcome: 'evaluator_uncertain',
            reason: 'Successful SQL attempt has no candidate-result reference.'
        });
    });

    it('uses the result-capture error when the candidate was not saved', async () => {
        const interaction = succeededInteraction({
            candidateResults: [
                {
                    attempt: 1,
                    queryExecutionId: 'query-1',
                    status: 'evaluator_uncertain',
                    file: null,
                    error: 'Athena result is unavailable.'
                }
            ]
        });

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction,
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            outcome: 'evaluator_uncertain',
            queryExecutionId: 'query-1',
            reason: 'Athena result is unavailable.'
        });
    });

    it('is uncertain when a saved candidate file cannot be loaded', async () => {
        jest.spyOn(artifactLoader, 'loadCandidateResult').mockRejectedValue(
            new Error('File not found')
        );

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction: succeededInteraction(),
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            outcome: 'evaluator_uncertain',
            reason: 'Could not load candidate result: File not found'
        });
    });

    it('is uncertain when the golden result cannot be loaded', async () => {
        jest.spyOn(artifactLoader, 'loadGoldenResult').mockRejectedValue(
            new Error('Golden file not found')
        );

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction: succeededInteraction(),
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            outcome: 'evaluator_uncertain',
            reason: 'Could not load golden result: Golden file not found'
        });
    });

    it('is uncertain when an attempt has no final execution status', async () => {
        const interaction = createStoredRunInteraction({
            response: {
                ...createStoredRunInteraction().response,
                sqlAttempts: [
                    {
                        attempt: 1,
                        query: goldDefinition.sql,
                        status: 'pending',
                        error: null
                    }
                ]
            }
        });

        const [evaluation] = await attemptEvaluator.evaluate({
            interaction,
            goldDefinition
        });

        expect(evaluation).toMatchObject({
            executionStatus: 'pending',
            outcome: 'evaluator_uncertain',
            reason: 'SQL attempt has no final execution status.'
        });
    });
});

function succeededInteraction(overrides: Partial<StoredRunInteraction> = {}) {
    return createStoredRunInteraction({
        response: {
            ...createStoredRunInteraction().response,
            sqlAttempts: [
                {
                    attempt: 1,
                    query: goldDefinition.sql,
                    status: 'succeeded',
                    error: null
                }
            ]
        },
        candidateResults: [
            {
                attempt: 1,
                queryExecutionId: 'query-1',
                status: 'saved',
                file: 'candidate-results/CB200-E001-T01-A01.json',
                error: null
            }
        ],
        ...overrides
    });
}
