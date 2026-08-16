export interface BedrockActionEvent {
    actionGroup: string;
    function: string;
    parameters?: Array<{ name: string; type?: string; value: string }>;
    sessionAttributes?: Record<string, string>;
    promptSessionAttributes?: Record<string, string>;
}

export interface QueryResult {
    queryExecutionId: string;
    query: string;
    columns: string[];
    rows: Array<Record<string, string | null>>;
    previewRowCount: number;
    previewTruncated: boolean;
}

export type ActionResponseState = 'FAILURE' | 'REPROMPT';

export class UnsafeQueryError extends Error {}
