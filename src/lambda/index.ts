import { BedrockActionEvent } from './types';
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
        return actionResponse(event, result);
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unknown query execution error';
        console.error('Query action failed', error);
        return actionResponse(event, { error: message }, 'REPROMPT');
    }
}
