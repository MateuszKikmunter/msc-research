import path from 'node:path';

import type { AgentResponse } from '../../backend/types';
import { getErrorMessage } from '../shared/error-message';
import type { CandidateResultFile, CandidateResultReference } from '../types';
import { AthenaService } from '../shared/services/athena/athena-service';
import { AgentResponseInspector } from './agent-response-inspector';
import { RunResultWriter } from './run-result-writer';

type CandidateResultContext = Pick<
    CandidateResultFile,
    'questionId' | 'turnNumber' | 'interactionOrder'
>;

export class CandidateResultCollector {
    private readonly athenaService: AthenaService;
    private readonly responseInspector: AgentResponseInspector;
    private readonly runResultWriter: RunResultWriter;
    private readonly runDirectory: string;
    private readonly outputDirectory: string;

    public constructor(
        runDirectory: string,
        athenaService: AthenaService,
        responseInspector: AgentResponseInspector,
        runResultWriter: RunResultWriter
    ) {
        this.athenaService = athenaService;
        this.responseInspector = responseInspector;
        this.runResultWriter = runResultWriter;
        this.runDirectory = runDirectory;
        this.outputDirectory = path.join(runDirectory, 'candidate-results');
    }

    public async collect(
        response: AgentResponse,
        context: CandidateResultContext
    ): Promise<CandidateResultReference[]> {
        const executions =
            this.responseInspector.getCandidateQueryExecutions(response);
        const references: CandidateResultReference[] = [];

        for (const execution of executions) {
            try {
                const result = await this.athenaService.getQueryResult(
                    execution.queryExecutionId
                );
                const artifactId = this.createArtifactId(
                    context,
                    execution.attempt
                );
                const candidateResult: CandidateResultFile = {
                    questionId: context.questionId,
                    turnNumber: context.turnNumber,
                    interactionOrder: context.interactionOrder,
                    attempt: execution.attempt,
                    queryExecutionId: execution.queryExecutionId,
                    columns: result.columns,
                    rows: result.rows,
                    rowCount: result.rowCount
                };
                const outputPath =
                    await this.runResultWriter.writeCandidateResult(
                        this.outputDirectory,
                        artifactId,
                        candidateResult
                    );

                references.push({
                    attempt: execution.attempt,
                    queryExecutionId: execution.queryExecutionId,
                    status: 'saved',
                    file: path.relative(this.runDirectory, outputPath),
                    error: null
                });
            } catch (error) {
                references.push({
                    attempt: execution.attempt,
                    queryExecutionId: execution.queryExecutionId,
                    status: 'evaluator_uncertain',
                    file: null,
                    error: getErrorMessage(error)
                });
            }
        }

        return references;
    }

    private createArtifactId(
        context: CandidateResultContext,
        attempt: number
    ): string {
        const interaction = String(context.interactionOrder).padStart(2, '0');
        const attemptNumber = String(attempt).padStart(2, '0');
        return `${context.questionId}-T${interaction}-A${attemptNumber}`;
    }
}
