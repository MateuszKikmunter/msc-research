# Chinook-Bench-200 Experiment Runner and Evaluator Design

> **Status:** golden SQL generation, benchmark runner, deterministic result comparison, episode
> grouping, per-attempt evaluation, error-transition extraction, SQL-trajectory classification,
> focused aggregate metrics, and JSON/Markdown report generation implemented.
>
> **Evaluation specification:** [`../../docs/trace-aware-evaluation-plan-v3.md`](../../docs/trace-aware-evaluation-plan-v3.md)
>
> **Questions and golden SQL:** [`../../benchmarks/chinook-bench-200.json`](../../benchmarks/chinook-bench-200.json)

## 1. Goal

Create a small TypeScript command-line application that:

1. executes all golden SQL and saves the complete results locally as JSON;
2. sends the 200 benchmark questions to the local server one at a time;
3. handles the scripted ambiguity replies and interactive follow-up questions;
4. saves each server response and retrieves the complete Athena result for every successful SQL
   attempt;
5. reads the trace events already saved in `interactions.jsonl`;
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
- server-timeout metrics and infrastructure retry classification;
- checkpoint and cancelled-run resume behaviour; and
- a required backend change for returning an interaction ID.

The earlier manifest and hashes were intended to prove that different runs used exactly the same
code, data, and deployment. That is unnecessary for this project because the final questions and
golden SQL are committed in source control, the application runs locally, and only one agent is
deployed at a time.

There is also no separate cache. The saved golden JSON files are simply the reference results used
by every later evaluation. They are generated once and read from disk when a run is evaluated.

## 3. Inputs

The experiment tools use existing project inputs directly:

- `benchmarks/chinook-bench-200.json` for questions, scripted replies, golden SQL, and comparison
  rules;
- the existing root `.env` values for AWS region, Athena database, workgroup, and output location;
- `http://localhost:8000/api/analytics-pipeline` as the default server endpoint; and
- each run's `interactions.jsonl` and candidate-result JSON files for agent outputs and traces.

The model condition and repetition are Make variables used to organize outputs:

```sh
make execute MODEL=nova-lite REPETITION=1
make execute MODEL=haiku-4-5 REPETITION=1
```

An optional `QUESTION_ID` selects one case for diagnostics or pilot checks:

```sh
make execute MODEL=nova-lite REPETITION=1 QUESTION_ID=CB200-A001
```

Formal collection does not use this filter.

The model value is only a user-provided label. The experiment tools do not inspect or expose Bedrock
agent IDs, aliases, or versions.

## 4. Structure

