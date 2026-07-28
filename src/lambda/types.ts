export interface BedrockActionEvent {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    requestBody?: {
        content?: {
            'application/json'?: {
                properties?: Array<{ name: string; value: string }>;
            };
        };
    };
    sessionAttributes?: Record<string, string>;
}

export interface QueryResult {
    query: string;
    columns: string[];
    rows: Array<Record<string, string | null>>;
    rowCount: number;
    truncated: boolean;
}

export const HttpCode = {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
} as const;

export class UnsafeQueryError extends Error {}
