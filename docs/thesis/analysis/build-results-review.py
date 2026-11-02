"""Reproduce the supervisor draft's calculations from saved evaluations.

Run from any directory with Python 3. No packages or AWS access are required.
This checks aggregation, not the correctness of every underlying evaluation label.
"""
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import random
import re
import statistics

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MODELS = ('nova-lite', 'haiku-4-5')
REPETITIONS = (1, 2)
SEED = 20260929
RESAMPLES = 10000
sources = {}


def load(path):
    content = (ROOT / path).read_bytes()
    sources[str(path)] = sha256(content).hexdigest()
    return json.loads(content)


def check_rate(saved, numerator, denominator):
    assert saved['numerator'] == numerator
    assert saved['denominator'] == denominator
    expected = numerator / denominator if denominator else None
    assert saved['rate'] == expected


def success(episode):
    return bool(episode['trajectoryResults']) and all(
        t['trajectoryFacts']['terminalResultCorrect'] is True
        for t in episode['trajectoryResults'])


def category(transition):
    if transition['transitionUncertain']:
        return 'transition_uncertain'
    if not transition['retryProduced']:
        return 'no_retry'
    if transition['nextExecutionStatus'] == 'succeeded':
        return 'retry_executed_successfully'
    if transition['sameErrorRepeated']:
        return 'retry_repeated_same_error'
    return 'retry_produced_different_error'


def supplementary_trajectories(episodes):
    """Keep per-case/turn evidence behind the separate partition totals."""
    rows = []
    for episode in episodes:
        for trajectory in episode['trajectoryResults']:
            facts = trajectory['trajectoryFacts']
            attempts = trajectory['attemptEvaluations']
            assert facts['sqlAttemptCount'] == len(attempts)
            recovered = trajectory['trajectoryClass'] in (
                'EXECUTION_ERROR_RECOVERED', 'SEMANTIC_REVISION_SUCCESS')
            assert recovered == facts['recovered']
            rows.append({
                'questionId': episode['questionId'],
                'turnNumber': trajectory['turnNumber'],
                'trajectoryClass': trajectory['trajectoryClass'],
                'sqlAttemptCount': len(attempts),
                'terminalResultCorrect': facts['terminalResultCorrect'],
                'recovered': recovered,
            })
    counts = Counter(row['trajectoryClass'] for row in rows)
    attempt_counts = [row['sqlAttemptCount'] for row in rows]
    return {
        'case_count': len(episodes),
        'trajectory_count': len(rows),
        'class_counts': dict(counts),
        'correct_count': sum(row['terminalResultCorrect'] is True for row in rows),
        'recovery_count': sum(row['recovered'] for row in rows),
        'attempt_total': sum(attempt_counts),
        'attempt_median': statistics.median(attempt_counts) if rows else None,
        'attempt_max': max(attempt_counts) if rows else None,
        'rows': rows,
    }


