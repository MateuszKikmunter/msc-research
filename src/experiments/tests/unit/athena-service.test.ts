import { describe, expect, it, jest } from '@jest/globals';
import {
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    StartQueryExecutionCommand
} from '@aws-sdk/client-athena';

import { AthenaService } from '../../shared/services/athena/athena-service';

describe('AthenaService', () => {
    it('retrieves every result page and excludes the header row', async () => {
        const send = jest.fn(async (command: object) => {
            if (command instanceof StartQueryExecutionCommand) {
                return { QueryExecutionId: 'query-123' };
            }

            if (command instanceof GetQueryExecutionCommand) {
                return {
                    QueryExecution: { Status: { State: 'SUCCEEDED' } }
                };
            }

            if (command instanceof GetQueryResultsCommand) {
                if (!command.input.NextToken) {
                    return {
                        ResultSet: {
                            ResultSetMetadata: {
                                ColumnInfo: [
                                    { Name: 'artist_id', Type: 'integer' },
                                    { Name: 'name', Type: 'varchar' }
                                ]
                            },
                            Rows: [
                                {
                                    Data: [
                                        { VarCharValue: 'artist_id' },
                                        { VarCharValue: 'name' }
                                    ]
                                },
                                {
                                    Data: [
                                        { VarCharValue: '1' },
                                        { VarCharValue: 'AC/DC' }
                                    ]
                                }
                            ]
                        },
                        NextToken: 'page-2'
                    };
                }

                return {
                    ResultSet: {
                        Rows: [
                            {
                                Data: [
                                    { VarCharValue: '2' },
                                    { VarCharValue: 'Accept' }
                                ]
                            }
                        ]
                    }
                };
            }

            throw new Error('Unexpected Athena command.');
        });
        const service = new AthenaService();
        Reflect.set(service, 'client', { send });

        const result = await service.executeQuery('SELECT artist_id, name');

        expect(result).toEqual({
            queryExecutionId: 'query-123',
            columns: [
                { name: 'artist_id', type: 'integer' },
                { name: 'name', type: 'varchar' }
            ],
            rows: [
                ['1', 'AC/DC'],
                ['2', 'Accept']
            ],
            rowCount: 2
        });
        expect(send).toHaveBeenCalledTimes(4);
    });

    it('reports an Athena execution failure', async () => {
        const send = jest.fn(async (command: object) => {
            if (command instanceof StartQueryExecutionCommand) {
                return { QueryExecutionId: 'query-456' };
            }

            return {
                QueryExecution: {
                    Status: {
                        State: 'FAILED',
                        StateChangeReason: 'COLUMN_NOT_FOUND'
                    }
                }
            };
        });
        const service = new AthenaService();
        Reflect.set(service, 'client', { send });

        await expect(service.executeQuery('SELECT missing')).rejects.toThrow(
            'Athena query failed: COLUMN_NOT_FOUND'
        );
    });
});
