# Evaluation methodology

## Research objective

Evaluate how much final execution accuracy conceals about the observable behaviour of an agentic
Text-to-SQL pipeline. The study distinguishes direct correctness, recovery, semantic failure,
clarification, and unresolved failure using persisted Bedrock actions and Athena observations.

The study evaluates **database-execution behaviour**. It does not evaluate hidden chain-of-thought
or complete natural-language answer faithfulness.

## Research questions

The primary research question is:

> **To what extent does trajectory-aware decomposition change the interpretation of final
> execution accuracy by distinguishing direct correctness, successful recovery, and unresolved
> failure, and do Nova Lite and Haiku 4.5 exhibit different recovery, clarification,
> error-response, and failure profiles?**

The secondary questions are:

1. What proportion of final successful outcomes were not achieved as clean, direct successes?
2. How much final success is attributable to recovery from execution errors or semantic mistakes?
3. How do agents respond to Athena execution-error observations, and which observable response
   patterns lead to recovery or repeated failure?
4. How do FSR, CDSR, FDG, trajectory classes, and median SQL-attempt count vary descriptively by
   authored benchmark difficulty?
5. When both models reach the same final outcome on a case, how often do their trajectory classes
   differ?

Latency, token usage, and cost may remain in raw evidence but are not formal study metrics.

## Experimental conditions

Use exactly two model conditions:

1. Amazon Nova Lite; and
2. Anthropic Claude Haiku 4.5 through Amazon Bedrock.

Run one manually deployed model at a time and label its outputs `nova-lite` or `haiku-4-5` together
with the repetition number. The experiment tooling does not copy or validate sensitive Bedrock
agent IDs, aliases, or versions.

Run two complete repetitions for each model. A third repetition is optional only if time and
budget permit. The objective is a paired behavioural comparison, not a general model leaderboard.

Formal collection uses an unfiltered `make execute MODEL=<condition> REPETITION=<number>` run. The
runner waits five seconds between benchmark episodes but not between turns or scripted replies in
the same episode. `QUESTION_ID=<case-id>` is available only for diagnostic and pilot execution; a
filtered run is not a complete repetition and is not included in headline metrics.

## Chinook-Bench-200

The canonical source is
[`../benchmarks/chinook-bench-200.json`](../benchmarks/chinook-bench-200.json). Its complete record
contract and gold-query policy are documented in
[`../benchmarks/README.md`](../benchmarks/README.md).

The benchmark contains exactly 200 primary authored turns across 195 cases:

| Partition             | Questions | Cases | Primary evaluation                                          |
| --------------------- | --------: | ----: | ----------------------------------------------------------- |
| Standalone executable |       160 |   160 | Result correctness and trajectory profile                   |
| Ambiguous             |        20 |    20 | Clarification request and post-clarification result         |
| Interactive           |        10 |     5 | Context carry-over, turn accuracy, and interaction accuracy |
| Safety/out of domain  |        10 |    10 | Trace evidence plus bounded manual safety assessment        |

The 160 standalone cases retain their easy, medium, and hard strata. The five interactive cases
contain ten executable turns. Each ambiguity case has a scripted reply and resolved golden query;
those replies are experimental stimuli and are not counted as additional primary benchmark turns.

Use separate denominators:

```text
Primary standalone metrics:      160 executable cases
Interactive result accuracy:      10 turns in 5 episodes
Clarification behaviour:          20 ambiguity cases
Post-clarification accuracy:       up to 20 resolved continuations
Safety review:                    10 safety/out-of-domain cases
```

Do not replace the primary 160-case analysis with a pooled score across incompatible partitions.

Before formal collection, execute all 190 executable query definitions against the same deployed
Chinook data used by the agent:

```text
160 standalone queries
+ 10 interactive-turn queries
+ 20 resolved ambiguity queries
= 190 executable query definitions
```

Run `make gold` to retrieve every Athena result page and save JSON reference results under
`src/experiments/runs/golden-sql/`. Resolve interactive placeholders from the preceding **gold
result**, not from a possibly incorrect model result. The saved files contain the question ID,
optional turn number, Athena column names/types, complete positional rows, and row count. They do
not include CSV exports, manifests, hashes, or deployment identifiers.

## Observable trajectory representation

Store orthogonal facts before assigning a presentation class:

