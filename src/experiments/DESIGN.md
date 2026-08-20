# Chinook-Bench-200 Experiment Runner and Evaluator Design

> **Status:** golden SQL generation implemented; benchmark runner and evaluator pending.
>
> **Evaluation specification:** [`../../docs/trace-aware-evaluation-plan-v3.md`](../../docs/trace-aware-evaluation-plan-v3.md)
>
> **Questions and golden SQL:** [`../../benchmarks/chinook-bench-200.jsonl`](../../benchmarks/chinook-bench-200.jsonl)

## 1. Goal

Create a small TypeScript command-line application that:

1. executes all golden SQL and saves the complete results locally as JSON;
2. sends the 200 benchmark questions to the local server one at a time;
3. handles the scripted ambiguity replies and interactive follow-up questions;
4. saves each server response and retrieves the complete Athena result for every successful SQL
   attempt;
5. reads the traces already persisted in SQLite;
6. compares candidate results with golden results; and
7. produces JSON and Markdown evaluation results.

The runner will use one deployed model at a time. Nova Lite will be executed first. Haiku 4.5
can be deployed and executed later using the same code.

## 2. Simplifications from the previous design

The following are intentionally removed:

- per-run configuration files;
- run manifests;
- file, benchmark, SQL, prompt, and dataset hashes;
- dataset snapshot validation;
- preflight checks;
- agent ID, alias, and version validation;
- agent ID, alias, and version in experiment outputs;
- golden-result CSV files;
- golden-result cache terminology and cache invalidation;
- server-timeout metrics and infrastructure retry classification; and
- a required backend change for returning an interaction ID.

The earlier manifest and hashes were intended to prove that different runs used exactly the same
code, data, and deployment. That is unnecessary for this project because the final questions and
golden SQL are committed in source control, the application runs locally, and only one agent is
deployed at a time.

There is also no separate cache. The saved golden JSON files are simply the reference results used
by every later evaluation. They are generated once and read from disk when a run is evaluated.

## 3. Inputs

The experiment tools use existing project inputs directly:

- `benchmarks/chinook-bench-200.jsonl` for questions, scripted replies, golden SQL, and comparison
  rules;
- the existing root `.env` values for AWS region, Athena database, workgroup, and output location;
- `http://localhost:8000/api/analytics-pipeline` as the default server endpoint; and
- `src/backend/data/transcripts.db` for persisted interactions and traces.

The model condition and repetition are simple command arguments used to organize outputs:

```sh
npm --prefix src/experiments run execute -- --model nova-lite --repetition 1
npm --prefix src/experiments run execute -- --model haiku-4-5 --repetition 1
```

The model value is only a user-provided label. The experiment tools do not inspect or expose Bedrock
agent IDs, aliases, or versions.

## 4. Proposed structure

```text
src/experiments/
  DESIGN.md
  package.json
  tsconfig.json
  jest.config.cjs
  types.ts

  runner/
    question-runner.ts
    episode-runner.ts
    server-client.ts

  evaluation/
    trace-parser.ts
    result-normalizer.ts
    result-comparator.ts
    attempt-evaluator.ts
    trajectory-classifier.ts
    error-transition-evaluator.ts
    report-generator.ts

  shared/
    services/
      athena/
        athena-service.ts
        generate-golden-results.ts
        golden-result-generator.ts
        golden-result-writer.ts

      benchmark/
        benchmark-loader.ts
        gold-query-definition-builder.ts
        gold-sql-resolver.ts

      transcripts/
        transcript-reader.ts

  tests/
    fixtures/
    unit/
    integration/

  runs/
    golden-sql/
    nova-lite/
      repetition-1/
    haiku-4-5/
      repetition-1/
```

## 5. Commands

The first implementation needs only three commands:

```text
gold       Execute all golden SQL and save reference results
execute    Send benchmark questions to the local server
evaluate   Compare one completed run and generate reports
```

The root `Makefile` exposes these entry points. The currently implemented command is:

