import { setTimeout } from 'node:timers/promises';
import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    StartQueryExecutionCommand,
    StopQueryExecutionCommand,
    type Row
} from '@aws-sdk/client-athena';

import { QueryResult } from './types';

const DATABASE = process.env.DATABASE_NAME ?? 'chinook';
const WORK_GROUP = process.env.ATHENA_WORKGROUP ?? 'chinook-athena-chinook';
const OUTPUT_LOCATION = process.env.ATHENA_OUTPUT_LOCATION ?? 'athena-results';
const WAIT_TIME = 1000;
const MAX_ROWS = Number(process.env.MAX_RESULT_ROWS ?? 200);
const TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS ?? 120000);

const athena = new AthenaClient({});

export async function executeQuery(query: string): Promise<QueryResult> {
    console.info(
        'Submitting SQL to Athena',
        JSON.stringify({ query, database: DATABASE, workGroup: WORK_GROUP })
    );

    const started = await athena.send(
        new StartQueryExecutionCommand({
            QueryString: query,
            QueryExecutionContext: { Database: DATABASE },
            ResultConfiguration: { OutputLocation: OUTPUT_LOCATION },
            WorkGroup: WORK_GROUP
        })
    );

    const queryExecutionId = started.QueryExecutionId;
    if (!queryExecutionId) {
        throw new Error('Athena did not return a query execution ID.');
    }

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
        const execution = await athena.send(
            new GetQueryExecutionCommand({
                QueryExecutionId: queryExecutionId
            })
        );

        const status = execution.QueryExecution?.Status;
        if (status?.State === 'SUCCEEDED') {
            return collectResults(queryExecutionId, query);
        }

        if (status?.State === 'FAILED' || status?.State === 'CANCELLED') {
            throw new Error(
                `Athena query ${status.State.toLowerCase()}: ${status.StateChangeReason ?? 'no reason provided'}`
            );
        }

        await setTimeout(WAIT_TIME);
    }

    await athena.send(
        new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );

    throw new Error(`Athena query timed out after ${TIMEOUT_MS} ms.`);
}

async function collectResults(
    queryExecutionId: string,
    query: string
): Promise<QueryResult> {
    const rows: Array<Record<string, string | null>> = [];
    let columns: string[] = [];
    let nextToken: string | undefined;
    let isFirstPage = true;
    let truncated = false;

    while (true) {
        const page = await athena.send(
            new GetQueryResultsCommand({
                QueryExecutionId: queryExecutionId,
                MaxResults: Math.min(MAX_ROWS + 1, 1000),
                NextToken: nextToken
            })
        );

        columns =
            page.ResultSet?.ResultSetMetadata?.ColumnInfo?.map(
                (column, index) => column.Name ?? `column_${index + 1}`
            ) ?? columns;

        const returnedRows = page.ResultSet?.Rows ?? [];
        const dataRows = isFirstPage ? returnedRows.slice(1) : returnedRows;
        const remainingCapacity = MAX_ROWS - rows.length;
        const rowsToAdd = dataRows.slice(0, remainingCapacity);

        rows.push(...rowsToAdd.map((row) => formatRow(row, columns)));

        isFirstPage = false;
        nextToken = page.NextToken;

        const pageHasMoreRows = dataRows.length > rowsToAdd.length;
        const stoppedBeforeNextPage =
            Boolean(nextToken) && rows.length >= MAX_ROWS;
        truncated = pageHasMoreRows || stoppedBeforeNextPage;

        if (!nextToken || rows.length >= MAX_ROWS) {
            break;
        }
    }

    return { query, columns, rows, rowCount: rows.length, truncated };
}

function formatRow(row: Row, columns: string[]): Record<string, string | null> {
    return Object.fromEntries(
        columns.map((column, index) => [
            column,
            row.Data?.[index]?.VarCharValue ?? null
        ])
    );
}
