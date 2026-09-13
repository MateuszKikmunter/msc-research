import { describe, expect, it } from '@jest/globals';

import { loadBenchmark } from '../../shared/benchmark-loader';
import { buildGoldQueryDefinitions } from '../../golden-results/gold-query-definition-builder';

const EXPECTED_BENCHMARK_QUESTION_COUNT = 195;
const EXPECTED_GOLD_QUERY_DEFINITION_COUNT = 190;
const EXPECTED_STANDALONE_QUESTION_ID = 'CB200-E012';
const EXPECTED_CONVERSATIONAL_QUESTION_ID = 'CB200-C001';
const EXPECTED_CONVERSATIONAL_ARTIFACT_ID = 'CB200-C001-T02';
const EXPECTED_CONVERSATIONAL_TURN_NUMBER = 2;

describe('benchmark loader', () => {
    it('loads the committed benchmark and exposes each golden query', async () => {
        const benchmark = await loadBenchmark();
        const definitions = buildGoldQueryDefinitions(benchmark);

        expect(benchmark).toHaveLength(EXPECTED_BENCHMARK_QUESTION_COUNT);
        expect(definitions).toHaveLength(EXPECTED_GOLD_QUERY_DEFINITION_COUNT);
        expect(
            definitions.find(
                ({ artifactId }) =>
                    artifactId === EXPECTED_STANDALONE_QUESTION_ID
            )
        ).toMatchObject({
            questionId: EXPECTED_STANDALONE_QUESTION_ID,
            turnNumber: null
        });
        expect(
            definitions.find(
                ({ artifactId }) =>
                    artifactId === EXPECTED_CONVERSATIONAL_ARTIFACT_ID
            )
        ).toMatchObject({
            questionId: EXPECTED_CONVERSATIONAL_QUESTION_ID,
            turnNumber: EXPECTED_CONVERSATIONAL_TURN_NUMBER
        });
    });
});
