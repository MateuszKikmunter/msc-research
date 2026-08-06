import { ActionResponseState, BedrockActionEvent } from './types';

export function actionResponse(
    event: BedrockActionEvent,
    payload: unknown,
    responseState?: ActionResponseState
) {
    return {
        messageVersion: '1.0',
        response: {
            actionGroup: event.actionGroup,
            function: event.function,
            functionResponse: {
                ...(responseState ? { responseState } : {}),
                responseBody: {
                    TEXT: {
                        body: JSON.stringify(payload)
                    }
                }
            }
        },
        sessionAttributes: event.sessionAttributes ?? {},
        promptSessionAttributes: event.promptSessionAttributes ?? {}
    };
}
