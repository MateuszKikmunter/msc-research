import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeJsonFile } from '../shared/services/storage/json-file-writer';
import type { RateMetric, RunEvaluation, RunMetrics } from '../types';

interface WriteEvaluationReportOptions {
    runDirectory: string;
    runEvaluation: RunEvaluation;
    runMetrics: RunMetrics;
}

export class EvaluationReportWriter {
    public async write(options: WriteEvaluationReportOptions): Promise<void> {
        const outputDirectory = path.join(options.runDirectory, 'evaluation');

        await writeJsonFile(
            path.join(outputDirectory, 'results.json'),
            options.runEvaluation
        );
        await writeJsonFile(
            path.join(outputDirectory, 'summary.json'),
            options.runMetrics
        );
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(
            path.join(outputDirectory, 'summary.md'),
            this.toMarkdown(options.runMetrics),
            'utf8'
        );
    }

    private toMarkdown(metrics: RunMetrics): string {
        return [
            '# Evaluation summary',
            '',
            `- Model: \`${metrics.modelCondition}\``,
            `- Repetition: ${metrics.repetition}`,
            '',
            '## Standalone executable cases',
            '',
            ...(metrics.standalone.trajectoryClassCounts.SYSTEM_ERROR > 0
                ? [
                      'Provisional: system-error cases are excluded from model metrics. Rates use the evaluable denominator; excluded cases remain in the trajectory counts.',
                      ''
                  ]
                : []),
            '| Metric | Score |',
            '| --- | ---: |',
            this.rateRow(
                'Final Success Rate',
                metrics.standalone.finalSuccessRate
            ),
            this.rateRow(
                'Clean Direct Success Rate',
                metrics.standalone.cleanDirectSuccessRate
            ),
            this.rateRow(
                'Final-to-Direct Success Gap',
                metrics.standalone.finalToDirectGap
            ),
            this.rateRow(
                'Recovered Success Contribution',
                metrics.standalone.recoveredSuccessContribution
            ),
            this.rateRow('Recovery Rate', metrics.standalone.recoveryRate),
            this.rateRow(
                'Unnecessary Clarification Rate',
                metrics.standalone.unnecessaryClarificationRate
            ),
            `| Execution-error recoveries | ${metrics.standalone.executionErrorRecoveryCount} |`,
            `| Semantic-revision recoveries | ${metrics.standalone.semanticRevisionRecoveryCount} |`,
            '',
            '## Standalone trajectory classes',
            '',
            '| Trajectory class | Count |',
            '| --- | ---: |',
            ...this.countRows(metrics.standalone.trajectoryClassCounts),
            '',
            '## Athena error responses',
            '',
            `Total correlated transitions: ${metrics.errorResponse.transitionCount}`,
            '',
            '| Response category | Count |',
            '| --- | ---: |',
            ...this.countRows(metrics.errorResponse.categoryCounts),
            '',
            this.rateLine(
                'Observation-conditioned Recovery Rate',
                metrics.errorResponse.observationConditionedRecoveryRate
            ),
            '',
            '## Ambiguity cases',
            '',
            this.rateLine(
                'Clarification Detection Rate',
                metrics.ambiguity.clarificationDetectionRate
            ),
            this.rateLine(
                'Missed Clarification Rate',
                metrics.ambiguity.missedClarificationRate
            ),
            `- Scripted continuations: ${metrics.ambiguity.scriptedContinuationCount}`,
            this.rateLine(
                'Post-clarification Accuracy',
                metrics.ambiguity.postClarificationAccuracy
            ),
            '',
            '## Interactive cases',
            '',
            this.rateLine('Turn Accuracy', metrics.interactive.turnAccuracy),
            this.rateLine(
                'Complete Episode Accuracy',
                metrics.interactive.completeEpisodeAccuracy
            ),
            '',
            '## Safety and out-of-domain cases',
            '',
            this.rateLine('No-Query Rate', metrics.safety.noQueryRate),
            `- Unreviewed cases: ${metrics.safety.unreviewedCount}`,
            '',
            '| Manual label | Count |',
            '| --- | ---: |',
            ...this.countRows(metrics.safety.manualLabelCounts),
            '',
            '## Standalone results by difficulty',
            '',
            '| Difficulty | FSR | CDSR | FDG | Median SQL attempts |',
            '| --- | ---: | ---: | ---: | ---: |',
            ...Object.entries(metrics.byDifficulty).map(
                ([difficulty, values]) =>
                    `| ${difficulty} | ${this.formatRate(values.finalSuccessRate)} | ${this.formatRate(values.cleanDirectSuccessRate)} | ${this.formatRate(values.finalToDirectGap)} | ${values.medianSqlAttemptCount ?? 'N/A'} |`
            ),
            '',
            ...Object.entries(metrics.byDifficulty).flatMap(
                ([difficulty, values]) => [
                    `### ${difficulty} trajectory classes`,
                    '',
                    '| Trajectory class | Count |',
                    '| --- | ---: |',
                    ...this.countRows(values.trajectoryClassCounts),
                    ''
                ]
            )
        ].join('\n');
    }

    private rateRow(label: string, metric: RateMetric): string {
        return `| ${label} | ${this.formatRate(metric)} |`;
    }

    private rateLine(label: string, metric: RateMetric): string {
        return `- ${label}: ${this.formatRate(metric)}`;
    }

    private formatRate(metric: RateMetric): string {
        const value =
            metric.rate === null ? 'N/A' : `${(metric.rate * 100).toFixed(2)}%`;
        return `${value} (${metric.numerator}/${metric.denominator})`;
    }

    private countRows(counts: Record<string, number>): string[] {
        return Object.entries(counts).map(
            ([label, count]) => `| \`${label}\` | ${count} |`
        );
    }
}
