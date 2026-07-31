import { UnsafeQueryError } from './types';

const forbiddenKeywords = new Set([
    'INSERT',
    'UPDATE',
    'DELETE',
    'MERGE',
    'DROP',
    'ALTER',
    'CREATE',
    'TRUNCATE',
    'UNLOAD',
    'GRANT',
    'REVOKE',
    'CALL',
    'PREPARE',
    'EXECUTE',
    'DESCRIBE',
    'SHOW',
    'USE',
    'MSCK',
    'REPAIR'
]);

export function validateReadOnlyQuery(query: string): void {
    if (!query) {
        throw new Error('Query not provided!');
    }

    const queryUpper = query.toUpperCase();
    if (!queryUpper.includes('SELECT')) {
        throw new UnsafeQueryError(
            'Only SELECT queries, including queries using WITH, are allowed.'
        );
    }

    forbiddenKeywords.forEach((keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(queryUpper)) {
            throw new UnsafeQueryError(
                `SQL operation '${keyword}' is not allowed.`
            );
        }
    });
}
