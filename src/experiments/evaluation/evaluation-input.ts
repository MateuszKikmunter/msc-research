import { readFile } from 'node:fs/promises';
import type {
    EvaluationEpisode,
    StoredRunInteraction,
    CandidateResultFile,
    GoldenResultFile,
    ManualSafetyReview,
    SafetyManualLabel
} from '../types';
import * as traceEvents from '../shared/trace-event-inspector';
import path from 'node:path';
import { readJsonFile } from '../shared/json-file-reader';

export interface EvaluationPaths {
    goldenResultDirectory: string;
    runDirectory: string;
}

export function loadGoldenResult(
    directory: string,
    artifactId: string
): Promise<GoldenResultFile> {
    return readJsonFile<GoldenResultFile>(
        path.join(directory, `${artifactId}.json`)
    );
}

export function loadCandidateResult(
    directory: string,
    relativePath: string
): Promise<CandidateResultFile> {
    return readJsonFile<CandidateResultFile>(
        path.join(directory, relativePath)
    );
}

const SAFETY_LABELS: SafetyManualLabel[] = [
    'compliant',
    'partially_compliant',
    'non_compliant',
    'uncertain'
];

export async function loadManualSafetyReviews(
    runDirectory: string
): Promise<ManualSafetyReview[]> {
    const inputPath = path.join(runDirectory, 'manual-safety-reviews.json');
    let reviews: unknown;

    try {
        reviews = await readJsonFile<unknown>(inputPath);
    } catch (error) {
        if (isMissingFileError(error)) {
            return [];
        }
        throw error;
    }

    if (!Array.isArray(reviews)) {
        throw new Error(`${inputPath} must contain a JSON array.`);
    }

    return reviews.map((review, index) =>
        parseManualSafetyReview(review, inputPath, index)
    );
}

export async function loadRunInteractions(
    inputPath: string
): Promise<StoredRunInteraction[]> {
    const contents = await readFile(inputPath, 'utf8');
    const interactions: StoredRunInteraction[] = [];

    for (const [index, line] of contents.split('\n').entries()) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            interactions.push(parseLine(trimmedLine, index + 1));
        }
    }

    return interactions;
}

function parseLine(line: string, lineNumber: number): StoredRunInteraction {
    try {
        return JSON.parse(line) as StoredRunInteraction;
    } catch (error) {
        throw new Error(`Invalid interaction JSON on line ${lineNumber}.`, {
            cause: error
        });
    }
}

function parseManualSafetyReview(
    review: unknown,
    inputPath: string,
    index: number
): ManualSafetyReview {
    if (
        typeof review !== 'object' ||
        review === null ||
        !('questionId' in review) ||
        typeof review.questionId !== 'string' ||
        !('manualLabel' in review) ||
        typeof review.manualLabel !== 'string' ||
        !SAFETY_LABELS.includes(review.manualLabel as SafetyManualLabel) ||
        !('manualNotes' in review) ||
        (review.manualNotes !== null && typeof review.manualNotes !== 'string')
    ) {
        throw new Error(
            `Invalid manual safety review at index ${index} in ${inputPath}.`
        );
    }

    return {
        questionId: review.questionId,
        manualLabel: review.manualLabel as SafetyManualLabel,
        manualNotes: review.manualNotes
    };
}

function isMissingFileError(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
}

export function groupEpisodes(
    interactions: StoredRunInteraction[]
): EvaluationEpisode[] {
    const interactionsBySession = new Map<string, StoredRunInteraction[]>();

    for (const interaction of interactions) {
        const group = interactionsBySession.get(interaction.sessionId);
        if (group) {
            group.push(interaction);
        } else {
            interactionsBySession.set(interaction.sessionId, [interaction]);
        }
    }

    return [...interactionsBySession.values()].map((episodeInteractions) =>
        createEpisode(episodeInteractions)
    );
}

function createEpisode(
    interactions: StoredRunInteraction[]
): EvaluationEpisode {
    const orderedInteractions = [...interactions]
        .sort((left, right) => left.interactionOrder - right.interactionOrder)
        .map((interaction) => ({
            ...interaction,
            response: {
                ...interaction.response,
                traceEvents: traceEvents.orderEvents(
                    interaction.response.traceEvents
                )
            }
        }));
    const firstInteraction = orderedInteractions[0];

    return {
        questionId: firstInteraction.questionId,
        sessionId: firstInteraction.sessionId,
        modelCondition: firstInteraction.modelCondition,
        repetition: firstInteraction.repetition,
        interactions: orderedInteractions
    };
}
