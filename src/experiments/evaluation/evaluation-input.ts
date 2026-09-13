import { readFile } from 'node:fs/promises';
import type {
    EvaluationEpisode,
    StoredRunInteraction,
    CandidateResultFile,
    GoldenResultFile
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