benchmark = load(Path('benchmarks/chinook-bench-200.json'))
records = {q['id']: q for q in benchmark}
ids = sorted(q['id'] for q in benchmark if q['expected_behavior'] == 'execute')
assert len(ids) == 160 and len(records) == 195
runs = {}
provenance = {}
for model in MODELS:
    for repetition in REPETITIONS:
        base = Path('src/experiments/runs') / model / f'repetition-{repetition}'
        interaction_path = base / 'interactions.jsonl'
        interaction_content = (ROOT / interaction_path).read_bytes()
        sources[str(interaction_path)] = sha256(interaction_content).hexdigest()
        interactions = [json.loads(line) for line in interaction_content.splitlines() if line.strip()]
        event_times = [e['eventTime'] for interaction in interactions
                       for e in interaction['response']['traceEvents'] if e.get('eventTime')]
        provenance[f'{model}/{repetition}'] = {
            'source': str(interaction_path),
            'response_model_counts': dict(Counter(
                i['response']['foundationModel'] for i in interactions)),
            'interaction_count': len(interactions),
            'session_count': len({i['sessionId'] for i in interactions}),
            'first_recorded_event_utc': min(event_times),
            'last_recorded_event_utc': max(event_times),
        }
        saved = load(base / 'evaluation/summary.json')
        results = load(base / 'evaluation/results.json')
        episodes = {e['questionId']: e for e in results['episodes']}
        assert len(results['episodes']) == len(episodes) == 195
        assert episodes.keys() == records.keys()
        assert results['modelCondition'] == saved['modelCondition'] == model
        assert results['repetition'] == saved['repetition'] == repetition
        assert all(t['trajectoryClass'] != 'SYSTEM_ERROR'
                   for e in episodes.values() for t in e['trajectoryResults'])
        rows = {}
        transitions = []
        for qid in ids:
            e = episodes[qid]
            assert len(e['trajectoryResults']) == 1
            t = e['trajectoryResults'][0]
            f = t['trajectoryFacts']
            rows[qid] = {
                'difficulty': records[qid]['difficulty'],
                'final': success(e),
                'clean': t['trajectoryClass'] == 'DIRECT_SUCCESS'
                    and f['sqlAttemptCount'] == 1
                    and not f['redundantActionObserved']
                    and e['clarification']['status'] != 'unnecessary',
                'class': t['trajectoryClass'],
                **f,
            }
            transitions.extend(t['errorTransitions'])
        final = sum(r['final'] for r in rows.values())
        clean = sum(r['clean'] for r in rows.values())
        recovered = sum(r['class'] in ('EXECUTION_ERROR_RECOVERED',
                                     'SEMANTIC_REVISION_SUCCESS') for r in rows.values())
        initially_wrong = sum(r['firstAttemptOutcome'] in ('execution_error', 'semantic_error')
                              for r in rows.values())
        error_cases = [r for r in rows.values() if r['executionErrorObserved']]
        s = saved['standalone']
        for name, n, d in [('finalSuccessRate', final, 160),
                           ('cleanDirectSuccessRate', clean, 160),
                           ('finalToDirectGap', final-clean, 160),
                           ('recoveredSuccessContribution', recovered, final),
                           ('recoveryRate', recovered, initially_wrong)]:
            check_rate(s[name], n, d)
        counts = Counter(r['class'] for r in rows.values())
        assert all(counts[k] == v for k, v in s['trajectoryClassCounts'].items())
        response_counts = Counter(category(t) for t in transitions)
        assert len(transitions) == saved['errorResponse']['transitionCount']
        assert all(response_counts[k] == v for k, v in
                   saved['errorResponse']['categoryCounts'].items())
        check_rate(saved['errorResponse']['observationConditionedRecoveryRate'],
                   sum(r['final'] for r in error_cases), len(error_cases))
        for difficulty, metrics in saved['byDifficulty'].items():
            subset = [r for r in rows.values() if r['difficulty'] == difficulty]
            f = sum(r['final'] for r in subset)
            c = sum(r['clean'] for r in subset)
            for name, n in [('finalSuccessRate', f), ('cleanDirectSuccessRate', c),
                            ('finalToDirectGap', f-c)]:
                check_rate(metrics[name], n, len(subset))
            assert metrics['medianSqlAttemptCount'] == statistics.median(
                r['sqlAttemptCount'] for r in subset)
        ambiguity = [e for q, e in episodes.items()
                     if records[q]['expected_behavior'] == 'clarify_then_execute']
        continued = [e for e in ambiguity
                     if e['clarification']['status'] == 'appropriate'
                     and e['clarification']['scriptedReplyUsed']]
        assert all(len(e['trajectoryResults']) == 1 for e in continued)
        assert all(not e['trajectoryResults'] for e in ambiguity if e not in continued)
        for name, status in [('clarificationDetectionRate', 'appropriate'),
                             ('missedClarificationRate', 'missed')]:
            check_rate(saved['ambiguity'][name],
                       sum(e['clarification']['status'] == status for e in ambiguity), 20)
        check_rate(saved['ambiguity']['postClarificationAccuracy'],
                   sum(map(success, continued)), len(continued))
        check_rate(s['unnecessaryClarificationRate'], sum(
            episodes[q]['clarification']['status'] == 'unnecessary' for q in ids), 160)
        interactive = [e for q, e in episodes.items()
                       if records[q]['expected_behavior'] == 'execute_sequence']
        turns = [t for e in interactive for t in e['trajectoryResults']]
        assert len(turns) == 10 and len(interactive) == 5
        assert all(sorted(t['turnNumber'] for t in e['trajectoryResults']) == [1, 2]
                   for e in interactive)
        check_rate(saved['interactive']['turnAccuracy'], sum(
            t['trajectoryFacts']['terminalResultCorrect'] is True for t in turns), 10)
        check_rate(saved['interactive']['completeEpisodeAccuracy'],
                   sum(map(success, interactive)), 5)
        safety = [e['safetyReview'] for e in episodes.values() if e['safetyReview']]
        assert len(safety) == 10
        labels = Counter(e['manualLabel'] for e in safety)
        assert all(labels[k] == v for k, v in saved['safety']['manualLabelCounts'].items())
        assert saved['safety']['unreviewedCount'] == labels[None]
        check_rate(saved['safety']['noQueryRate'], sum(e['noQueryObserved'] for e in safety), 10)
        manual = load(base / 'manual-safety-reviews.json')
        assert {r['questionId']: r['manualLabel'] for r in manual} == {
            q: e['safetyReview']['manualLabel'] for q, e in episodes.items() if e['safetyReview']}
        runs[f'{model}/{repetition}'] = {
            'summary': saved, 'standalone': rows,
            'supplementary': {
                'resolved_ambiguity': {
                    **supplementary_trajectories(continued),
                    'all_case_count': len(ambiguity),
                    'excluded_question_ids': [e['questionId'] for e in ambiguity
                                              if e not in continued],
                },
                'interactive_turns': supplementary_trajectories(interactive),
                # Preserve existing actions, responses and labels, not new safety classes.
                'safety_evidence': safety,
            },
            'first_outcome_counts': dict(Counter(r['firstAttemptOutcome'] for r in rows.values())),
            'attempt_total': sum(r['sqlAttemptCount'] for r in rows.values()),
            'attempt_median': statistics.median(r['sqlAttemptCount'] for r in rows.values()),
            'attempt_max': max(r['sqlAttemptCount'] for r in rows.values()),
            'attempt_count_distribution': dict(sorted(Counter(
                r['sqlAttemptCount'] for r in rows.values()).items())),
            'unchanged_retry_count': sum(t['retryProduced'] and t['sqlChanged'] is False
                                         for t in transitions),
            'recoveries_exceeding_retry_policy': {
                q: r['sqlAttemptCount'] for q, r in rows.items()
                if r['recovered'] and r['retryPolicyExceeded']},
            'retry_policy_exceeded_ids': [q for q, r in rows.items() if r['retryPolicyExceeded']],
            'recovery_ids': [q for q, r in rows.items() if r['recovered']],
            'error_signature_counts': dict(Counter(t['normalizedError'] for t in transitions)),
            'selected_cases': {q: episodes[q] for q in
                               ['CB200-M026', 'CB200-M028', 'CB200-H038', 'CB200-H003', 'CB200-S009']},
        }

paired = {}
for rep in REPETITIONS:
    a, b = (runs[f'{model}/{rep}']['standalone'] for model in MODELS)
    equal = [q for q in ids if a[q]['terminalOutcome'] == b[q]['terminalOutcome']]
    divergent = [q for q in equal if a[q]['class'] != b[q]['class']]
    cells = Counter((a[q]['final'], b[q]['final']) for q in ids)
    paired[str(rep)] = {
        'both_correct': cells[True, True], 'only_nova_correct': cells[True, False],
        'only_haiku_correct': cells[False, True], 'neither_correct': cells[False, False],
        'equal_terminal_outcome_ids': equal, 'different_class_same_outcome_ids': divergent,
        'ctd': len(divergent)/len(equal),
        'haiku_minus_nova_pp': 100*(cells[False, True]-cells[True, False])/160,
    }
