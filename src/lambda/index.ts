import { BedrockActionEvent, HttpCode, UnsafeQueryError } from './types';
import { validateReadOnlyQuery } from './query-validator';
import { executeQuery } from './query-executor';
import { extractQuery } from './query-extractor';
import { actionResponse } from './response-formatter';

export async function handler(event: BedrockActionEvent) {
    console.info('Received Bedrock action', JSON.stringify(event));

    try {
        const query = extractQuery(event);
        validateReadOnlyQuery(query);
        const result = await executeQuery(query);
        return actionResponse(event, HttpCode.OK, result);
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unknown query execution error';
        const statusCode =
            error instanceof UnsafeQueryError
                ? HttpCode.BAD_REQUEST
                : HttpCode.INTERNAL_SERVER_ERROR;
        console.error('Query action failed', error);
        return actionResponse(event, statusCode, { error: message });
    }
}