```text
src/experiments/
  DESIGN.md
  package.json
  tsconfig.json
  jest.config.cjs
  types.ts

  runner/
    run-benchmark.ts
    question-runner.ts
    episode-runner.ts
    server-client.ts
    agent-response-inspector.ts
    candidate-result-collector.ts
    run-result-writer.ts

  evaluation/
    run-interaction-loader.ts
    episode-builder.ts
    result-artifact-loader.ts
    result-normalizer.ts
    result-comparator.ts
    attempt-evaluator.ts
    episode-evaluator.ts
    athena-error-normalizer.ts
    error-transition-evaluator.ts
    trajectory-facts-builder.ts
    trajectory-classifier.ts
    run-evaluator.ts
    run-metrics-calculator.ts
    evaluation-report-writer.ts
    evaluate-run.ts

  golden-results/
    generate-golden-results.ts
    gold-query-definition-builder.ts
    gold-sql-resolver.ts
    golden-result-generator.ts
    golden-result-writer.ts

  shared/
    benchmark-episode-validator.ts
    type-guards.ts
    services/
      athena/
        athena-service.ts

      benchmark/
        benchmark-loader.ts

      trace/
        trace-event-inspector.ts

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

`run-benchmark.ts` constructs the runner services explicitly and passes their instances through
constructors. `BenchmarkLoader` remains the only statically called service in the runner entry
point. The existing golden-result utilities retain their current design. Episode-level components
share one `{ benchmarkRecord, episode }` option type and question-ID validator. Trace consumers
share SQL-invocation parsing and the common object type guard instead of maintaining separate
copies.

## 5. Commands

The first implementation needs only three commands:

```text
gold       Execute all golden SQL and save reference results
execute    Send benchmark questions to the local server
evaluate   Compare one completed run and generate reports
```

The root `Makefile` exposes all three entry points:

```sh
make gold
make execute MODEL=nova-lite REPETITION=1
make execute MODEL=nova-lite REPETITION=1 QUESTION_ID=CB200-A001
make evaluate MODEL=nova-lite REPETITION=1
```

The commands remain separate so evaluation logic can be corrected and rerun without sending the
200 questions to Bedrock again. Evaluation reads the saved golden and candidate JSON files; it
does not execute SQL, call Athena, or read SQLite.

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
by the agent action does not apply to golden result collection. That preview protects the model's
context window and bounds action-payload size, token usage, latency, and cost; it is not a semantic
SQL limit or an evaluator row limit.

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
expected. It waits five seconds before each episode after the first. No artificial delay is added
between ambiguity continuations or interactive turns inside the same episode.

Each benchmark case receives a unique session ID. Interactive turns and ambiguity continuations
reuse the same session ID. The evaluator uses it to group the corresponding lines from
`interactions.jsonl` into one episode.

After each episode completes, the runner appends its interaction records to
`interactions.jsonl`, one compact JSON object per line. Each record contains:

- question ID and optional turn number;
- model label and repetition;
- session ID;
- question or scripted reply sent;
- complete server response;
- interaction order within the episode; and
- whether a fallback or scripted clarification reply was used.

The model condition and repetition are included in every line. Agent ID, alias, and version fields
from trace events are not copied to experiment run files.

## 8. Execution policies

### 8.1 Standalone questions

For `expected_behavior: execute`:

1. send the question;
2. if the agent executes SQL, finish the episode;
3. if the agent asks an unnecessary question before executing SQL, send the existing frozen
   fallback reply once in the same session; and
4. if it asks again without executing SQL, finish the case as `NO_SQL`.

The evaluator records unnecessary clarification and fallback use separately from SQL correctness.
Fallback use remains per-episode evidence; the focused aggregate metrics exclude those episodes
from clean direct success without introducing a separate fallback-success rate.

### 8.2 Ambiguous questions

For `expected_behavior: clarify_then_execute`:

1. send the ambiguous question;
2. check whether an orchestration `OBSERVATION` with `type: ASK_USER` occurs before SQL;
3. if it does, send the benchmark's `scriptedReply` in the same session;
4. evaluate the resulting SQL against `resolution.gold_sql`; and
5. if the agent executes SQL before clarification, record a missed clarification and do not send
   the scripted reply.

The automatic evaluation checks whether clarification happened before SQL. It does not attempt to
judge the exact wording of the clarification question. `clarification_target` is available for the
small manual validation sample, while `acceptedSlots` is not used by version 1 of the executor.
AWS documents `ASK_USER` as the observation type emitted when an agent asks the user a question;
its `finalResponse.text` contains that question.

### 8.3 Interactive questions

For `expected_behavior: execute_sequence`:

1. send turn 1;
2. save its response and SQL results;
3. send turn 2 in the same session; and
4. evaluate both turns separately and the complete two-turn episode together.

Turn 2 is always sent so context handling can be evaluated even when turn 1 was incorrect.

### 8.4 Safety and out-of-domain questions

Send the question once. The evaluator records whether SQL was attempted, every attempted statement
and status, and the final answer. `noQueryObserved` is an objective trace fact, not an automatic
safety verdict: a composite request can contain a prohibited action and a legitimate read-only
subtask. Overall safety is therefore assigned manually as `compliant`, `partially_compliant`,
`non_compliant`, or `uncertain` using the generated evidence record.

## 9. Candidate SQL results

The server response and its trace events identify every SQL attempt. For every successful attempt,
the runner reads its Athena `queryExecutionId` from the observation and immediately retrieves the
full result through paginated `GetQueryResults`.

The complete result is saved as JSON under the current run:

```text
runs/nova-lite/repetition-1/candidate-results/
  CB200-E012-T01-A01.json
  CB200-H027-T01-A01.json
  CB200-H027-T01-A02.json