stability = {}
for model in MODELS:
    a, b = (runs[f'{model}/{rep}']['standalone'] for rep in REPETITIONS)
    stability[model] = {
        'same_correctness': sum(a[q]['final'] == b[q]['final'] for q in ids),
        'same_class': sum(a[q]['class'] == b[q]['class'] for q in ids),
        'changed_correctness_ids': [q for q in ids if a[q]['final'] != b[q]['final']],
        'changed_class_ids': [q for q in ids if a[q]['class'] != b[q]['class']],
        'recovered_in_both_repetitions': sorted(set(runs[f'{model}/1']['recovery_ids'])
                                               & set(runs[f'{model}/2']['recovery_ids'])),
    }

# Exploratory sensitivity analysis: the same six questions are removed from
# every run, including successful answers. Original classifications stay intact.
sensitivity_exclusions = {
    'CB200-M028': 'Month representation or additional year column',
    'CB200-M029': 'Month representation',
    'CB200-H011': 'Tie-breaking not specified in the question',
    'CB200-H028': 'Treatment of empty playlists',
    'CB200-H038': 'Month representation',
    'CB200-H041': 'Tie-breaking not specified in the question',
}
assert set(sensitivity_exclusions) <= set(ids)
retained_ids = sorted(set(ids) - set(sensitivity_exclusions))
assert len(retained_ids) == 154
sensitivity_runs = {}
for key, run in runs.items():
    rows = run['standalone']
    removed_final = sum(rows[q]['final'] for q in sensitivity_exclusions)
    removed_clean = sum(rows[q]['clean'] for q in sensitivity_exclusions)
    final = sum(rows[q]['final'] for q in retained_ids)
    clean = sum(rows[q]['clean'] for q in retained_ids)
    assert final == run['summary']['standalone']['finalSuccessRate']['numerator'] - removed_final
    assert clean == run['summary']['standalone']['cleanDirectSuccessRate']['numerator'] - removed_clean
    sensitivity_runs[key] = {
        'denominator': len(retained_ids),
        'excluded_final_success_count': removed_final,
        'excluded_clean_success_count': removed_clean,
        'excluded_success_ids': [q for q in sensitivity_exclusions if rows[q]['final']],
        'finalSuccessRate': {'numerator': final, 'denominator': len(retained_ids)},
        'cleanDirectSuccessRate': {'numerator': clean, 'denominator': len(retained_ids)},
        'finalToDirectGap': {'numerator': final-clean, 'denominator': len(retained_ids)},
        'recovered_count': sum(rows[q]['recovered'] for q in retained_ids),
    }
sensitivity_stability = {}
for model in MODELS:
    a, b = (runs[f'{model}/{rep}']['standalone'] for rep in REPETITIONS)
    changed = [q for q in retained_ids if a[q]['final'] != b[q]['final']]
    sensitivity_stability[model] = {
        'denominator': len(retained_ids), 'changed_correctness_ids': changed,
        'same_correctness': len(retained_ids)-len(changed),
    }
sensitivity = {
    'selection': 'Exploratory exclusions identified after inspecting results; not an exhaustive audit',
    'excluded_questions': sensitivity_exclusions,
    'retained_question_ids': retained_ids,
    'retained_difficulty_counts': dict(Counter(records[q]['difficulty'] for q in retained_ids)),
    'runs': sensitivity_runs, 'stability': sensitivity_stability,
}

# One cluster is one question with all four observations. Resample clusters
# within difficulty, retaining the benchmark's 50/60/50 composition.
differences = {q: statistics.mean(
    int(runs[f'haiku-4-5/{rep}']['standalone'][q]['final']) -
    int(runs[f'nova-lite/{rep}']['standalone'][q]['final']) for rep in REPETITIONS) for q in ids}
strata = [[q for q in ids if records[q]['difficulty'] == d]
          for d in ('easy', 'medium', 'hard')]
rng = random.Random(SEED)
samples = []
for index in range(RESAMPLES):
    selected = [q for s in strata for q in rng.choices(s, k=len(s))]
    difference = 100*sum(differences[q] for q in selected)/160
    samples.append(difference)
    if index == 0:
        first_sample = {
            'question_ids_with_repeats': selected,
            'distinct_question_count': len(set(selected)),
            'correct_counts': {key: sum(run['standalone'][q]['final'] for q in selected)
                               for key, run in runs.items()},
            'haiku_minus_nova_pp': difference,
        }
samples.sort()


def percentile(p):
    position = (len(samples)-1)*p
    lower = int(position)
    fraction = position-lower
    return samples[lower]*(1-fraction) + samples[min(lower+1, len(samples)-1)]*fraction


def percentile_details(p):
    position = (len(samples)-1)*p
    lower = int(position)
    upper = min(lower+1, len(samples)-1)
    return {
        'percentile': 100*p,
        'lower_rank_one_based': lower+1,
        'upper_rank_one_based': upper+1,
        'lower_value_pp': samples[lower],
        'upper_value_pp': samples[upper],
        'upper_weight': position-lower,
        'interpolated_value_pp': percentile(p),
    }


# Check the saved rows behind two examples used in the draft.
gold_months = load(Path('src/experiments/runs/golden-sql/CB200-M028.json'))
candidate_months = load(Path('src/experiments/runs/haiku-4-5/repetition-1/candidate-results/CB200-M028-T01-A01.json'))
month_totals_match = sorted((int(row[0][5:7]), float(row[1])) for row in gold_months['rows']) == sorted(
    (int(row[0]), float(row[1])) for row in candidate_months['rows'])
assert month_totals_match and len(gold_months['rows']) == 12
gold_customers = load(Path('src/experiments/runs/golden-sql/CB200-M026.json'))
candidate_customers = load(Path('src/experiments/runs/nova-lite/repetition-1/candidate-results/CB200-M026-T01-A02.json'))
assert sorted(gold_customers['rows']) == sorted(candidate_customers['rows'])

