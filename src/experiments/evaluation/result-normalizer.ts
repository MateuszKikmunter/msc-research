import type { ResultColumn } from '../types';

export type NormalizedValue =
    | { kind: 'null' }
    | { kind: 'integer'; value: string }
    | { kind: 'number'; value: number }
    | { kind: 'temporal'; value: number }
    | { kind: 'string'; value: string };

export type NormalizedRow = NormalizedValue[];

const INTEGER_TYPES = new Set(['tinyint', 'smallint', 'integer', 'bigint']);
const APPROXIMATE_NUMBER_TYPES = new Set([
    'decimal',
    'double',
    'float',
    'real'
]);

export class ResultNormalizationError extends Error {}

export function normalizeRow(
    row: Array<string | null>,
    expectedColumns: ResultColumn[]
): NormalizedRow {
    return row.map((value, index) =>
        normalizeValue(value, expectedColumns[index].type)
    );
}

function normalizeValue(
    value: string | null,
    expectedType: string
): NormalizedValue {
    if (value === null) {
        return { kind: 'null' };
    }

    const baseType = getBaseType(expectedType);
    if (INTEGER_TYPES.has(baseType)) {
        return { kind: 'integer', value: parseInteger(value) };
    }

    if (APPROXIMATE_NUMBER_TYPES.has(baseType)) {
        return { kind: 'number', value: parseNumber(value) };
    }

    if (baseType === 'date' || baseType === 'timestamp') {
        return { kind: 'temporal', value: parseTemporal(value) };
    }

    return { kind: 'string', value };
}

function getBaseType(type: string): string {
    const normalizedType = type.trim().toLowerCase();

    // These types may include modifiers, such as decimal(10,2) or timestamp(3).
    if (normalizedType.startsWith('decimal')) {
        return 'decimal';
    }
    if (normalizedType.startsWith('timestamp')) {
        return 'timestamp';
    }

    return normalizedType;
}

function parseInteger(value: string): string {
    try {
        if (value.trim() === '') {
            throw new Error();
        }

        return BigInt(value).toString();
    } catch {
        throw new ResultNormalizationError(
            `Expected integer value but received ${JSON.stringify(value)}.`
        );
    }
}

function parseNumber(value: string): number {
    const parsedValue = Number(value);
    if (value.trim() === '' || !Number.isFinite(parsedValue)) {
        throw new ResultNormalizationError(
            `Expected numeric value but received ${JSON.stringify(value)}.`
        );
    }

    return parsedValue;
}

function parseTemporal(value: string): number {
    let normalizedValue = value.trim().replace(' ', 'T');

    if (normalizedValue.toUpperCase().endsWith(' UTC')) {
        normalizedValue = `${normalizedValue.slice(0, -4)}Z`;
    }

    const time = normalizedValue.split('T')[1];
    const hasTimeZone =
        normalizedValue.toUpperCase().endsWith('Z') ||
        time?.includes('+') ||
        time?.includes('-');

    // Athena timestamps have no timezone suffix, so interpret them consistently as UTC.
    if (time && !hasTimeZone) {
        normalizedValue = `${normalizedValue}Z`;
    }

    const timestamp = Date.parse(normalizedValue);
    if (!Number.isFinite(timestamp)) {
        throw new ResultNormalizationError(
            `Expected date or timestamp value but received ${JSON.stringify(value)}.`
        );
    }

    return timestamp;
}