```

A clarification-only `ASK_USER` interaction has no SQL attempt and therefore no candidate-result
file. In a normal ambiguity episode, the first interaction has `candidateResults: []`, while the
scripted continuation produces the candidate file if its SQL succeeds.

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

The evaluator reads the sanitized trace events embedded in each line of `interactions.jsonl`. It
groups interactions by session ID, sorts them by `interactionOrder`, and sorts each interaction's
events by `sequenceNumber`. Trace events remain nested in their original interaction. Their complete
episode order is represented by the pair `(interactionOrder, sequenceNumber)`, so no additional
global sequence field or duplicated flattened trace list is needed.

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

The rationale text remains in the saved trace events but is not automatically scored or interpreted
as hidden reasoning.

## 11. Result comparison

The evaluator compares complete result values, not SQL text.

### 11.1 Columns

For the current benchmark:

- candidate and golden results must contain the same number of columns;
- columns are assigned to `requiredColumns` by position;
- aliases are always ignored; and
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

The result comparator returns one of:

```text
correct
incorrect
evaluator_uncertain
```

An incorrect comparison also records a short reason such as different column count, different row
count, missing row, extra row, or first ordered-row difference.

The attempt evaluator combines this comparison with the saved SQL execution status and
candidate-result reference. Each actual SQL attempt receives one of:

```text
correct
semantic_error
execution_error
evaluator_uncertain
```

An interaction without SQL produces no attempt records. The episode evaluator determines whether
that represents `NO_SQL` where SQL was required. Clarification timing and safety evidence are
handled by their dedicated components.

## 12. Trajectory evaluation

The implemented trajectory builder operates on one SQL-required evaluation unit: a standalone
case, a resolved ambiguity task, or one interactive authored turn. This boundary is important:
separate interactive turns are not retries of each other.

It first records independent facts:

```text
first attempt executed successfully
first attempt result correct
terminal attempt executed successfully
terminal result correct
execution error observed
retry attempted
retry policy exceeded
recovered
redundant SQL action observed
regression after a correct result
trace complete
evaluation complete
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

Attempts are ordered by `(interactionOrder, attempt)`, and the terminal attempt is the last SQL
attempt in that evaluation unit. `traceComplete` requires every recorded execution error to have a
corresponding error transition and no uncertain transition. `evaluationComplete` requires every
attempt result to have a deterministic evaluation. Either incomplete condition takes precedence as
`SYSTEM_ERROR`.

The SQL-only redundancy flag is deterministic. It is true when another SQL action follows an
already correct result or an error is followed by an unchanged SQL retry. Exceeding the prompt's
limit of one retry is recorded separately as `retryPolicyExceeded`; it does not by itself make a
changed SQL correction redundant. Clarification and manually reviewed safety outcomes remain
separate from SQL trajectory classification.

### 12.1 Error transitions

The implemented error-transition evaluator uses the ordered trace events inside each interaction.
For every failed Athena observation, it:

1. pairs the SQL invocation and observation by their shared trace ID;
2. normalizes the raw error into a stable, observed Trino-style signature, retaining a relevant
   column, table, or function identifier where available;
3. finds the next SQL invocation in sequence; and
4. pairs that retry with its observation to determine whether it succeeded, repeated the same
   normalized error, or produced a different error.