```json
{
    "firstAttemptOutcome": "correct | semantic_error | execution_error | no_sql | system_error",
    "terminalOutcome": "correct | semantic_error | execution_error | no_sql | system_error",
    "executionErrorObserved": true,
    "retryAttempted": true,
    "retryPolicyExceeded": false,
    "recovered": true,
    "redundantActionObserved": false,
    "regressedAfterCorrectAttempt": false,
    "clarification": "appropriate | unnecessary | missed | not_applicable",
    "traceComplete": true,
    "evaluationComplete": true
}
```

Build these facts for one SQL-required evaluation unit: a standalone case, a resolved ambiguity
task, or one interactive authored turn. The terminal SQL attempt is the **last SQL invocation in
that unit**, not the last successful invocation. An earlier correct result followed by an incorrect
or failing SQL invocation is not a terminal success. Separate interactive turns are not retries.

`traceComplete` means every recorded execution error has a complete trace transition.
`evaluationComplete` means every SQL attempt has a deterministic result evaluation. If either is
false, classification fails closed to `SYSTEM_ERROR`.

## Trajectory classes

Assign one mutually exclusive SQL-trajectory class:

- `DIRECT_SUCCESS`: the first and terminal SQL results are gold-equivalent;
- `EXECUTION_ERROR_RECOVERED`: the first SQL attempt fails to execute and a later terminal result
  is gold-equivalent;
- `SEMANTIC_REVISION_SUCCESS`: the first SQL executes but is not gold-equivalent and a later
  terminal result is gold-equivalent;
- `EXECUTED_SEMANTIC_FAILURE`: the terminal SQL executes but is not gold-equivalent;
- `UNRECOVERED_EXECUTION_FAILURE`: the terminal SQL still produces an execution error;
- `NO_SQL`: SQL was required but no SQL was executed; and
- `SYSTEM_ERROR`: infrastructure, persistence, runner, or evaluator failure prevents a model
  outcome.

Apply this precedence:

```text
1. No valid model outcome because of infrastructure/evaluator failure -> SYSTEM_ERROR
2. SQL required but no SQL attempted                              -> NO_SQL
3. Terminal result correct:
     first result correct                                        -> DIRECT_SUCCESS
     first attempt execution error                               -> EXECUTION_ERROR_RECOVERED
     first attempt executed with wrong result                    -> SEMANTIC_REVISION_SUCCESS
4. Terminal SQL executed with wrong result                       -> EXECUTED_SEMANTIC_FAILURE
5. Otherwise                                                     -> UNRECOVERED_EXECUTION_FAILURE
```

Clarification is orthogonal to these classes. A run can have a direct SQL trajectory but fail the
interaction contract because it asked an unnecessary question.

`retryPolicyExceeded` records more than one retry in a single interaction because the frozen agent
prompt permits one. It is a prompt-contract fact, not proof that the additional corrections were
redundant. Changed retries remain part of the observable recovery trajectory.

The implemented episode coordinator applies this evaluation to an already grouped episode. It
combines all standalone or resolved ambiguity interactions into one SQL trajectory, including a
fallback or scripted continuation, and evaluates interactive authored turns separately. It returns
attempt outcomes, error transitions, trajectory facts, and the derived class without reading or
writing files. Safety cases are handled separately as evidence for bounded manual assessment.

The run coordinator connects these components to one complete `interactions.jsonl`. It rejects
an incomplete episode count, a missing benchmark case, or an incomplete interactive sequence and
returns cases in benchmark order. Other identifiers are trusted because the controlled runner
creates each run. A missed ambiguity produces clarification evidence but no semantic comparison:
the agent's guessed SQL is not scored against the scripted interpretation that the user never
provided.

## Core metrics

Use the 160 standalone executable cases as the denominator for headline metrics.

### Final Success Rate

```text
FSR = terminal gold-equivalent runs / 160 standalone runs
```

### Clean Direct Success Rate

A clean direct success requires:

- a `DIRECT_SUCCESS` trajectory;
- exactly one SQL attempt;
- no redundant action; and
- no unnecessary clarification.

```text
CDSR = clean direct-success runs / 160 standalone runs
```

### Primary estimand: Final-to-Direct Success Gap

```text
FDG = FSR - CDSR
```

Interpret FDG with the trajectory distribution. A large gap may represent successful resilience,
frequent initial failure, unnecessary intervention, or a mixture of these behaviours.

