import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { writeEvaluationReport } from '../../evaluation/evaluation-report-writer';
import type { RunEvaluation, RunMetrics, TrajectoryClass } from '../../types';

jest.mock('node:fs/promises', () => ({
    mkdir: jest.fn(),
    writeFile: jest.fn()
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('EvaluationReportWriter', () => {
    const runDirectory = path.join('runs', 'nova-lite', 'repetition-1');
    const outputDirectory = path.join(runDirectory, 'evaluation');
    const runEvaluation = createRunEvaluation();
    const runMetrics = createRunMetrics();

    it('writes the complete evaluation and metrics as formatted JSON', async () => {
        await writeEvaluationReport({
            runDirectory,
            runEvaluation,
            runMetrics
        });

        expect(mkdir).toHaveBeenCalledWith(outputDirectory, {
            recursive: true
        });
        expect(writeFile).toHaveBeenNthCalledWith(
            1,
            path.join(outputDirectory, 'results.json'),
            `${JSON.stringify(runEvaluation, null, 4)}\n`,
            'utf8'
        );
        expect(writeFile).toHaveBeenNthCalledWith(
            2,
            path.join(outputDirectory, 'summary.json'),
            `${JSON.stringify(runMetrics, null, 4)}\n`,
            'utf8'
        );
    });

    it('writes a readable Markdown summary with counts and explicit unavailable rates', async () => {
        await writeEvaluationReport({
            runDirectory,
            runEvaluation,
            runMetrics
        });

        expect(writeFile).toHaveBeenNthCalledWith(
            3,
            path.join(outputDirectory, 'summary.md'),
            expect.stringContaining(
                '| Final Success Rate | 75.00% (120/160) |'
            ),
            'utf8'
        );
        const markdown = jest.mocked(writeFile).mock.calls[2]?.[1];
        expect(markdown).toEqual(
            expect.stringContaining(
                'Provisional: system-error cases are excluded'
            )
        );
        expect(markdown).toEqual(
            expect.stringContaining(
                '- Observation-conditioned Recovery Rate: N/A (0/0)'
            )
        );
        expect(markdown).toEqual(
            expect.stringContaining('| `DIRECT_SUCCESS` | 100 |')
        );
        expect(markdown).toEqual(
            expect.stringContaining('| easy | 80.00% (40/50) |')
        );
        expect(markdown).toEqual(
            expect.stringContaining(
                '### easy trajectory classes\n\n| Trajectory class | Count |\n| --- | ---: |\n| `DIRECT_SUCCESS` | 35 |'
            )
        );
    });
});

function createRunEvaluation(): RunEvaluation {
    return {
        modelCondition: 'nova-lite',
        repetition: 1,
        episodes: []
    };
}

function createRunMetrics(): RunMetrics {
    return {
        modelCondition: 'nova-lite',
        repetition: 1,
        standalone: {
            finalSuccessRate: rate(120, 160),
            cleanDirectSuccessRate: rate(100, 160),
            finalToDirectGap: rate(20, 160),
            recoveredSuccessContribution: rate(20, 120),
            recoveryRate: rate(20, 40),
            unnecessaryClarificationRate: rate(2, 160),
            trajectoryClassCounts: trajectoryClassCounts({
                DIRECT_SUCCESS: 100,
                EXECUTION_ERROR_RECOVERED: 12,
                SEMANTIC_REVISION_SUCCESS: 8,
                EXECUTED_SEMANTIC_FAILURE: 20,
                UNRECOVERED_EXECUTION_FAILURE: 10,
                NO_SQL: 10,
                SYSTEM_ERROR: 5
            }),
            executionErrorRecoveryCount: 12,
            semanticRevisionRecoveryCount: 8
        },
        errorResponse: {
            transitionCount: 0,
            categoryCounts: {
                no_retry: 0,
                retry_executed_successfully: 0,
                retry_repeated_same_error: 0,
                retry_produced_different_error: 0,
                transition_uncertain: 0
            },
            observationConditionedRecoveryRate: rate(0, 0)
        },
        ambiguity: {
            clarificationDetectionRate: rate(18, 20),
            missedClarificationRate: rate(2, 20),
            scriptedContinuationCount: 18,
            postClarificationAccuracy: rate(15, 18)
        },
        interactive: {
            turnAccuracy: rate(8, 10),
            completeEpisodeAccuracy: rate(3, 5)
        },
        safety: {
            noQueryRate: rate(8, 10),
            manualLabelCounts: {
                compliant: 0,
                partially_compliant: 0,
                non_compliant: 0,
                uncertain: 0
            },
            unreviewedCount: 10
        },
        byDifficulty: {
            easy: {
                finalSuccessRate: rate(40, 50),
                cleanDirectSuccessRate: rate(35, 50),
                finalToDirectGap: rate(5, 50),
                trajectoryClassCounts: trajectoryClassCounts({
                    DIRECT_SUCCESS: 35
                }),
                medianSqlAttemptCount: 1
            }
        }
    };
}

function rate(numerator: number, denominator: number) {
    return {
        numerator,
        denominator,
        rate: denominator === 0 ? null : numerator / denominator
    };
}

function trajectoryClassCounts(
    overrides: Partial<Record<TrajectoryClass, number>> = {}
): Record<TrajectoryClass, number> {
    return {
        DIRECT_SUCCESS: 0,
        EXECUTION_ERROR_RECOVERED: 0,
        SEMANTIC_REVISION_SUCCESS: 0,
        EXECUTED_SEMANTIC_FAILURE: 0,
        UNRECOVERED_EXECUTION_FAILURE: 0,
        NO_SQL: 0,
        SYSTEM_ERROR: 0,
        ...overrides
    };
}
