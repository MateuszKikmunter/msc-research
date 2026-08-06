import { BedrockActionEvent, UnsafeQueryError } from './types';

export function extractQuery(event: BedrockActionEvent): string {
    const query = event.parameters
        ?.find(({ name }) => name === 'query')
        ?.value.trim();

    if (!query) {
        throw new UnsafeQueryError(
            'The action must contain a non-empty query parameter.'
        );
    }

    return query;
}