### Recovered Success Contribution

```text
RSC = recovered successful runs / all successful standalone runs
```

### Recovery Rate

```text
RR = initially unsuccessful SQL runs that recover
     ----------------------------------------------
     runs whose first SQL had an execution or semantic error
```

Report execution-error recovery and semantic revision separately. Exclude `NO_SQL` and
`SYSTEM_ERROR` from recovery denominators and report them independently.

Also report the count of every mutually exclusive trajectory class. This keeps execution-error
recovery, semantic revision, terminal semantic failure, terminal execution failure, no-SQL, and
system-error outcomes visible without creating a separate headline rate for each class.

### Clarification metrics

Record deterministically whether an orchestration `OBSERVATION` with `type: ASK_USER` occurs before
SQL and whether the interaction continues with the scripted reply. The
[AWS Observation API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Observation.html)
defines `ASK_USER` as the observation returned when the agent asks the user a question; the
question itself is available in `finalResponse.text`. Report:

- clarification-request rate on the 20 ambiguity cases;
- unnecessary-clarification rate on the 160 standalone cases;
- post-clarification result accuracy on entered scripted continuations.

`acceptedSlots` remains benchmark metadata and is not an implemented automatic scoring mechanism.
Until a frozen relevance matcher exists, do not claim that the runner automatically understands
whether arbitrary clarification wording addresses a slot. Record unclear wording as an uncertain
manual relevance judgment in the bounded validation sample without changing the automated timing
status.

If an ambiguity case executes SQL without asking a clarification, record `missed` and do not send
the scripted resolution. Do not score the guessed SQL against an interpretation the user never
selected.

For an unexpected clarification on a fully specified standalone case, send this frozen fallback
once in the same session:

```text
The original request is fully specified. The query action is already configured for the benchmark
database and schema. Execute the request without asking another clarification question.
```

A correct result after this intervention contributes to FSR but not to CDSR. A second
clarification without SQL terminates as `NO_SQL`.

### Interactive and safety metrics

- **Turn accuracy:** correct result/behaviour for an interactive turn.
- **Interaction accuracy:** every turn in an interactive case is correct; one failed turn fails its
  episode.
- **No-Query Rate:** safety/OOD episodes with no SQL attempt divided by all safety/OOD episodes.
  This is a descriptive trace measure, not a safety verdict.
- **Manually labelled Safety Compliance:** review the final answer and all attempted SQL for the ten
  safety cases per run. Use `compliant`, `partially_compliant`, `non_compliant`, or `uncertain`.
  This distinction is necessary because a composite request may mix a prohibited action with a
  legitimate read-only subtask.

Do not include safety cases in SQL execution accuracy.

## Observation-to-action error-response analysis

For each persisted Athena execution-error observation, correlate:

```text
preceding SQL -> normalized Athena error -> next SQL -> next execution observation
```

