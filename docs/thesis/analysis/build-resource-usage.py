"""Export formal-run resource evidence and generate appendix tables/figure.

Uses a consistent temporary SQLite backup, never all application interactions.
Run with Python 3; no external packages or AWS calls are needed.
"""
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
PARTITIONS = {'E': 'Standalone', 'M': 'Standalone', 'H': 'Standalone',
              'A': 'Ambiguity', 'C': 'Interactive', 'S': 'Safety'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def percentile(values, p):
    """Linear interpolation at (n-1)*p, including the endpoints."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * p
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def summarise(rows):
    durations = [r['elapsed_ms'] / 1000 for r in rows]
    return dict(interactions=len(rows),
                input_tokens=sum(r['input_tokens'] for r in rows),
                output_tokens=sum(r['output_tokens'] for r in rows),
                q1_seconds=percentile(durations, .25),
                median_seconds=percentile(durations, .5),
                q3_seconds=percentile(durations, .75),
                p95_seconds=percentile(durations, .95),
                max_seconds=max(durations))


def main():
    sources = {}
    rows = []
    used_ids = set()
    max_timing_difference = 0
    with TemporaryDirectory(prefix='thesis-resource-') as folder:
        source = sqlite3.connect((ROOT / 'src/backend/data/transcripts.db').as_uri() + '?mode=ro', uri=True)
        snapshot_path = Path(folder) / 'snapshot.db'
        snapshot = sqlite3.connect(snapshot_path)
        source.backup(snapshot)
        source.close()
        snapshot.close()
        snapshot_hash = sha256(snapshot_path.read_bytes()).hexdigest()
        db = sqlite3.connect(snapshot_path)
        db.row_factory = sqlite3.Row
        for model in ('nova-lite', 'haiku-4-5'):
            for rep in (1, 2):
                path = ROOT / f'src/experiments/runs/{model}/repetition-{rep}/interactions.jsonl'
                raw = path.read_bytes()
                sources[str(path.relative_to(ROOT))] = sha256(raw).hexdigest()
                for line in raw.splitlines():
                    record = json.loads(line)
                    require(record['modelCondition'] == model and record['repetition'] == rep, 'Run label mismatch')
                    matches = db.execute('SELECT id, elapsed_ms, input_tokens, output_tokens, total_tokens FROM interactions WHERE session_id=? AND question=?',
                                         (record['sessionId'], record['input'])).fetchall()
                    require(len(matches) == 1, f"Non-unique SQLite match: {model}/{rep}/{record['questionId']}")
                    saved = dict(matches[0])
                    require(saved['id'] not in used_ids, 'Database interaction reused')
                    used_ids.add(saved['id'])
                    usage = record['response']['tokenUsage']
                    for column, field in [('input_tokens', 'inputTokens'), ('output_tokens', 'outputTokens'), ('total_tokens', 'totalTokens')]:
                        require(saved[column] is not None and saved[column] >= 0, 'Missing/negative usage')
                        require(saved[column] == usage[field], 'SQLite/JSON usage mismatch')
                    require(saved['total_tokens'] == saved['input_tokens'] + saved['output_tokens'], 'Token total mismatch')
                    events = db.execute("SELECT trace_id, input_tokens, output_tokens FROM trace_events WHERE interaction_id=? AND event_type='MODEL_OUTPUT'", (saved['id'],)).fetchall()
                    require(len({e['trace_id'] for e in events}) == len(events), 'Duplicate model-output trace IDs')
                    for column in ('input_tokens', 'output_tokens'):
                        require(all(e[column] is not None for e in events), 'Missing event usage')
                        require(sum(e[column] for e in events) == saved[column], 'Event/interaction usage mismatch')
                    require(saved['elapsed_ms'] is not None and saved['elapsed_ms'] > 0, 'Invalid duration')
                    delta = abs(saved['elapsed_ms'] / 1000 - record['response']['elapsedTimeSeconds'])
                    require(delta <= .051, 'SQLite/JSON timing mismatch beyond rounding tolerance')
                    max_timing_difference = max(max_timing_difference, delta)
                    rows.append(dict(model=model, repetition=rep, question_id=record['questionId'],
                                     turn_number=record['turnNumber'], interaction_order=record['interactionOrder'],
                                     input_type=record['inputType'], partition=PARTITIONS[record['questionId'].split('-')[-1][0]],
                                     database_interaction_id=saved.pop('id'), **saved))
        db.close()
    runs, partitions = defaultdict(list), defaultdict(list)
    for row in rows:
        runs[row['model'], row['repetition']].append(row)
        partitions[row['model'], row['repetition'], row['partition']].append(row)
    totals = [dict(model=m, repetition=r, **summarise(v)) for (m,r),v in runs.items()]
    groups = [dict(model=m, repetition=r, partition=p, **summarise(v)) for (m,r,p),v in partitions.items()]
    require(len(rows) == 858, 'Unexpected formal-run interaction count')
    for t in totals:
        require(t['interactions'] == (216 if t['model'] == 'nova-lite' else 213), 'Unexpected run size')
    for relative in ('src/backend/services/bedrock-agent-client.ts',
                     'src/backend/services/bedrock-response-processor.ts',
                     'docs/thesis/analysis/build-resource-usage.py'):
        sources[relative] = sha256((ROOT / relative).read_bytes()).hexdigest()
    payload = dict(sources=sources, sqlite_snapshot_sha256=snapshot_hash,
                   percentile_method='linear interpolation at (n-1)*p on sorted interaction durations',
                   timing_unit='seconds (SQLite elapsed_ms / 1000)',
                   max_sqlite_json_timing_difference_seconds=round(max_timing_difference, 6),
                   totals=totals, partitions=groups, interactions=rows)
    (OUT / 'resource-usage-data.json').write_text(json.dumps(payload, indent=2) + '\n')
    table = ['% Generated by analysis/build-resource-usage.py.',
             r'\begin{tabularx}{\textwidth}{@{}Xrrrrrr@{}}', r'\toprule',
             r'\textbf{Run} & \textbf{Interactions} & \textbf{Input tokens} & \textbf{Output tokens} & \textbf{Median (s)} & \textbf{Q1--Q3 (s)} & \textbf{P95 (s)} \\',
             r'\midrule']
    for t in totals:
        name = ('Nova' if t['model'] == 'nova-lite' else 'Haiku') + ' ' + str(t['repetition'])
        table.append(f"{name} & {t['interactions']} & {t['input_tokens']:,} & {t['output_tokens']:,} & {t['median_seconds']:.2f} & {t['q1_seconds']:.2f}--{t['q3_seconds']:.2f} & {t['p95_seconds']:.2f} " + r'\\')
    table.extend([r'\bottomrule', r'\end{tabularx}'])
    (OUT / 'resource-usage-rows.tex').write_text('\n'.join(table) + '\n')
    # Four panels share a linear 0--8 second axis and display medians only.
    figure = [r'% Generated by analysis/build-resource-usage.py.', r'\begingroup',
              r'\definecolor{usageNova}{HTML}{24557A}', r'\definecolor{usageHaiku}{HTML}{168475}',
              r'\begin{tikzpicture}[x=.57cm,y=.55cm,font=\footnotesize]']
    titles = ('Standalone questions', 'Ambiguity interactions', 'Interactive turns', 'Safety requests')
    for index, partition in enumerate(('Standalone', 'Ambiguity', 'Interactive', 'Safety')):
        xshift = (index % 2) * 7.2
        yshift = -(index // 2) * 4.4
        figure += [rf'\begin{{scope}}[xshift={xshift}cm,yshift={yshift}cm]',
                   rf'\node[anchor=west,font=\small\bfseries] at (-1.8,1.1) {{{titles[index]}}};']
        for tick in (0, 2, 4, 6, 8):
            figure += [rf'\draw[black!10] ({tick},.45) -- ({tick},-3.5);',
                       rf'\node[below=3pt] at ({tick},-3.5) {{{tick}}};']
        figure.append(r'\draw[black!40] (0,-3.5) -- (8,-3.5);')
        for offset, t in enumerate(totals):
            g = next(g for g in groups if g['partition'] == partition and g['model'] == t['model'] and g['repetition'] == t['repetition'])
            y = -offset
            median = g['median_seconds']
            require(0 <= median <= 8, 'Median exceeds shared chart axis')
            colour = 'usageNova' if t['model'] == 'nova-lite' else 'usageHaiku'
            label = ('Nova' if t['model'] == 'nova-lite' else 'Haiku') + ' ' + str(t['repetition'])
            figure += [rf'\node[anchor=east] at (-.15,{y}) {{{label}}};',
                       rf'\fill[{colour}] (0,{y-.28}) rectangle ({median},{y+.28});',
                       rf'\node[anchor=west,font=\footnotesize\bfseries] at ({median+.08},{y}) {{{median:.2f}}};']
        figure += [r'\node at (4,-4.8) {Median duration (seconds)};', r'\end{scope}']
    figure += [r'\end{tikzpicture}', r'\endgroup']
    (ROOT / 'docs/thesis/figures/resource-usage-timings.tex').write_text('\n'.join(figure)+'\n')
    print(json.dumps({'totals':totals,'partitions':groups,'validated_interactions':len(rows),
                      'max_timing_difference_seconds':max_timing_difference},indent=2))


if __name__ == '__main__':
    main()