template_settings = {}
instruction_texts = []
orchestration_templates = []
for model, filename in [('nova-lite', 'conversational-query-agent.yaml'),
                        ('haiku-4-5', 'conversational-query-agent-haiku.yaml')]:
    template_path = Path('infra') / filename
    content = (ROOT / template_path).read_bytes()
    sources[str(template_path)] = sha256(content).hexdigest()
    text = content.decode()
    configuration = text.split('InferenceConfiguration:', 1)[1].split('ActionGroups:', 1)[0]
    settings = {}
    for field in ('Temperature', 'TopP', 'TopK', 'MaximumLength'):
        match = re.search(rf'^\s*{field}:\s*(\S+)', configuration, re.MULTILINE)
        settings[field] = match.group(1) if match else None
    template_settings[model] = {'source': str(template_path), 'settings': settings}
    instruction_texts.append(text.split('Instruction: |', 1)[1].split('PromptOverrideConfiguration:', 1)[0])
    orchestration_templates.append(text.split('BasePromptTemplate: |', 1)[1].split('InferenceConfiguration:', 1)[0])

output = {
    'scope': 'Supervisor review draft; exploratory analysis of the saved four runs',
    'source_sha256': sources, 'aggregation_checks': 'passed',
    'runs': runs, 'paired': paired, 'stability': stability,
    'sensitivity': sensitivity,
    'provenance': {
        'runs': provenance,
        'current_repository_templates': template_settings,
        'agent_instruction_text_equal': instruction_texts[0] == instruction_texts[1],
        'orchestration_template_text_equal': orchestration_templates[0] == orchestration_templates[1],
        'limitation': 'Current templates describe intended settings, not a saved historical deployment manifest.',
    },
    'example_checks': {'M026_saved_rows_match_ignoring_order': True,
                       'M028_totals_match_after_explicit_month_conversion': month_totals_match},
    'uncertainty': {
        'method': 'Difficulty-stratified paired question-cluster percentile bootstrap',
        'seed': SEED, 'resamples': RESAMPLES, 'question_clusters': len(ids),
        'first_sample_example': first_sample,
        'haiku_minus_nova_mean_fsr_pp': 100*statistics.mean(differences.values()),
        'percentile_95_interval_pp': [percentile(.025), percentile(.975)],
        'percentile_calculations': [percentile_details(.025), percentile_details(.975)],
        'interpretation': 'Conditional on the authored question mix and observed repetitions; '
                          'not a population-wide model ranking or run-to-run uncertainty estimate',
    },
}
(OUT / 'results-review-data.json').write_text(json.dumps(output, indent=2)+'\n')

# Table bodies are generated with the calculations to avoid transcription drift.
ordered_runs = [runs[f'{m}/{r}'] for m in MODELS for r in REPETITIONS]

# Show the CTD denominator selection separately from the class comparison.
ctd_chart = [
    r'% Generated by analysis/build-results-review.py from verified paired outcomes.',
    r'\begingroup',
    r'\definecolor{ctdblue}{HTML}{24557A}',
    r'\definecolor{ctdgreen}{HTML}{168475}',
    r'\begin{tikzpicture}[font=\small,',
    r'  flow/.style={draw=ctdblue!65,fill=ctdblue!4,rounded corners=2pt,',
    r'    text width=3.7cm,align=center,inner sep=7pt},',
    r'  excluded/.style={draw=black!30,fill=black!3,rounded corners=2pt,',
    r'    text width=2.0cm,align=center,inner sep=7pt,font=\footnotesize},',
    r'  result/.style={flow,draw=ctdgreen,fill=ctdgreen!7},',
    r'  arrow/.style={-{Stealth[length=2.2mm]},draw=ctdblue!85,line width=.8pt}]',
]
for rep, x in [(1, 0), (2, 7.4)]:
    p = paired[str(rep)] if str(rep) in paired else paired[rep]
    retained = len(p['equal_terminal_outcome_ids'])
    divergent = len(p['different_class_same_outcome_ids'])
    both_correct = p['both_correct']
    both_semantic = retained - both_correct
    # In these saved runs, the remaining equal categories are semantic errors.
    assert both_semantic == 7
    ctd_chart.extend([
        rf'\node[font=\small\bfseries,text=ctdblue] at ({x},1.25) {{Repetition {rep}}};',
        rf'\node[flow] (start{rep}) at ({x},0) {{\textbf{{160 matched questions}}\\Nova and Haiku}};',
        rf'\node[excluded] (excluded{rep}) at ({x+3.8},-1.4) {{\textbf{{{160-retained} excluded}}\\[4pt]Different terminal categories}};',
        rf'\node[flow] (retained{rep}) at ({x},-3) {{\textbf{{{retained} retained pairs}}\\[4pt]Both correct: {both_correct}\\Both executable\\but incorrect: {both_semantic}}};',
        rf'\node[result] (result{rep}) at ({x},-6.15) {{\textbf{{{divergent} pairs with}}\\\textbf{{different classes}}\\[4pt]CTD = {divergent}/{retained}\\\textbf{{{100*divergent/retained:.2f}\%}}}};',
        rf'\draw[arrow] (start{rep}.south) -- (retained{rep}.north);',
        rf'\draw[arrow] ({x},-1.4) -- (excluded{rep}.west);',
        rf'\draw[arrow] (retained{rep}.south) -- (result{rep}.north);',
    ])
ctd_chart.extend([r'\end{tikzpicture}', r'\endgroup'])
(OUT.parent / 'figures/results-ctd-flow.tex').write_text('\n'.join(ctd_chart)+'\n')

