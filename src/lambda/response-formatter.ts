import { BedrockActionEvent } from './types';

export function actionResponse(
    event: BedrockActionEvent,
    httpStatusCode: number,
    payload: unknown,
) {
    return {
        messageVersion: '1.0',
        response: {
            actionGroup: event.actionGroup,
            apiPath: event.apiPath,
            httpMethod: event.httpMethod,
            httpStatusCode,
            responseBody: {
                'application/json': {
                    body: JSON.stringify(payload),
                },
            },
        },
        sessionAttributes: event.sessionAttributes ?? {},
    };
}