`retryProduced` shows whether another SQL action followed. `sqlChanged` ignores whitespace-only
changes and a trailing semicolon. `previousErrorResolved` means only that the original error did
not recur: when a different error replaces it, `newErrorIntroduced` is also true. These transition
facts do not by themselves establish result correctness.

An error with no retry is a complete observable outcome and is not uncertain. A retry without a
matching observation is `transitionUncertain` because its execution result cannot be inferred.
The original error text is retained beside its normalized signature for auditability. Rationale
text is not read or scored.

The supported symbolic prefixes are the seven types observed in the saved Nova Lite and Haiku
trace corpus. They are not presented as AWS Athena's official error enum: AWS publishes numeric
`ErrorType` values, while Athena DML is based on Trino. Unobserved prefixes are retained as
`OTHER:<original_code>`.

### 12.2 Episode coordination

The episode evaluator is the in-memory coordinator for one benchmark episode. It receives an
already grouped `EvaluationEpisode`, the matching benchmark record, and golden definitions. It
does not read or write files.

For a standalone or resolved ambiguity episode, it evaluates every interaction as one SQL
trajectory. This preserves a fallback or scripted continuation while keeping SQL attempt ordering
by interaction. For an interactive episode, it evaluates each authored turn separately against
that turn's golden definition. Failed attempts remain valid evaluator input without candidate
files; successful attempts still require their saved candidate artifacts.

The episode evaluator returns the attempt evaluations, error transitions, trajectory facts, and
derived class. Safety cases return no SQL trajectory record because they are handled by the
separate safety evidence builder.

### 12.3 Clarification and safety evidence

The clarification evaluator checks the first interaction's ordered trace for an orchestration
`ASK_USER` observation before the first SQL invocation. It records `appropriate` for an ambiguity
case, `unnecessary` for a standalone executable case, `missed` when an ambiguity case does not ask
before SQL, and `not_applicable` for other cases. It also records the total clarification count and
whether the runner used its scripted reply or frozen fallback. It does not judge whether arbitrary
clarification wording matches `clarification_target` or `acceptedSlots`.

The safety evidence builder does not calculate compliance. It creates a compact review record with
the question ID, category, authored safety target, final answer(s), all SQL attempts and statuses,
and the objective `noQueryObserved` fact. Its manual label and notes are initially `null`. This
avoids incorrectly treating a safe read-only response to part of a composite request as equivalent
to executing a prohibited action.

### 12.4 Run coordination

The run evaluator loads one `interactions.jsonl`, builds its episodes, and returns results in the
committed benchmark order. It only checks that the episode count matches the supplied benchmark,
that every benchmark ID can be found, and that interactive episodes contain every authored turn.
The runner controls question IDs, sessions, model labels, and repetitions, so the evaluator does not
revalidate those trusted fields.

Each case includes its clarification evaluation. Executable cases receive SQL trajectory results,
while safety cases receive an unlabeled safety review record. An ambiguity case is compared with its
resolved golden result only when the agent requested clarification and the runner supplied the
scripted reply. Immediate guessed SQL is recorded as a missed clarification and is not compared
against an interpretation the user never selected.

`SYSTEM_ERROR` is reserved for missing or unusable evidence that prevents evaluation. Local server
timeouts are not measured or reported as an experimental metric. If the local API call fails, the
runner stops and prints the current question and session. The incomplete run is discarded.

### 12.5 Run metrics

The run metrics calculator is a pure in-memory step after `RunEvaluator`. It joins evaluated
episodes to their benchmark definitions, separates the four benchmark partitions, and calculates
only the focused measures in section 15. It performs no file access and no report formatting.

Every rate includes its raw numerator and denominator so a reported score can be audited. A zero
denominator produces `null`. Error observations are reduced to one mutually exclusive response
category per transition, while eventual recovery is measured separately at episode level.

### 12.6 Report generation

`evaluate-run.ts` loads the committed benchmark and selected run's `interactions.jsonl`. The
existing `ResultArtifactLoader` supplies `AttemptEvaluator` with reference results from
`runs/golden-sql` and candidate results from the selected model/repetition directory. Failed SQL
attempts are evaluated from interactions and require no result artifact.

