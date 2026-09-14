import { setTimeout } from 'node:timers/promises';
import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    StartQueryExecutionCommand,
    StopQueryExecutionCommand,
    type Row
} from '@aws-sdk/client-athena';

import type { AthenaQueryResult, ResultColumn } from '../types';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_QUERY_TIMEOUT_MS = 120000;

export class AthenaService {
    private client: AthenaClient;

    public constructor() {
        this.client = new AthenaClient({});
    }

    public async executeQuery(sql: string): Promise<AthenaQueryResult> {
        const started = await this.client.send(
            new StartQueryExecutionCommand({
                QueryString: sql,
                QueryExecutionContext: {
                    Database: process.env.DATABASE_NAME ?? 'chinook'
                },
                ResultConfiguration: {
                    OutputLocation:
                        process.env.ATHENA_OUTPUT_LOCATION ?? 'athena-results'
                },
                WorkGroup:
                    process.env.ATHENA_WORKGROUP ?? 'chinook-athena-chinook'
            })
        );

        const queryExecutionId = started.QueryExecutionId;
        if (!queryExecutionId) {
            throw new Error('Athena did not return a query execution ID.');
        }

        await this.waitForCompletion(queryExecutionId);
        return this.readCompleteResult(queryExecutionId);
    }

    public async getQueryResult(
        queryExecutionId: string
    ): Promise<AthenaQueryResult> {
        if (!queryExecutionId.trim()) {
            throw new Error('Athena query execution ID not provided.');
        }

        return this.readCompleteResult(queryExecutionId);
    }

    private async waitForCompletion(queryExecutionId: string): Promise<void> {
        const timeoutMs = DEFAULT_QUERY_TIMEOUT_MS;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const execution = await this.client.send(
                new GetQueryExecutionCommand({
                    QueryExecutionId: queryExecutionId
                })
            );

            const status = execution.QueryExecution?.Status;
            if (status?.State === 'SUCCEEDED') {
                return;
            }

            if (status?.State === 'FAILED' || status?.State === 'CANCELLED') {
                throw new Error(
                    `Athena query ${status.State.toLowerCase()}: ${status.StateChangeReason ?? 'no reason provided'}`
                );
            }

            await setTimeout(DEFAULT_POLL_INTERVAL_MS);
        }

        await this.client.send(
            new StopQueryExecutionCommand({
                QueryExecutionId: queryExecutionId
            })
        );
        throw new Error(`Athena query timed out after ${timeoutMs} ms.`);
    }

    private async readCompleteResult(
        queryExecutionId: string
    ): Promise<AthenaQueryResult> {
        const rows: Array<Array<string | null>> = [];
        let columns: ResultColumn[] = [];
        let nextToken: string | undefined;
        let firstPage = true;

        do {
            const page = await this.client.send(
                new GetQueryResultsCommand({
                    QueryExecutionId: queryExecutionId,
                    MaxResults: 1000,
                    NextToken: nextToken
                })
            );

            if (columns.length === 0) {
                columns =
                    page.ResultSet?.ResultSetMetadata?.ColumnInfo?.map(
                        (column, index) => ({
                            name: column.Name ?? `column_${index + 1}`,
                            type: column.Type ?? 'unknown'
                        })
                    ) ?? [];
            }

            const returnedRows = page.ResultSet?.Rows ?? [];
            const dataRows = firstPage ? returnedRows.slice(1) : returnedRows;
            rows.push(
                ...dataRows.map((row) => this.formatRow(row, columns.length))
            );

            firstPage = false;
            nextToken = page.NextToken;
        } while (nextToken);

        return {
            queryExecutionId,
            columns,
            rows,
            rowCount: rows.length
        };
    }

    private formatRow(row: Row, columnCount: number): Array<string | null> {
        return Array.from(
            { length: columnCount },
            (_, index) => row.Data?.[index]?.VarCharValue ?? null
        );
    }
}