```sh
make gold
```

`make execute` and `make evaluate` will be added with their respective implementation stages. The
commands remain separate so evaluation logic can be corrected and rerun without sending the 200
questions to Bedrock again.

## 6. Golden SQL execution

### 6.1 What is executed

The `gold` command executes the 190 available golden SQL definitions directly in Athena:

```text
160 standalone questions
20 resolved ambiguity questions
10 interactive turns
```

Safety questions do not have golden SQL and produce no result file.

Athena results are retrieved through every `GetQueryResults` page. The 200-row preview limit used
by the agent action does not apply to golden result collection.

### 6.2 Files

Each result is saved under the requested directory:

```text
src/experiments/runs/golden-sql/CB200-E012.json
src/experiments/runs/golden-sql/CB200-A001.json
src/experiments/runs/golden-sql/CB200-C001-T01.json
src/experiments/runs/golden-sql/CB200-C001-T02.json
```

Standalone and ambiguity files use the question ID. Interactive cases need a turn suffix because
each case contains two questions and therefore two different result sets.

No CSV files are generated.

### 6.3 JSON shape

The golden result file remains deliberately small:

```json
{
    "questionId": "CB200-E012",
    "turnNumber": null,
    "columns": [
        { "name": "customer_id", "type": "integer" },
        { "name": "first_name", "type": "varchar" },
        { "name": "last_name", "type": "varchar" },
        { "name": "city", "type": "varchar" }
    ],
    "rows": [["46", "Hugh", "O'Reilly", "Dublin"]],
    "rowCount": 1
}
```

Rows are arrays instead of objects so the evaluator preserves column position, duplicate values,
duplicate rows, and NULL values. Column types are needed to compare numbers and dates correctly.

The benchmark remains the source for the golden SQL and comparison rules, so they do not need to
be duplicated in each result file.

Running `gold` again overwrites the existing JSON results.

### 6.4 Interactive placeholders

Two interactive queries contain placeholders:

```text
CB200-C001 turn 2: :previous_genre_name
CB200-C002 turn 2: :previous_artist_id
```

A small explicit mapping in `gold-sql-resolver.ts` states where each value comes from:

```text
CB200-C001 turn 2 <- turn 1, first row, name column
CB200-C002 turn 2 <- turn 1, first row, artist_id column
```

The value is taken from the preceding golden result and safely converted to an SQL literal. It is
never taken from the model's answer.

## 7. Question execution

The runner processes questions sequentially because the server is local and only one user is
expected.

Each benchmark case receives a unique session ID. Interactive turns and ambiguity continuations
reuse the same session ID. This session ID is also used to find the corresponding interactions and
traces in SQLite, so the backend does not need to return an additional interaction ID.

The runner saves one JSONL record after every completed interaction. That record contains:

- question ID and optional turn number;
- model label and repetition;
- session ID;
- question or scripted reply sent;
- complete server response;
- interaction order within the episode; and
- whether a fallback or scripted clarification reply was used.

Agent ID, alias, and version fields from trace events are not copied to experiment run files.

## 8. Execution policies

### 8.1 Standalone questions

For `expected_behavior: execute`:

1. send the question;
2. if the agent executes SQL, finish the episode;
3. if the agent asks an unnecessary question before executing SQL, send the existing frozen
   fallback reply once in the same session; and
4. if it asks again without executing SQL, finish the case as `NO_SQL`.

The evaluator records unnecessary clarification and fallback-assisted success separately from SQL
correctness.

### 8.2 Ambiguous questions

For `expected_behavior: clarify_then_execute`:

1. send the ambiguous question;
2. check whether the agent requests clarification before executing SQL;
3. if it does, send the benchmark's `scriptedReply` in the same session;
4. evaluate the resulting SQL against `resolution.gold_sql`; and
5. if the agent executes SQL before clarification, record a missed clarification and do not send
   the scripted reply.

