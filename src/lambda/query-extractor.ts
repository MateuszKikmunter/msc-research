import { BedrockActionEvent, UnsafeQueryError } from './types';

export function extractQuery(event: BedrockActionEvent): string {
    const properties =
        event.requestBody?.content?.['application/json']?.properties ?? [];
    const query = properties
        .find(({ name }) => name === 'query')
        ?.value?.trim();

    if (!query) {
        throw new UnsafeQueryError(
            'The request body must contain a non-empty query property.'
        );
    }

    return query;
}
