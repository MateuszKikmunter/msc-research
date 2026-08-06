export interface BedrockActionEvent {
    actionGroup: string;
    function: string;
    parameters?: Array<{ name: string; type?: string; value: string }>;
    sessionAttributes?: Record<string, string>;
    promptSessionAttributes?: Record<string, string>;
}

export interface QueryResult {
    query: string;
    columns: string[];
    rows: Array<Record<string, string | null>>;
    rowCount: number;
    truncated: boolean;
}

export type ActionResponseState = 'FAILURE' | 'REPROMPT';

export class UnsafeQueryError extends Error {}