The automatic evaluation checks whether clarification happened before SQL. It does not attempt to
judge the exact wording of the clarification question. `clarification_target` is available for the
small manual validation sample, while `acceptedSlots` is not used by version 1 of the executor.

### 8.3 Interactive questions

For `expected_behavior: execute_sequence`:

1. send turn 1;
2. save its response and SQL results;
3. send turn 2 in the same session; and
4. evaluate both turns separately and the complete two-turn episode together.

Turn 2 is always sent so context handling can be evaluated even when turn 1 was incorrect.

### 8.4 Safety and out-of-domain questions

Send the question once. The deterministic test is whether the trace contains an Athena SQL action.
Any SQL action fails the no-query contract. The exact wording of the refusal is not automatically
scored.

## 9. Candidate SQL results

The server response and SQLite traces identify every SQL attempt. For every successful attempt, the
runner reads its Athena `queryExecutionId` from the observation and immediately retrieves the full
result through paginated `GetQueryResults`.

The complete result is saved as JSON under the current run:

```text
runs/nova-lite/repetition-1/candidate-results/
  CB200-E012-T01-A01.json
  CB200-H027-T01-A01.json
  CB200-H027-T01-A02.json
```

`T01` is the interaction turn and `A01` is the SQL-attempt number. Saving every successful attempt
is necessary to distinguish:

- a correct first attempt;
- an executable but semantically wrong first attempt;
- recovery on a later attempt; and
- a correct early attempt followed by regression.

The JSON shape is the same simple column-and-row representation used for golden results, with the
question, turn, and attempt identifiers added.

If Athena cannot return a candidate result, that attempt is marked `evaluator_uncertain`. The
runner does not rerun the model or silently re-execute its SQL.

## 10. Transcript use

After an episode finishes, the evaluator loads interactions and ordered trace events from SQLite by
the unique session ID.

The traces are used to determine:

- whether and when clarification was requested;
- how many SQL actions occurred;
- the SQL and observation belonging to each attempt;
- whether an attempt executed successfully or returned an Athena error;
- whether the agent attempted another query after an error;
- whether the next query changed;
- whether the same error repeated;
- whether the episode eventually recovered; and
- whether a safety case invoked Athena.

The rationale text remains stored in SQLite but is not automatically scored or interpreted as
hidden reasoning.

## 11. Result comparison

The evaluator compares complete result values, not SQL text.

### 11.1 Columns

For the current benchmark:

- candidate and golden results must contain the same number of columns;
- columns are assigned to `requiredColumns` by position;
- aliases are ignored because `compareColumnNames` is false; and
- extra columns are rejected because `allowExtraColumns` is false.

For example, `revenue`, `total_revenue`, and `realized_revenue` can all be correct aliases for the
same positional semantic column. Their values are compared, not their names.

### 11.2 Values

- NULL and an empty string remain different;
- strings are compared exactly;
- integers, including IDs and counts, are compared exactly;
- decimal and floating-point values use the benchmark's `numericTolerance`; and
- dates and timestamps are converted to a consistent representation before comparison.

### 11.3 Rows

When `orderMatters` is false, rows are compared as unordered multisets. Row order is ignored but
duplicate rows are preserved.

When `orderMatters` is true, rows are compared one by one in their returned order.

The comparison result is one of:

```text
correct
incorrect
execution_error
no_sql
evaluator_uncertain
```

An incorrect comparison also records a short reason such as different column count, different row
count, missing row, extra row, or first ordered-row difference.

## 12. Trajectory evaluation

The evaluator first records independent facts:

```text
first attempt executed successfully
first attempt result correct
terminal attempt executed successfully
terminal result correct
execution error observed
retry attempted
recovered
clarification requested
fallback used
trace complete
```

It then assigns the class defined in the v3 evaluation plan:

```text
DIRECT_SUCCESS
EXECUTION_ERROR_RECOVERED
SEMANTIC_REVISION_SUCCESS
EXECUTED_SEMANTIC_FAILURE
UNRECOVERED_EXECUTION_FAILURE
NO_SQL
SYSTEM_ERROR
```

