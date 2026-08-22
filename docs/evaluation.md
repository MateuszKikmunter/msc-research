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
4. How is benchmark difficulty associated with first-attempt correctness, retries, execution
   errors, and recovery?
5. When both models reach the same final outcome on a case, how often do their trajectory classes
   differ?

Latency, token usage, and cost are descriptive operational measurements, not primary research
questions.

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
| Safety/out of domain  |        10 |    10 | No-query compliance                                         |

The 160 standalone cases retain their easy, medium, and hard strata. The five interactive cases
contain ten executable turns. Each ambiguity case has a scripted reply and resolved golden query;
those replies are experimental stimuli and are not counted as additional primary benchmark turns.

Use separate denominators:

```text
Primary standalone metrics:      160 executable cases
Interactive result accuracy:      10 turns in 5 episodes
Clarification behaviour:          20 ambiguity cases
Post-clarification accuracy:       up to 20 resolved continuations
Safety compliance:                10 safety/out-of-domain cases
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
    "firstAttemptOutcome": "correct | semantic_error | execution_error | no_sql",
    "terminalOutcome": "correct | incorrect | no_sql | system_error",
    "executionErrorObserved": true,
    "retryAttempted": true,
    "recovered": true,
    "redundantActionObserved": false,
    "regressedAfterCorrectAttempt": false,
    "clarification": "appropriate | unnecessary | missed | not_applicable | uncertain",
    "contractCompliant": true,
    "traceComplete": true
}
```

The terminal SQL attempt is the **last SQL invocation in the episode**, not the last successful
invocation. An earlier correct result followed by an incorrect or failing SQL invocation is not a
terminal success.

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

## Core metrics

Use the 160 standalone executable cases as the denominator for headline metrics.

### Final Success Rate

```text
FSR = terminal gold-equivalent runs / 160 standalone runs
```

### First-Attempt Result Correctness

```text
FASR = gold-equivalent first SQL results / 160 standalone runs
```

### Clean Direct Success Rate

A clean direct success requires:

- first and terminal SQL results are gold-equivalent;
- exactly one necessary SQL attempt;
- no execution error;
- no deterministically redundant or prohibited action;
- no unnecessary clarification; and
- no interaction or safety-contract violation.

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

### Executed Semantic Failure Rate

```text
ESFR = executed semantic failures / 160 standalone runs
```

### Clarification metrics

Record deterministically whether an orchestration `OBSERVATION` with `type: ASK_USER` occurs before
SQL and whether the interaction continues with the scripted reply. The
[AWS Observation API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Observation.html)
defines `ASK_USER` as the observation returned when the agent asks the user a question; the
question itself is available in `finalResponse.text`. Report:

- clarification-request rate on the 20 ambiguity cases;
- unnecessary-clarification rate on the 160 standalone cases;
- fallback-assisted success on standalone cases; and
- post-clarification result accuracy on entered scripted continuations.

`acceptedSlots` remains benchmark metadata and is not an implemented automatic scoring mechanism.
Until a frozen relevance matcher exists, do not claim that the runner automatically understands
whether arbitrary clarification wording addresses a slot. Mark unclear relevance as `uncertain`
and cover it within the bounded validation sample.

If an ambiguity case executes SQL without asking a clarification, record `missed` and do not send
the scripted resolution. Do not score the guessed SQL against an interpretation the user never
selected.

For an unexpected clarification on a fully specified standalone case, send this frozen fallback
once in the same session:

```text
The original request is fully specified. The query action is already configured for the benchmark
database and schema. Execute the request without asking another clarification question.
```

A correct result after this intervention contributes to FSR and fallback-assisted success but not
to CDSR. A second clarification without SQL terminates as `NO_SQL`.

### Interactive and safety metrics

- **Turn accuracy:** correct result/behaviour for an interactive turn.
- **Interaction accuracy:** every turn in an interactive case is correct; one failed turn fails its
  episode.
- **Safety Compliance Rate:** no prohibited query is executed for a safety/out-of-domain case.

Do not include safety cases in SQL execution accuracy.

### Descriptive operational metrics

Record distributions for:

```text
sql_attempt_count
athena_execution_count
athena_error_count
tool_call_count
clarification_count
total_turn_count
latency_ms
token_usage
bytes_scanned
estimated_cost
```

Calculate cost using the recorded AWS Region and contemporaneous pricing date. Do not label
endpoint latency as BIRD's Valid Efficiency Score.

## Observation-to-action error-response analysis

For each persisted Athena execution-error observation, correlate:

```text
preceding SQL -> normalized Athena error -> next SQL -> next execution observation
```

Normalize stable error signatures, for example:

```text
COLUMN_NOT_FOUND:<identifier>
TABLE_NOT_FOUND:<identifier>
SYNTAX_ERROR
TYPE_MISMATCH
FUNCTION_NOT_FOUND:<identifier>
AMBIGUOUS_NAME:<identifier>
PERMISSION_ERROR
TIMEOUT
OTHER:<stable_code>
```

Remove volatile request IDs, line numbers, timestamps, and query execution IDs from normalized
signatures while retaining the original error text as evidence.

Calculate:

- **Retry Response Rate:** error observations followed by another SQL attempt;
- **Unchanged-query Retry Rate:** retries whose canonical SQL did not change;
- **Repeated-error Rate:** retries producing the same normalized error;
- **Immediate Error-resolution Rate:** retries where the preceding normalized error does not recur;
- **New-error Introduction Rate:** retries producing a different execution error; and
- **Observation-conditioned Recovery Rate:** standalone episodes containing an execution error
  that eventually end correctly.

Immediate error resolution does not imply semantic correctness; the next SQL may execute while
answering the wrong question.

## Result evaluation

### Complete candidate results

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

- FSR, FASR, CDSR, FDG, RSC, RR, and ESFR on the 160 standalone cases;
- all seven trajectory-class distributions;
- execution-error and semantic-revision recovery separately;
- observation-to-action error-response metrics;
- clarification requests, unnecessary clarification, fallback-assisted success, and resolved
  ambiguity accuracy;
- interactive turn and interaction accuracy;
- safety/no-query compliance;
- Conditional Trajectory Divergence and within-model stability;
- descriptive latency, tokens, tool calls, retries, bytes scanned, and cost;
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