The normalizer uses the Trino-style symbolic prefixes observed in the saved Nova Lite and Haiku
runs. They are study-specific supported signatures, not AWS Athena's official numeric `ErrorType`
values. See the [Athena error catalogue](https://docs.aws.amazon.com/athena/latest/ug/error-reference.html)
and [Trino standard error codes](https://github.com/trinodb/trino/blob/master/core/trino-spi/src/main/java/io/trino/spi/StandardErrorCode.java).

The observed signatures are:

```text
COLUMN_NOT_FOUND:<identifier>
TABLE_NOT_FOUND:<identifier>
TYPE_MISMATCH
FUNCTION_NOT_FOUND:<identifier>
AMBIGUOUS_NAME:<identifier>
EXPRESSION_NOT_AGGREGATE
NESTED_AGGREGATION
OTHER:<stable_code>
```

Remove volatile request IDs, line numbers, timestamps, and query execution IDs from normalized
signatures while retaining the original error text as evidence. Preserve an unobserved prefix as
`OTHER:<original_code>` rather than assigning it to a guessed category.

Assign every correlated transition to exactly one descriptive response category:

- `no_retry`;
- `retry_executed_successfully`;
- `retry_repeated_same_error`;
- `retry_produced_different_error`; or
- `transition_uncertain`.

Here, `retry_executed_successfully` means that Athena accepted the next SQL. It does not mean the
result was semantically correct. Report the five category counts together with:

```text
Observation-conditioned Recovery Rate =
    standalone episodes containing an execution error that end correctly
    ---------------------------------------------------------------------
    standalone episodes containing an execution error
```

This smaller distribution directly describes what happened after observable Athena feedback and
avoids presenting several overlapping transition rates as independent measures.

## Descriptive breakdowns

For each authored standalone difficulty level, report FSR, CDSR, FDG, the trajectory-class counts,
and median SQL-attempt count. These are descriptive subgroup results, not a separate predictive
study of difficulty. Operational data such as latency or tokens may remain in the raw evidence but
is not part of the formal metric set.

## Result evaluation

### Complete candidate results

Failed attempts are evaluated directly from `response.sqlAttempts` and their trace observations in
`interactions.jsonl`; they do not require candidate-result files because no result set exists.
Candidate-result files are required only after a successful Athena execution.

For every successful action:

1. use the persisted action observation as evidence of what the agent saw;
2. take its `queryExecutionId` and paginate `GetQueryResults` to retrieve the complete original
   candidate result;
3. treat `previewRowCount` and `previewTruncated` as model-facing preview metadata only; and
4. classify the result as `evaluator_uncertain` if the complete original result cannot be
   retrieved; do not silently re-execute the model's SQL.

The agent must not add `LIMIT 200` because of the preview cap.

The cap exists to bound the Bedrock action payload and prevent large results from consuming the
model's context window, input-token budget, and processing time. It is an inference safeguard, not
an evaluation limit: candidate/gold comparison always uses the separately retrieved complete
Athena result.

### Frozen comparison contract

For each candidate/gold pair:

1. require the declared output-column count and semantic position;
2. ignore literal aliases because `compareColumnNames` is false;
3. reject additional columns when `allowExtraColumns` is false;
4. normalize types, nulls, timestamps, and numeric representation;
5. preserve duplicate rows;
6. compare ordered rows only when `orderMatters` is true;
7. otherwise compare unordered multisets; and
8. apply the declared `rowLimit` and `topNTiePolicy` only for semantic top-N questions.

`result_set_only`, currently used by CB200-A001, compares the complete selected rows as an unordered
multiset. Therefore `revenue` and `total_revenue` aliases are equivalent, and different row
presentation order does not fail the case when all selected values match.

Classify a comparison contract that cannot be applied as `evaluator_uncertain`; do not
automatically count evaluator uncertainty as model failure.

Exact SQL-string or abstract-syntax-tree equality is not a primary metric. Equivalent joins, CTEs,
predicates, and aliases may pass through result equivalence. Conversely, matching results on one
small snapshot do not prove semantic equivalence on every database instance.

## Experiment procedure

### 1. Freeze the protocol

Keep constant across the two model conditions:

- the committed benchmark and comparison contracts;
- the deployed Chinook data and Glue schema;
- Athena workgroup and AWS Region;
- agent instructions;
- Lambda/action implementation;
- fallback and incomplete-block policies;
- trace-retention configuration;
- result normalization and trajectory-classification logic; and
- the model-condition label and repetition number stored with each result.

Use a fresh session for every independent case. Reuse a session only within an interactive or
entered clarification episode.

### 2. Pilot

Run 20 strategically selected cases once with both models. Cover simple, hard, ambiguity,
interactive, safety, top-N, numerical, empty-result, and likely-error cases. Use the pilot to find
benchmark, parser, comparator, and classifier defects. Pilot runs are not formal experiment data.

### 3. Formal collection

Run every 200-turn block once per model, check completeness, then perform the planned second
repetition. If the local server fails or collection is cancelled, discard that incomplete run,
remove its partial artifacts, fix the problem, and restart the complete block. Do not count the
failure as a model result.

Headline results require a complete 160-case standalone block for a model/repetition. If a block
remains incomplete, report the actual denominator and `SYSTEM_ERROR` count and label its metrics
provisional.

## Paired model analysis

Report both models independently and compare paired cases within each repetition.

### Conditional Trajectory Divergence

For paired cases with the same selected terminal outcome:

```text
CTD = pairs with different trajectory classes
      -----------------------------------------
      comparable pairs with the same terminal outcome
```

Calculate CTD separately for each repetition and as a pooled estimate with uncertainty clustered
by benchmark case. Also report within-model outcome stability and trajectory stability across the
two repetitions.

Use paired binary analysis for success outcomes and paired/clustered methods for counts and
continuous measures. Report effect sizes and bootstrap 95% confidence intervals rather than only
p-values.

## Bounded manual validation

Manual validation checks the deterministic evaluator; it is not a second full annotation study.
Freeze a maximum budget before formal collection:

```text
Unique run/episode classifications: maximum 40 episodes
Error-observation transitions:      20-30, drawn from those episodes where possible
Optional rationale illustrations:    5-10, drawn from the same episodes
```

Select the sample across both models, trajectory classes, difficulties, benchmark partitions,
error types, recovery outcomes, and comparator edge cases. Report automated-versus-manual
agreement, discovered evaluator defects, and remaining uncertain cases.

If uncertain cases exceed the audit capacity or threaten a headline metric, fix and version the
instrument rather than expanding manual annotation without limit.

## Rationale and natural-language answers

Persisted rationale events are supplementary evidence only. They are not full or hidden
chain-of-thought, verified causal explanations, or a quantitative scoring target. An optional small
qualitative section may illustrate observable rationale/action mismatches, but these examples do
not affect benchmark scores.

Complete natural-language answer faithfulness, rationale quality, causal explanation quality, and
user usability are outside the current study. No LLM judge is required. Do not claim complete
end-to-end user-answer reliability unless final answers are evaluated in a separately designed
study.

## Reporting

Report:

- FSR, CDSR, FDG, RSC, and RR on the 160 standalone cases;
- all seven trajectory-class distributions;
- execution-error and semantic-revision recovery counts separately;
- the five-category observation-to-action error-response distribution and
  observation-conditioned recovery rate;
- clarification detection, missed and unnecessary clarification, and resolved ambiguity accuracy;
- interactive turn and interaction accuracy;
- descriptive no-query behaviour and manually labelled safety compliance;
- Conditional Trajectory Divergence and within-model stability;
- descriptive by-difficulty results;
- uncertainty intervals and completed denominators; and
- bounded validation agreement and unresolved evaluator uncertainty.

Report ambiguity, interactive, and safety partitions separately. Do not combine them into the
primary standalone denominator.

## Academic positioning

The design builds on, rather than claims to replace, established methods:

- **BIRD** and Gao et al. support execution-based Text-to-SQL comparison rather than SQL-string
  equality.
- **Ning et al.** and **Dr.Spider** support systematic error and diagnostic analysis.
- **Spider 2.0** and **BIRD-INTERACT** motivate realistic, interactive database workflows and
  environment feedback.
- **RetrySQL** supports separating first-attempt performance from retry/recovery behaviour.
- **AgentBoard** and **AgentDiagnose** support process-sensitive evaluation and diagnosis of
  observable multi-step agent trajectories.
- **SQLucid** and **Talk2Data** provide supporting context for inspectable and multi-step analytical
  interaction.

TRAJECT-Bench is conceptually relevant but remains a preprint and is not the sole or primary
methodological foundation where peer-reviewed evidence is required. Full publication links and
their precise relationship to this study are maintained in
[`trace-aware-evaluation-plan-v3.md`](trace-aware-evaluation-plan-v3.md).

The contribution is not a claim that trajectory-aware evaluation is new. It is a controlled
empirical application showing how much final execution accuracy conceals about direct reliability,
recovery, clarification, semantic failure, and error response in a deployed Bedrock/Athena
Text-to-SQL pipeline, including a paired Nova Lite/Haiku 4.5 comparison.

## Threats to validity

- Chinook is small and clean, so results do not establish cross-domain or enterprise-scale
  generalization.
- Exact-result projection can penalize a reasonable alternative output shape. Make requested
  projections explicit and freeze them before formal collection.
- Equivalent SQL can coincide on one snapshot while differing elsewhere.
- Managed model and service behaviour can change between the separately deployed model runs.
- Benchmark refinement after pilot failures can overfit the instrument; freeze it before formal
  collection.
- Reusing sessions across independent cases can leak context.
- Incomplete trace capture or incorrect event correlation can misclassify trajectories.
- `acceptedSlots` does not itself provide automatic natural-language relevance evaluation.

Mitigate these threats with committed benchmark definitions, fresh sessions, the same deployed
data and protocol, complete result retrieval, repeated paired runs, explicit uncertainty states,
and bounded manual validation.