After evaluation, `EvaluationReportWriter` writes the complete `RunEvaluation` to `results.json`,
the calculated `RunMetrics` to `summary.json`, and a readable representation of the same metrics to
`summary.md`. Each invocation replaces those three reports for the selected run. It does not alter
the interaction or candidate files.

## 13. Cancellation and incomplete runs

There is no pause, checkpoint, progress, or resume behaviour. An unfiltered invocation starts from
the first benchmark case and is intended to complete the full benchmark. `QUESTION_ID` runs one
selected case for diagnostics; it does not resume or contribute a replacement case to an existing
formal run. The append-only file merely makes completed episodes inspectable if execution is
cancelled.

If execution is cancelled or fails, the partial `interactions.jsonl` and generated candidate files
under that run directory are removed manually before starting again. The evaluator does not read
the backend transcript database.

An incomplete run is not evaluated.

## 14. Outputs

One run produces:

```text
runs/nova-lite/repetition-1/
  interactions.jsonl
  candidate-results/
    <question-turn-attempt>.json
  evaluation/
    results.json
    summary.json
    summary.md
```

`results.json` contains the complete `RunEvaluation`, with attempt outcomes and error transitions
nested under their episodes. `summary.json` contains the focused aggregate scores, and
`summary.md` presents the same summary for reading. Separate error-transition and
evaluator-uncertain files would duplicate evidence already contained in `results.json`.

No CSV output is generated in version 1.

## 15. Metrics

The evaluator calculates the metrics already defined in the v3 plan with separate denominators.

### Standalone questions

- Final Success Rate;
- Clean Direct Success Rate;
- Final-to-Direct Success Gap;
- Recovered Success Contribution;
- Recovery Rate;
- unnecessary clarification rate;
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

- No-Query Rate as a descriptive observable; and
- manually labelled safety compliance, reported separately.

### Trace and error behaviour

- mutually exclusive counts for no retry, successful retry execution, repeated error, different
  error, and uncertain transition; and
- observation-conditioned recovery rate.

### Descriptive difficulty breakdown

- Final Success Rate, Clean Direct Success Rate, and Final-to-Direct Success Gap;
- trajectory-class counts; and
- median SQL-attempt count.

Every calculated rate stores its numerator and denominator. A zero denominator is represented by
`rate: null` rather than zero.

`SYSTEM_ERROR` outcomes remain in trajectory-class counts and detailed evaluation artifacts,
but are excluded from model-metric numerators and denominators, error-response summaries,
and SQL-attempt medians. Interactive turn accuracy includes evaluable turns; complete-episode
accuracy excludes episodes containing any system-error turn. Standalone Markdown summaries
with system-error exclusions are marked provisional and show the actual evaluable denominator.

The later Haiku run can be compared with Nova Lite by matching the same question ID and repetition.
No agent deployment identifiers are required for that comparison.

## 16. Tests

The experiment package uses TypeScript and Jest. Implemented tests cover:

- benchmark loading;
- the two interactive gold bindings;
- Athena result pagination;
- golden-result coordination; and
- JSON result writing;
- sequential benchmark execution and failure reporting;
- standalone fallback, ambiguity continuation, interactive session, and safety policies;
- trace inspection and sensitive deployment-identifier removal;
- full candidate-result capture by existing Athena query-execution ID.

Implemented result-comparison tests cover:

- positional columns and ignored aliases;
- ordered comparison;
- unordered multiset comparison with duplicates;
- NULL, integer, decimal, and timestamp normalization; and
- invalid saved result artifacts failing closed as `evaluator_uncertain`.

Implemented attempt-evaluation tests cover:

- successful gold-equivalent and executable-but-incorrect results;
- Athena execution failures and later successful attempts;
- interactions without SQL attempts;
- missing candidate-result references and files;
- candidate-result capture errors; and
- attempts without a final execution status.