# Repetition changes: the two measures overlap and must not be stacked.
stability_chart = [
    r'% Generated by analysis/build-results-review.py from verified question-level stability counts.',
    r'\begingroup',
    r'\definecolor{correctnessbar}{HTML}{24557A}',
    r'\definecolor{classbar}{HTML}{168475}',
    r'\begin{tikzpicture}[x=.55cm,y=1cm,font=\small]',
    r'\foreach \x in {0,5,10,15,20} {',
    r'  \draw[black!10] (\x,.3) -- (\x,3.4);',
    r'  \node[below=4pt] at (\x,.3) {\x};',
    r'}',
    r'\draw[black!45,line width=.6pt] (0,.3) -- (0,3.4);',
    r'\node at (10,-.55) {Questions that changed (out of 160 standalone questions)};',
]
for model, label, centre in [('nova-lite', 'Nova', 2.7), ('haiku-4-5', 'Haiku', 1.1)]:
    stability_chart.append(rf'\node[anchor=east,font=\small\bfseries] at (-.5,{centre}) {{{label}}};')
    for key, offset, colour in [('changed_correctness_ids', .3, 'correctnessbar'),
                                ('changed_class_ids', -.3, 'classbar')]:
        count = len(stability[model][key])
        y = centre + offset
        stability_chart.extend([
            rf'\fill[{colour}] (0,{y-.2:.2f}) rectangle ({count},{y+.2:.2f});',
            rf'\node[anchor=west,font=\small\bfseries] at ({count+.3},{y:.2f}) {{{count}}};',
        ])
stability_chart.extend([
    r'\fill[correctnessbar] (0,-1.35) rectangle (.45,-1.1);',
    r'\node[anchor=west] at (.7,-1.225) {Correctness status changed};',
    r'\fill[classbar] (10.5,-1.35) rectangle (10.95,-1.1);',
    r'\node[anchor=west] at (11.2,-1.225) {Trajectory class changed};',
    r'\end{tikzpicture}', r'\endgroup',
])
(OUT.parent / 'figures/results-stability.tex').write_text('\n'.join(stability_chart)+'\n')

# Total attempts include the first SQL invocation and all subsequent attempts.
attempt_chart = [
    r'% Generated by analysis/build-results-review.py from saved evaluations.',
    r'\begingroup',
    r'\definecolor{novabar}{HTML}{24557A}',
    r'\definecolor{haikubar}{HTML}{168475}',
    r'\begin{tikzpicture}[x=.029cm,y=1cm,font=\small]',
    r'\foreach \x in {0,100,200,300,400} {',
    r'  \draw[black!10] (\x,-.25) -- (\x,3.95);',
    r'  \node[below] at (\x,-.25) {\x};',
    r'}',
    r'\draw[black!45,line width=.6pt] (0,-.25) -- (0,3.95);',
    r'\node at (200,-1.2) {Total SQL attempts across 160 standalone questions};',
]
for label, run, y in zip(['Nova 1', 'Nova 2', 'Haiku 1', 'Haiku 2'],
                         ordered_runs, [3.6, 2.6, 1.3, .3]):
    total = run['attempt_total']
    colour = 'novabar' if label.startswith('Nova') else 'haikubar'
    attempt_chart += [
        rf'\node[anchor=east,font=\small\bfseries] at (-7,{y}) {{{label}}};',
        rf'\fill[{colour}] (0,{y-.3}) rectangle ({total},{y+.3});',
        rf'\node[anchor=west,font=\small\bfseries] at ({total+5},{y}) {{{total}}};',
    ]
attempt_chart += [r'\end{tikzpicture}', r'\endgroup']
(OUT.parent / 'figures/results-attempts.tex').write_text('\n'.join(attempt_chart)+'\n')

# Difficulty-specific final accuracy uses each group's own denominator.
difficulty_chart = [
    r'% Generated by analysis/build-results-review.py from verified summaries.',
    r'\begingroup',
    r'\definecolor{novaone}{HTML}{24557A}',
    r'\definecolor{novatwo}{HTML}{709AB8}',
    r'\definecolor{haikuone}{HTML}{168475}',
    r'\definecolor{haikutwo}{HTML}{78B8A9}',
    r'\begin{tikzpicture}[x=1cm,y=.045cm,font=\small]',
    r'\foreach \y in {0,20,40,60,80,100} {',
    r'  \draw[black!10] (0,\y) -- (12,\y);',
    r'  \node[anchor=east] at (-.1,\y) {\y};',
    r'}',
    r'\draw[black!45,line width=.6pt] (0,0) -- (12,0);',
    r'\node[rotate=90] at (-1.1,50) {Final Success Rate (FSR, \%)};',
]
colours = ['novaone', 'novatwo', 'haikuone', 'haikutwo']
for group, difficulty in enumerate(['easy', 'medium', 'hard']):
    for index, run in enumerate(ordered_runs):
        metric = run['summary']['byDifficulty'][difficulty]['finalSuccessRate']
        value = Decimal(metric['numerator'])*100/Decimal(metric['denominator'])
        label = str(value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)).rstrip('0').rstrip('.')
        x = .5 + group*4 + index*.78
        difficulty_chart += [
            rf'\fill[{colours[index]}] ({x},0) rectangle ({x+.58},{value});',
            rf'\node[above,font=\scriptsize\bfseries] at ({x+.29},{value+1}) {{{label}}};',
        ]
    n = ordered_runs[0]['summary']['byDifficulty'][difficulty]['finalSuccessRate']['denominator']
    difficulty_chart.append(rf'\node[below,font=\small\bfseries] at ({1.96+group*4},-3) {{{difficulty.capitalize()} ($n={n}$)}};')
for index, (label, colour) in enumerate(zip(['Nova 1', 'Nova 2', 'Haiku 1', 'Haiku 2'], colours)):
    x = .5 + index*3
    difficulty_chart += [
        rf'\fill[{colour}] ({x},-22) rectangle ({x+.25},-18);',
        rf'\node[anchor=west,font=\footnotesize] at ({x+.35},-20) {{{label}}};',
    ]
difficulty_chart += [r'\end{tikzpicture}', r'\endgroup']
(OUT.parent / 'figures/results-difficulty.tex').write_text('\n'.join(difficulty_chart)+'\n')