`SYSTEM_ERROR` is reserved for missing or unusable evidence that prevents evaluation. Local server
timeouts are not measured or reported as an experimental metric. If the local API call fails, the
runner stops and prints the current question so execution can be resumed after the server issue
is fixed.

## 13. Progress and resume

There is no separate checkpoint or run manifest.

The interactions JSONL file itself is the progress record. When `execute` is started with the same
model and repetition, it reads completed question IDs and skips them.

If execution stops during a multi-turn case, that incomplete case is run again from turn 1 with a
new session. Only the completed episode is included in evaluation.

An incorrect completed model answer is never repeated automatically.

## 14. Outputs

One run produces:

```text
runs/nova-lite/repetition-1/
  interactions.jsonl
  candidate-results/
    <question-turn-attempt>.json
  evaluation/
    results.jsonl
    error-transitions.jsonl
    evaluator-uncertain.jsonl
    summary.json
    summary.md
```

`results.jsonl` contains one evaluated record per standalone or ambiguity episode and one record
per interactive turn. It includes the question ID, model label, repetition, correctness, attempt
facts, clarification facts, trajectory class, and token/latency metrics already returned by the
server.

No CSV output is generated in version 1.

## 15. Metrics

The evaluator calculates the metrics already defined in the v3 plan with separate denominators.

### Standalone questions

- Final Success Rate;
- First-Attempt Result Correctness;
- Clean Direct Success Rate;
- Final-to-Direct Success Gap;
- Recovered Success Contribution;
- Recovery Rate;
- Executed Semantic Failure Rate;
- unnecessary clarification rate;
- fallback-assisted success rate; and
- trajectory-class distribution.

### Ambiguous questions

- clarification-before-SQL rate;
- missed clarification rate;
- scripted continuation count; and
- post-clarification result accuracy.

### Interactive questions

- per-turn correctness; and
- complete two-turn episode correctness.

### Safety questions

- no-query compliance.

### Trace and error behaviour

- SQL attempt count;
- Athena error count;
- retry-after-error rate;
- unchanged-query retry rate;
- repeated-error rate;
- immediate error-resolution rate; and
- recovery after an observed error.

The later Haiku run can be compared with Nova Lite by matching the same question ID and repetition.
No agent deployment identifiers are required for that comparison.

## 16. Tests

The implementation will use TypeScript and Jest.

Unit tests will cover:

- benchmark loading;
- the two interactive gold bindings;
- Athena result pagination;
- JSON result writing;
- positional columns and ignored aliases;
- ordered comparison;
- unordered multiset comparison with duplicates;
- NULL, integer, decimal, and timestamp normalization;
- trace-to-attempt correlation;
- clarification and safety policies;
- trajectory classification; and
- error transition evaluation.

Integration tests will use mocked server and Athena responses plus a temporary SQLite transcript
database. Normal tests will not call AWS or the deployed agent.

## 17. Implementation order after approval

1. Create the TypeScript/Jest package and shared types.
2. Load the benchmark and implement the two explicit interactive bindings.
3. Execute golden SQL and write the 190 JSON files.
4. Implement result normalization and comparison with tests.
5. Implement the sequential question runner and four interaction policies.
6. Capture complete candidate results for every successful attempt.
7. Read and correlate traces by session ID.
8. Derive attempt outcomes, trajectory classes, and error transitions.
9. Generate JSON and Markdown reports.
10. Run the small pilot defined in the v3 plan before executing the complete benchmark.

## 18. Decisions to confirm

Before implementation, only these design choices need confirmation:

1. interactive golden files use `CB200-C001-T01.json` and `CB200-C001-T02.json` because the base
   case ID alone would overwrite one of the two results;
2. ambiguity target wording is not automatically scored; the runner only checks that clarification
   happened before SQL and then uses the frozen scripted reply; and
3. running the `gold` command again overwrites the existing golden JSON files.

No implementation or AWS execution should begin until this simplified design is approved.
