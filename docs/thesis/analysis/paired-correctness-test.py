"""Exploratory paired comparison of final correctness on saved standalone cases.

Run with the project virtual environment; see paired-correctness-plan.md.
No model calls, database queries or modifications to saved evaluations.

Method: standard paired Student t-test, implemented by scipy.stats.ttest_rel.
See Dror et al. (2018), section 3.2.1, doi:10.18653/v1/P18-1128.
Averaging the two repetitions per question is a study-specific analysis choice,
not a repeated-run procedure attributed to that paper. This project code
prepares and validates the observations; SciPy supplies the statistical test.
"""

import argparse
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import platform
import statistics

import numpy
import scipy
from scipy import stats

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
MODELS = ('nova-lite', 'haiku-4-5')
REPETITIONS = (1, 2)

# Existing exploratory sensitivity subset, not exclusions selected for this test.
SENSITIVITY_EXCLUSIONS = (
    'CB200-M028',
    'CB200-M029',
    'CB200-H038',
    'CB200-H011',
    'CB200-H041',
    'CB200-H028',
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_runs(root):
    """Match question IDs and reconcile binary outcomes with saved summaries."""
    sources = {}

    # Read each input and record a fingerprint of its contents.
    def read(relative):
        content = (root / relative).read_bytes()
        sources[str(relative)] = sha256(content).hexdigest()
        return json.loads(content)

    # Select the standalone questions from the benchmark.
    benchmark = read(Path('benchmarks/chinook-bench-200.json'))
    ids = {q['id'] for q in benchmark}
    require(len(ids) == len(benchmark), 'Duplicate benchmark IDs')
    standalone = {
        q['id']
        for q in benchmark
        if q['expected_behavior'] == 'execute'
    }
    require(
        len(standalone) == 160,
        'This analysis expects the original 160 standalone questions',
    )

    # Load both repetitions for each model.
    runs = {}
    for model in MODELS:
        for repetition in REPETITIONS:
            base = Path(
                f'src/experiments/runs/{model}/repetition-{repetition}/evaluation'
            )
            data = read(base / 'results.json')
            summary = read(base / 'summary.json')

            # Confirm that the files describe the expected run and questions.
            for record in (data, summary):
                require(
                    record['modelCondition'] == model
                    and record['repetition'] == repetition,
                    f'Run metadata mismatch: {base}',
                )

            episodes = {e['questionId']: e for e in data['episodes']}
            require(
                len(episodes) == len(data['episodes']),
                f'Duplicate question IDs: {base}',
            )
            require(
                set(episodes) == ids,
                f'Missing or extra benchmark questions: {base}',
            )

            # Validate the evidence, then assign 1 for correct and 0 otherwise.
            scores = {}
            for qid in sorted(standalone):
                trajectories = episodes[qid]['trajectoryResults']
                require(
                    len(trajectories) == 1,
                    f'Expected one standalone trajectory: {qid}',
                )
                trajectory = trajectories[0]
                facts = trajectory['trajectoryFacts']
                require(
                    trajectory['trajectoryClass'] != 'SYSTEM_ERROR'
                    and facts['evaluationComplete']
                    and facts['traceComplete'],
                    f'Incomplete evaluation evidence: {model}/{repetition}/{qid}',
                )
                require(
                    all(
                        a['outcome'] != 'evaluator_uncertain'
                        for a in trajectory['attemptEvaluations']
                    ),
                    f'Uncertain attempt: {qid}',
                )

                outcome = facts['terminalOutcome']
                require(
                    outcome in ('correct', 'semantic_error', 'execution_error', 'no_sql'),
                    f'Unexpected terminal outcome: {qid}: {outcome}',
                )
                score = int(outcome == 'correct')
                require(
                    (facts['terminalResultCorrect'] is True) == bool(score),
                    f'Inconsistent correctness fields: {qid}',
                )
                scores[qid] = score

            # Reconcile the question scores with the saved success-rate summary.
            rate = summary['standalone']['finalSuccessRate']
            require(
                rate['numerator'] == sum(scores.values())
                and rate['denominator'] == len(scores)
                and math.isclose(rate['rate'], statistics.mean(scores.values())),
                f'Final success summary mismatch: {base}',
            )
            runs[model, repetition] = scores

    return runs, sources


def paired_rows(runs, ids):
    """Keep both repetitions within one question; never count them as 320 pairs."""
    rows = []
    for qid in sorted(ids):
        nova = [runs['nova-lite', r][qid] for r in REPETITIONS]
        haiku = [runs['haiku-4-5', r][qid] for r in REPETITIONS]
        rows.append(
            {
                'question_id': qid,
                'nova_repetitions': nova,
                'haiku_repetitions': haiku,
                'nova_mean': statistics.mean(nova),
                'haiku_mean': statistics.mean(haiku),
                'difference': statistics.mean(haiku) - statistics.mean(nova),
            }
        )

    return rows


def paired_test(rows):
    # Keep the two model means aligned by question.
    nova = [row['nova_mean'] for row in rows]
    haiku = [row['haiku_mean'] for row in rows]
    differences = [h - n for h, n in zip(haiku, nova)]
    require(
        len(rows) >= 2 and statistics.stdev(differences) > 0,
        'The t-test needs at least two pairs and nonzero difference variance',
    )

    # Run the paired t-test and obtain its 95% confidence interval.
    result = stats.ttest_rel(
        haiku,
        nova,
        alternative='two-sided',
        nan_policy='raise',
    )
    interval = result.confidence_interval(confidence_level=0.95)
    mean = statistics.mean(differences)
    se = statistics.stdev(differences) / math.sqrt(len(rows))

    # Independent arithmetic check of the statistic and CI, plus equivalent API.
    manual_t = mean / se
    critical = stats.t.ppf(.975, len(rows) - 1)
    one_sample = stats.ttest_1samp(differences, 0, alternative='two-sided')
    require(
        math.isclose(float(result.statistic), manual_t, rel_tol=1e-12),
        't mismatch',
    )
    require(
        math.isclose(float(result.pvalue), float(one_sample.pvalue), rel_tol=1e-12),
        'Paired and one-sample p-values differ',
    )
    require(
        math.isclose(float(interval.low), mean - critical * se, abs_tol=1e-12)
        and math.isclose(float(interval.high), mean + critical * se, abs_tol=1e-12),
        'Confidence interval mismatch',
    )

    # Convert proportions to percentages or percentage-point differences.
    return {
        'n_question_pairs': len(rows),
        'df': int(result.df),
        'nova_mean_fsr_percent': 100 * statistics.mean(nova),
        'haiku_mean_fsr_percent': 100 * statistics.mean(haiku),
        'mean_difference_pp': 100 * mean,
        'standard_error_pp': 100 * se,
        't_statistic': float(result.statistic),
        'p_two_sided': float(result.pvalue),
        'confidence_interval_95_pp': [
            100 * float(interval.low),
            100 * float(interval.high),
        ],
        'difference_distribution': dict(sorted(Counter(differences).items())),
        'nonzero_differences': sum(d != 0 for d in differences),
    }


def main():
    # Read optional command-line paths.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument(
        '--output',
        type=Path,
        default=HERE / 'paired-correctness-results.json',
    )
    args = parser.parse_args()

    # Prepare all 160 question pairs and run the primary analysis.
    runs, sources = load_runs(args.root)
    ids = set(runs['nova-lite', 1])
    rows = paired_rows(runs, ids)
    primary = paired_test(rows)

    # Reuse the existing sensitivity subset for a supporting analysis.
    sensitivity_ids = ids - set(SENSITIVITY_EXCLUSIONS)
    require(
        len(sensitivity_ids) == 154,
        'Sensitivity IDs do not match the existing six exclusions',
    )

    # Assemble results, limitations and reproducibility information.
    output = {
        'analysis': 'Exploratory two-sided paired t-test of per-question mean final correctness',
        'direction': 'Haiku minus Nova',
        'alpha': .05,
        'unit': 'Standalone question, averaging its two observed repetitions for each model',
        'primary': primary,
        'checks': {
            'existing_154_question_sensitivity': {
                'excluded_ids': sorted(SENSITIVITY_EXCLUSIONS),
                **paired_test(paired_rows(runs, sensitivity_ids)),
            },
        },
        'scope': [
            'Approximate t inference; question differences are discrete and not normally distributed.',
            'Question independence and representativeness are assumptions, not validated by small p-values.',
            'Repeated questions are averaged; similarities between different questions remain.',
            'Conditional on this benchmark, contract and two observed repetitions; not future-run variability.',
            'Analysis selected after seeing results; no causal or universal model-superiority claim.',
            'The sensitivity analysis is a supporting check, not an independent replication.',
        ],
        'software': {
            'python': platform.python_version(),
            'scipy': scipy.__version__,
            'numpy': numpy.__version__,
        },
        'script_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'source_sha256': sources,
        'question_pairs': rows,
    }

    # Save the full evidence record and print the main results.
    args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'primary': primary, 'checks': output['checks']}, indent=2))
    print(f'Saved {args.output}')


if __name__ == '__main__':
    main()