# Paired bars use unrounded rates; labels and FDG use decimal rounding.
correctness_chart = [
    r'% Generated by analysis/build-results-review.py from verified run summaries.',
    r'\begingroup',
    r'\definecolor{finalbar}{HTML}{24557A}',
    r'\definecolor{directbar}{HTML}{168475}',
    r'\begin{tikzpicture}[x=1cm,y=0.05cm,font=\small]',
    r'\foreach \y in {0,20,40,60,80,100} {',
    r'  \draw[black!10] (0,\y) -- (12,\y);',
    r'  \node[anchor=east] at (-.1,\y) {\y};',
    r'}',
    r'\draw[black!45,line width=.6pt] (0,0) -- (12,0);',
    r'\node[rotate=90] at (-1.1,50) {Standalone questions (\%)};',
]
gaps = []
for index, (label, run) in enumerate(zip(['Nova 1', 'Nova 2', 'Haiku 1', 'Haiku 2'], ordered_runs)):
    centre = 1.65 + index*2.9
    correctness_chart.append(rf'\node[below,font=\small\bfseries] at ({centre},-2) {{{label}}};')
    for offset, key, color in [(-.65, 'finalSuccessRate', 'finalbar'),
                               (.65, 'cleanDirectSuccessRate', 'directbar')]:
        rate = run['summary']['standalone'][key]
        value = Decimal(rate['numerator'])*100/Decimal(rate['denominator'])
        display = value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        x = centre + offset
        correctness_chart.extend([
            rf'\fill[{color}] ({x-.45},0) rectangle ({x+.45},{value});',
            rf'\node[above=3pt,font=\small\bfseries] at ({x},{value}) {{{display}}};',
        ])
    gap = run['summary']['standalone']['finalToDirectGap']
    assert gap['denominator'] == 160
    gaps.append(gap['numerator'])
assert gaps == [5, 5, 5, 5]
correctness_chart.extend([
    r'\fill[finalbar] (1.8,-22) rectangle (2.05,-18);',
    r'\node[anchor=west] at (2.15,-20) {Final success (FSR)};',
    r'\fill[directbar] (6.5,-22) rectangle (6.75,-18);',
    r'\node[anchor=west] at (6.85,-20) {Clean direct success (CDSR)};',
    r'\node[draw=black!50,fill=black!3,rounded corners=2pt,',
    r'  inner sep=8pt,align=center,text width=10.6cm] at (6,-42)',
    r'  {\textbf{Final-to-direct gap: 3.13 percentage points in every run}\\[3pt]',
    r'   Five additional successes out of 160 questions per run};',
    r'\end{tikzpicture}', r'\endgroup',
])
(OUT.parent / 'figures/results-correctness.tex').write_text('\n'.join(correctness_chart)+'\n')

# Recovery bars retain each run's denominator in the visible labels.
recovery_chart = [
    r'% Generated by analysis/build-results-review.py from verified summaries.',
    r'\begingroup',
    r'\definecolor{novabar}{HTML}{24557A}',
    r'\definecolor{haikubar}{HTML}{168475}',
    r'\begin{tikzpicture}[x=.25cm,y=1cm,font=\small]',
    r'\foreach \x in {0,10,20,30,40} {',
    r'  \draw[black!10] (\x,-.25) -- (\x,3.95);',
    r'  \node[below] at (\x,-.25) {\x};',
    r'}',
    r'\draw[black!45,line width=.6pt] (0,-.25) -- (0,3.95);',
    r'\node at (20,-1) {Recovery Rate (RR, \%)};',
]
for index, (label, run) in enumerate(zip(['Nova 1', 'Nova 2', 'Haiku 1', 'Haiku 2'], ordered_runs)):
    rate = run['summary']['standalone']['recoveryRate']
    n, d = rate['numerator'], rate['denominator']
    value = Decimal(n)*100/Decimal(d)
    display = value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    y = [3.3, 2.3, 1, 0][index]
    color = 'novabar' if index < 2 else 'haikubar'
    recovery_chart.extend([
        rf'\node[anchor=east,font=\small\bfseries] at (-.7,{y+.3}) {{{label}}};',
        rf'\fill[{color}] (0,{y}) rectangle ({value},{y+.6});',
        rf'\node[anchor=west,fill=white,inner sep=3pt] at ({value+Decimal(".6")},{y+.3}) '
        rf'{{\textbf{{{display}\%}}\enspace\textcolor{{black!65}}{{({n}/{d})}}}};',
    ])
recovery_chart.extend([r'\end{tikzpicture}', r'\endgroup'])
(OUT.parent / 'figures/results-recovery-rates.tex').write_text('\n'.join(recovery_chart)+'\n')

# Vector chart included directly by Chapter 4. All segments use saved classes.
chart_classes = [
    ('DIRECT_SUCCESS', 'direct', 'Direct success'),
    ('EXECUTION_ERROR_RECOVERED', 'recovery', 'Execution-error recovery'),
    ('EXECUTED_SEMANTIC_FAILURE', 'semantic', 'Executed semantic failure'),
    ('UNRECOVERED_EXECUTION_FAILURE', 'execution', 'Unrecovered execution failure'),
    ('NO_SQL', 'nosql', 'No SQL'),
]
chart = [r'% Generated by analysis/build-results-review.py; counts out of 160.',
         r'\begingroup',
         r'\definecolor{direct}{HTML}{24557A}',
         r'\definecolor{recovery}{HTML}{168475}',
         r'\definecolor{semantic}{HTML}{E4B15A}',
         r'\definecolor{execution}{HTML}{A34C40}',
         r'\definecolor{nosql}{HTML}{555555}',
         r'\begin{tikzpicture}[x=0.062cm,y=1cm,font=\small]',
         r'\foreach \x in {0,40,80,120,160} {',
         r'  \draw[black!10] (\x,-.1) -- (\x,4.5);',
         r'  \node[below] at (\x,-.1) {\x};',
         r'}',
         r'\node at (80,-.9) {Number of standalone questions};']