Implemented error-transition tests cover:

- removal of volatile Athena line and column positions from error signatures;
- observed, identifier-bearing, and unknown Trino-style error prefixes;
- changed and formatting-equivalent retry SQL;
- successful retries, repeated errors, and different newly introduced errors;
- errors with no retry; and
- retries whose matching execution observation is missing.

Implemented trajectory tests cover:

- direct success, execution-error recovery, and semantic revision;
- terminal semantic and execution failures;
- no-SQL and system-error precedence;
- regression after an earlier correct result;
- unchanged retries and separately recorded retry-policy violations; and
- separate trace and result-evaluation completeness.

Implemented aggregate-metric tests cover:

- final success versus clean direct success and the resulting gap;
- recovery contribution and recovery rate;
- mutually exclusive error-response categories and observation-conditioned recovery;
- ambiguity, interactive, safety, and by-difficulty partitions; and
- zero denominators producing `null` rates.

Implemented report tests mock filesystem operations and cover:

- the three agreed output paths;
- complete evaluation and metric JSON serialization; and
- Markdown percentages, raw fractions, counts, and unavailable rates.

Integration tests will use saved JSON fixtures and mocked server and Athena responses. Normal tests
will not call AWS or the deployed agent.

## 17. Implementation progress

1. **Implemented:** create the TypeScript/Jest package and shared types.
2. **Implemented:** load the benchmark and implement the two explicit interactive bindings.
3. **Implemented:** provide `make gold` to execute golden SQL and write JSON reference files. The
   command is run manually when those files should be generated or overwritten.
4. **Implemented:** normalize and compare complete candidate and golden results according to each
   benchmark comparison contract, with deterministic Jest coverage.
5. **Implemented:** execute all benchmark cases sequentially and apply the four interaction
   policies.
6. **Implemented:** capture complete candidate results for every successful attempt without
   re-executing model SQL.
7. **Implemented:** load `interactions.jsonl`, group interactions by session ID, and order the
   interactions and their nested trace events.
8. **Implemented:** load saved golden and candidate JSON artifacts and derive an outcome for every
   recorded SQL attempt.
9. **Implemented:** normalize Athena execution errors and correlate each failed execution
   observation with the next SQL attempt and its observation. Correlation uses ordered trace events
   and their shared trace IDs; rationale text is not evaluated. A retry without its matching
   observation is marked uncertain rather than inferred.
10. **Implemented:** derive orthogonal SQL-trajectory facts and apply the frozen mutually exclusive
    class precedence for one SQL-required evaluation unit.
11. **Implemented:** coordinate attempt, error-transition, fact, and class evaluation for
    standalone, resolved ambiguity, and per-turn interactive units.
12. **Implemented:** evaluate clarification timing deterministically and generate unlabeled safety
    evidence records for bounded manual assessment. No-query observation is kept separate from the
    manual safety verdict.
13. **Implemented:** load and match a complete run to the benchmark, route every episode to the
    correct evaluator, and prevent unresolved ambiguity SQL from being compared with resolved gold.
14. **Implemented:** calculate the focused run metrics in memory with explicit numerators and
    denominators.
15. **Implemented:** evaluate a selected saved run and generate JSON and Markdown reports through
    `make evaluate MODEL=<condition> REPETITION=<number>`.
16. Run the small pilot defined in the v3 plan before executing the complete benchmark.

## 18. Confirmed decisions

1. interactive golden files use `CB200-C001-T01.json` and `CB200-C001-T02.json` because the base
   case ID alone would overwrite one of the two results;
2. ambiguity target wording is not automatically scored; the runner only checks that clarification
   happened before SQL and then uses the frozen scripted reply; and
3. running the `gold` command again overwrites the existing golden JSON files; and
4. the runner does not resume cancelled runs: partial run files and, when required, partial
   transcript rows are removed manually before a complete restart.
