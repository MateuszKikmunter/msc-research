const IDENTIFIER_MESSAGE_LABELS = new Map([
    ['COLUMN_NOT_FOUND', 'Column'],
    ['TABLE_NOT_FOUND', 'Table'],
    ['FUNCTION_NOT_FOUND', 'Function'],
    ['AMBIGUOUS_NAME', 'Column']
]);

// These Trino-style prefixes were observed in the saved Nova Lite and Haiku runs.
// They are not AWS Athena's official numeric ErrorType catalogue.
const OBSERVED_ERROR_PREFIXES = new Set([
    'COLUMN_NOT_FOUND',
    'TABLE_NOT_FOUND',
    'FUNCTION_NOT_FOUND',
    'AMBIGUOUS_NAME',
    'TYPE_MISMATCH',
    'EXPRESSION_NOT_AGGREGATE',
    'NESTED_AGGREGATION'
]);

export class AthenaErrorNormalizer {
    public normalize(error: string): string {
        const details = this.extractDetails(error);
        const separator = details.indexOf(':');
        if (separator < 0) {
            return 'OTHER:UNKNOWN';
        }

        const errorPrefix = details.slice(0, separator).trim().toUpperCase();
        const message = this.removeLocation(details.slice(separator + 1));
        const identifierLabel = IDENTIFIER_MESSAGE_LABELS.get(errorPrefix);
        if (identifierLabel) {
            // The identifier distinguishes, for example, repeated failures on the same column.
            const identifier = this.extractQuotedValue(
                message,
                identifierLabel
            );
            return `${errorPrefix}:${identifier?.toLowerCase() ?? 'unknown'}`;
        }

        return OBSERVED_ERROR_PREFIXES.has(errorPrefix)
            ? errorPrefix
            : `OTHER:${errorPrefix}`;
    }

    private extractDetails(error: string): string {
        const prefix = 'Athena query failed:';
        const prefixPosition = error.indexOf(prefix);
        return prefixPosition >= 0
            ? error.slice(prefixPosition + prefix.length).trim()
            : error.trim();
    }

    private removeLocation(message: string): string {
        const trimmedMessage = message.trim();
        if (!trimmedMessage.toLowerCase().startsWith('line ')) {
            return trimmedMessage;
        }

        const lineSeparator = trimmedMessage.indexOf(':');
        const columnSeparator = trimmedMessage.indexOf(':', lineSeparator + 1);
        return columnSeparator >= 0
            ? trimmedMessage.slice(columnSeparator + 1).trim()
            : trimmedMessage;
    }

    private extractQuotedValue(message: string, label: string): string | null {
        const valueStart = message.indexOf(`${label} '`);
        if (valueStart < 0) {
            return null;
        }

        const contentStart = valueStart + label.length + 2;
        const contentEnd = message.indexOf("'", contentStart);
        return contentEnd >= 0 ? message.slice(contentStart, contentEnd) : null;
    }
}