for index, (label, run) in enumerate(zip(['Nova 1', 'Nova 2', 'Haiku 1', 'Haiku 2'], ordered_runs)):
    counts = Counter(row['class'] for row in run['standalone'].values())
    assert sum(counts.values()) == 160
    assert not (set(counts) - {name for name, _, _ in chart_classes})
    y = [3.6, 2.6, 1.3, .3][index]
    chart.append(rf'\node[anchor=east,font=\small\bfseries] at (-3,{y + .32}) {{{label}}};')
    start = 0
    for name, color, _ in chart_classes:
        n = counts[name]
        if not n:
            continue
        chart.append(rf'\filldraw[fill={color},draw=white,line width=.4pt] '
                     rf'({start},{y}) rectangle ({start+n},{y+.64});')
        if n >= 5:
            ink = 'black' if color == 'semantic' else 'white'
            chart.append(rf'\node[text={ink},font=\scriptsize\bfseries] at '
                         rf'({start+n/2},{y+.32}) {{{n}}};')
        else:
            chart.append(rf'\draw[black!60] ({start+n/2},{y+.64}) -- '
                         rf'({start+n/2},{y+.93});')
            chart.append(rf'\node[above,font=\scriptsize] at '
                         rf'({start+n/2},{y+.93}) {{{n}}};')
        start += n
for index, (_, color, label) in enumerate(chart_classes):
    x = 0 if index % 2 == 0 else 80
    y = -1.55 - .45*(index//2)
    chart.append(rf'\fill[{color}] ({x},{y-.08}) rectangle ({x+3},{y+.08});')
    chart.append(rf'\node[anchor=west,font=\footnotesize] at ({x+4},{y}) {{{label}}};')
chart.extend([r'\end{tikzpicture}', r'\endgroup'])
(OUT.parent / 'figures/results-trajectories.tex').write_text('\n'.join(chart)+'\n')

# Reviewable tables for the planned supplementary section, separate from the
# supervisor draft. Full per-case/turn rows are retained in results-review-data.json.
supplement_text = [
    '# Supplementary trajectory counts\n',
    'Generated by `build-results-review.py` from saved evaluations. '
    'These counts are separate from standalone headline metrics.\n',
]
for partition, title in [('resolved_ambiguity', 'Resolved ambiguity cases'),
                         ('interactive_turns', 'Interactive turns')]:
    groups = [run['supplementary'][partition] for run in ordered_runs]
    supplement_text.extend([
        f'## {title}\n',
        '| Measure | Nova 1 | Nova 2 | Haiku 1 | Haiku 2 |',
        '| --- | ---: | ---: | ---: | ---: |',
    ])
    measures = [(label, [g[key] for g in groups]) for label, key in [
        ('Assessed trajectories', 'trajectory_count'), ('Correct', 'correct_count'),
        ('Recoveries', 'recovery_count'), ('Total SQL attempts', 'attempt_total'),
        ('Median SQL attempts', 'attempt_median'), ('Maximum SQL attempts', 'attempt_max')]]
    for name in sorted({name for g in groups for name in g['class_counts']}):
        measures.append((name, [g['class_counts'].get(name, 0) for g in groups]))
    supplement_text.extend('| ' + label + ' | ' + ' | '.join(map(str, values)) + ' |'
                           for label, values in measures)
    supplement_text.append('')
supplement_text.append(
    'Ambiguity counts include only cases with clarification before SQL and a supplied '
    'scripted reply. Direct success describes their SQL trajectory, not absence of '
    'clarification. Interactive counts use individual authored turns, not retries '
    'between turns. Recovery counts overlap with correct counts and class counts; '
    'the rows must not be summed. Safety actions, answers and existing manual labels '
    'are retained in the JSON for selecting examples; no new safety classes are assigned.\n')
(OUT / 'supplementary-trajectory-counts.md').write_text('\n'.join(supplement_text))


def pct(rate):
    value = (Decimal(rate['numerator'])*100/Decimal(rate['denominator'])).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP)
    return f"{rate['numerator']}/{rate['denominator']} ({value}\\%)"


def table_row(label, values):
    return label + ' & ' + ' & '.join(map(str, values)) + r' \\' + '\n'


tables = {}
tables['CoreRows'] = ''.join(table_row(label, [pct(r['summary']['standalone'][key]) for r in ordered_runs])
    for label, key in [('Final Success Rate (FSR)', 'finalSuccessRate'),
                      ('Clean Direct Success Rate (CDSR)', 'cleanDirectSuccessRate'),
                      ('Recovered Success Contribution (RSC)', 'recoveredSuccessContribution'),
                      ('Recovery Rate (RR)', 'recoveryRate')])
tables['CoreRows'] += table_row('Recovery after execution errors',
    [pct(r['summary']['errorResponse']['observationConditionedRecoveryRate']) for r in ordered_runs])
tables['OutcomeRows'] = ''.join(table_row(label, [r['summary']['standalone']['trajectoryClassCounts'][key]
    for r in ordered_runs]) for label, key in [
        ('Direct success', 'DIRECT_SUCCESS'), ('Execution-error recovery', 'EXECUTION_ERROR_RECOVERED'),
        ('Semantic-revision success', 'SEMANTIC_REVISION_SUCCESS'),
        ('Executed but incorrect result', 'EXECUTED_SEMANTIC_FAILURE'),
        ('Terminal execution failure', 'UNRECOVERED_EXECUTION_FAILURE'),
        ('No SQL', 'NO_SQL'), ('System error', 'SYSTEM_ERROR')])
tables['ErrorRows'] = ''.join(table_row(label, [r['summary']['errorResponse']['categoryCounts'][key]
    for r in ordered_runs]) for label, key in [
        ('Next SQL executed successfully', 'retry_executed_successfully'),
        ('Next SQL repeated the same error', 'retry_repeated_same_error'),
        ('Next SQL produced a different error', 'retry_produced_different_error'),
        ('No subsequent SQL attempt', 'no_retry'), ('Uncertain transition', 'transition_uncertain')])
tables['ErrorRows'] += table_row('Total error transitions',
    [r['summary']['errorResponse']['transitionCount'] for r in ordered_runs])
tables['ErrorRows'] += '\\midrule\n'
tables['ErrorRows'] += table_row('Cases exceeding one-retry instruction',
    [len(r['retry_policy_exceeded_ids']) for r in ordered_runs])
tables['ErrorRows'] += table_row('Maximum SQL attempts per case', [r['attempt_max'] for r in ordered_runs])
tables['ErrorRows'] += table_row('Unchanged SQL retries',
    [r['unchanged_retry_count'] for r in ordered_runs])
tables['AttemptRows'] = ''
for label, counts in [('Zero', [0]), ('One', [1]), ('Two', [2]),
                      ('More than two', None)]:
    tables['AttemptRows'] += table_row(label, [sum(
        n for k, n in r['attempt_count_distribution'].items()
        if (k > 2 if counts is None else k in counts)) for r in ordered_runs])
tables['AttemptRows'] += '\\midrule\n' + table_row('Total SQL attempts',
    [r['attempt_total'] for r in ordered_runs])
for r in ordered_runs:
    distribution = r['attempt_count_distribution']
    assert sum(distribution.values()) == 160
    assert sum(k*n for k, n in distribution.items()) == r['attempt_total']
tables['DifficultyRows'] = ''
for d in ('easy', 'medium', 'hard'):
    if d != 'easy':
        tables['DifficultyRows'] += '\\midrule\n'
    for label, key in [('final success', 'finalSuccessRate'),
                       ('clean direct', 'cleanDirectSuccessRate')]:
        tables['DifficultyRows'] += table_row(f'{d.capitalize()}: {label}',
            [pct(r['summary']['byDifficulty'][d][key]) for r in ordered_runs])
    gaps = [r['summary']['byDifficulty'][d]['finalToDirectGap'] for r in ordered_runs]
    tables['DifficultyRows'] += table_row(f'{d.capitalize()}: gap (pp)', [
        str((Decimal(g['numerator'])*100/Decimal(g['denominator'])).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP)) for g in gaps])
tables['PairedRows'] = ''.join(table_row(label, [paired[str(r)][key] for r in REPETITIONS])
    for label, key in [('Both correct', 'both_correct'), ('Only Haiku correct', 'only_haiku_correct'),
                      ('Only Nova correct', 'only_nova_correct'), ('Neither correct', 'neither_correct')])
tables['CorrectnessRows'] = tables['PairedRows']
tables['PairedRows'] += table_row('Equal terminal-outcome category',
    [len(paired[str(r)]['equal_terminal_outcome_ids']) for r in REPETITIONS])
tables['PairedRows'] += table_row('Different class given equal outcome (CTD)',
    [f"{len(paired[str(r)]['different_class_same_outcome_ids'])}/{len(paired[str(r)]['equal_terminal_outcome_ids'])} "
     f"({100*paired[str(r)]['ctd']:.2f}\\%)" for r in REPETITIONS])
tables['SupplementRows'] = ''.join(table_row(label, [pct(r['summary'][part][key]) for r in ordered_runs])
    for label, part, key in [('Clarification before SQL', 'ambiguity', 'clarificationDetectionRate'),
                            ('Missed clarification', 'ambiguity', 'missedClarificationRate'),
                            ('Correct after scripted reply', 'ambiguity', 'postClarificationAccuracy'),
                            ('Correct interactive turns', 'interactive', 'turnAccuracy'),
                            ('Entire interactive episode correct', 'interactive', 'completeEpisodeAccuracy'),
                            ('No SQL in safety cases', 'safety', 'noQueryRate')])
tables['SupplementRows'] += table_row('Manual safety: compliant / partial / non-compliant',
    [' / '.join(str(r['summary']['safety']['manualLabelCounts'][k])
                for k in ('compliant', 'partially_compliant', 'non_compliant')) for r in ordered_runs])
tables['DifferenceEstimate'] = str(Decimal(str(output['uncertainty']['haiku_minus_nova_mean_fsr_pp'])).quantize(
    Decimal('0.01'), rounding=ROUND_HALF_UP))
tables['DifferenceInterval'] = f"{percentile(.025):.2f}--{percentile(.975):.2f}"
ordered_sensitivity = [sensitivity_runs[f'{m}/{r}'] for m in MODELS for r in REPETITIONS]
tables['SensitivityRows'] = table_row('Original final success',
    [pct(r['summary']['standalone']['finalSuccessRate']) for r in ordered_runs])
tables['SensitivityRows'] += table_row('Successes among excluded cases',
    [r['excluded_final_success_count'] for r in ordered_sensitivity])
tables['SensitivityRows'] += ''.join(table_row(label, [pct(r[key]) for r in ordered_sensitivity])
    for label, key in [('Retained final success', 'finalSuccessRate'),
                      ('Retained clean direct success', 'cleanDirectSuccessRate')])
tables['SensitivityRows'] += table_row('Retained recovered successes',
    [r['recovered_count'] for r in ordered_sensitivity])
tables['ProvenanceRows'] = ''
for model, label in [('nova-lite', 'Nova'), ('haiku-4-5', 'Haiku')]:
    for rep in REPETITIONS:
        record = provenance[f'{model}/{rep}']
        dates = [datetime.fromisoformat(record[k].replace('Z', '+00:00')).strftime('%d %b %Y, %H:%M:%S')
                 for k in ('first_recorded_event_utc', 'last_recorded_event_utc')]
        tables['ProvenanceRows'] += table_row(f'{label} {rep}', dates)
# Compact supervisor draft; retain the detailed macros for other write-ups.
tables['DraftErrorRows'] = tables['ErrorRows'].split('\\midrule')[0]
tables['DraftDifficultyRows'] = ''
for difficulty in ('easy', 'medium', 'hard'):
    metrics = [r['summary']['byDifficulty'][difficulty] for r in ordered_runs]
    denominator = metrics[0]['finalSuccessRate']['denominator']
    tables['DraftDifficultyRows'] += table_row(f'{difficulty.capitalize()} ($N={denominator}$)', [
        f"{m['finalSuccessRate']['numerator']} / {m['cleanDirectSuccessRate']['numerator']}"
        for m in metrics])
(OUT / 'results-review-values.tex').write_text(
    '% Generated by build-results-review.py; do not edit.\n' + ''.join(
        '\\newcommand{\\' + name + '}{' + body + '}\n' for name, body in tables.items()))
print('All summary checks passed. Wrote', OUT / 'results-review-data.json')
print(json.dumps({'stability': stability, 'uncertainty': output['uncertainty']}, indent=2))
