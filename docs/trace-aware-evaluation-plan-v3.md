# Trace-Aware Evaluation of Agentic Text-to-SQL Systems

## Revised Research and Implementation Specification

> **Status:** revised after implementation review  
> **Purpose:** provide a research-ready and implementation-ready specification for evaluating an already deployed Amazon Bedrock Agent + Amazon Athena analytical pipeline using a 200-turn benchmark and persisted execution traces.

---

# 1. Study focus

The study should focus on one empirical problem:

> **How much does final execution accuracy conceal about the way an agentic Text-to-SQL system actually reaches its outcomes?**

The current system already accepts a natural-language analytical request, invokes an Amazon Bedrock Agent, generates and executes SQL through Amazon Athena, observes successful results or execution errors, can revise failed queries, can ask clarification questions, and persists execution traces.

The research compares:

```text
Outcome-only evaluation:
Question -> final database result -> correct / incorrect
```

with:

```text
Trace-aware evaluation:
Question
 -> clarification behaviour
 -> SQL attempt(s)
 -> Athena observations/errors
 -> observable response to each error
 -> retries/revisions
 -> final database outcome
 -> trajectory profile
```

The contribution is **not** simply that traces contain more data. The empirical question is whether trajectory information changes the interpretation of reliability and/or model comparison.

The study analyses **observable agent behaviour**, especially action-observation-action transitions.
Persisted rationale text is retained as supplementary evidence but is not treated as hidden
chain-of-thought, a causal explanation of an action, or a primary scoring target.

---

# 2. Primary research question

> **To what extent does trajectory-aware decomposition change the interpretation of final execution accuracy by distinguishing direct correctness, successful recovery, and unresolved failure, and do Nova Lite and Haiku 4.5 exhibit different recovery, clarification, error-response, and failure profiles?**

---

# 3. Secondary research questions

## RQ1 — Final-to-direct success gap

> **What proportion of final successful outcomes were not achieved as clean, direct successes?**

This distinguishes final effectiveness from initial reliability. Recovered success is not treated as
incorrect or inherently inferior: it is evidence of both initial fallibility and system resilience.

## RQ2 — Recovery contribution

> **How much of final task success is attributable to observable recovery from initially unsuccessful SQL attempts?**

Separate:

- execution-error recovery;
- semantic revision success.

Do not collapse these into generic “self-correction.”

## RQ3 — Response to execution-error observations

> **How effectively do the evaluated agents respond to Athena execution-error observations, and which observable error-to-action patterns are associated with recovery or repeated failure?**

This is evaluated from persisted observations and subsequent SQL actions without interpreting
hidden reasoning or requiring an LLM judge.

## RQ4 — Difficulty and trajectory behaviour

> **How does benchmark difficulty relate to first-attempt correctness, retries, execution errors, clarification, and other trajectory characteristics?**

Do not assume harder SQL always produces longer trajectories.

## RQ5 — Paired model comparison

> **When Nova Lite and Haiku 4.5 achieve the same final outcome on the same benchmark case, how often do they follow different trajectory profiles?**

---

# 4. Research expectations and estimands

## Primary estimand — Final-to-direct success gap

Because clean direct success is a subset of final success, `FSR >= CDSR` follows from the metric
definitions. The study therefore does not test the existence of this difference as a directional
hypothesis. It estimates its magnitude and uncertainty.

Primary estimand:

```text
Final-to-Direct Success Gap =
    Final Success Rate - Clean Direct Success Rate
```

Interpret this gap alongside Recovery Rate. A large gap can indicate effective resilience, frequent
initial errors, unnecessary interaction, or a mixture of these; the trajectory decomposition is
required to distinguish them.

## Expected recovery contribution

> **A measurable subset of successful runs will require recovery from an initially unsuccessful SQL attempt.**

Primary estimand:

```text
Recovered Success Contribution =
    recovered successful standalone runs / all successful standalone runs
```

Also report:

```text
Recovery Rate =
    standalone runs with an unsuccessful first SQL attempt that recover
    --------------------------------------------------------------------
    standalone runs whose first SQL attempt was an execution or semantic error
```

Separate execution-error recovery from semantic revision.

## Expected observation-response differences

> **The two model conditions may differ in how often they revise SQL after an Athena error, repeat the same normalized error, resolve the observed error, introduce a new error, and eventually recover.**

These are empirical quantities to estimate, not assumed directional advantages for either model.

## Expected difficulty relationship

> **Benchmark difficulty will be associated with differences in first-attempt success, execution errors, retries, and recovery behaviour, but clarification and interaction length are not assumed to increase monotonically with SQL difficulty.**

## Cross-model estimand

For paired benchmark cases within each repetition that have the same final outcome, estimate how
often the evaluated models have different trajectory classes. Do not use the structurally weak
hypothesis that the value is merely non-zero.

Primary estimand:

```text
Conditional Trajectory Divergence =
    comparable paired cases with the same selected terminal outcome
    but different selected trajectory class
    ----------------------------------------------------------------
    comparable paired cases with the same selected terminal outcome
```

For the two planned repetitions, calculate the estimand separately by repetition and as a pooled
estimate with uncertainty clustered by benchmark case. A majority-value analysis is supplementary
and applies only if the optional third repetition is completed.

The magnitude and uncertainty are the result.

---

# 5. Actual benchmark structure

The implementation must support the real benchmark structure:

```text
160 standalone executable questions
20 ambiguity questions
10 interactive authored turns
10 safety / out-of-domain turns
----------------------------------
200 authored turns total
```

These require separate evaluation policies and must not share one universal denominator.

| Partition             | Count | Primary evaluation                                         |
| --------------------- | ----: | ---------------------------------------------------------- |
| Standalone executable |   160 | result correctness + trajectory profile                    |
| Ambiguity             |    20 | clarification appropriateness + post-clarification success |
| Interactive turns     |    10 | context carry-over + result correctness                    |
| Safety / OOD          |    10 | no-query compliance + refusal/decline behaviour            |

### Predeclared analysis populations

Use the following denominators throughout the study:

```text
Primary FSR, FASR, CDSR, FDG, RSC, RR, ESFR, and fallback-assisted success:
    160 standalone executable cases

Interactive result accuracy:
    10 authored interactive turns, reported separately and clustered within 5 episodes

Post-clarification result accuracy:
    up to 20 scripted ambiguity continuations, reported separately from authored turns

Clarification behaviour:
    20 authored ambiguity turns

Safety compliance:
    10 authored safety/OOD turns
```

An optional supplementary analysis may pool all executable turns, but it must be labelled as such
and must not replace the primary 160-case analysis.

Headline standalone metrics require a complete 160-case block for each model/repetition. A local
transport, persistence, or other collection failure invalidates the incomplete run; remove its
partial artifacts, correct the problem, and restart the full block. Never selectively rerun an
individual completed but incorrect model outcome inside an otherwise retained run.

---

# 6. Benchmark execution policies

Every benchmark item should map to one policy:

```text
execute
execute_sequence
clarify_then_execute
refuse_or_decline_without_query
```

## 6.1 `execute`

Used for standalone executable questions.

Expected:

```text
question -> agent -> SQL/tool use -> terminal result
```

Unexpected clarification is recorded as trajectory behaviour.

Use one frozen fallback response for unexpected clarification on an otherwise answerable case:

```text
The original request is fully specified. The query action is already configured for the benchmark
database and schema. Execute the request without asking another clarification question.
```

Send this reply once in the same session, record the clarification as `unnecessary`, and allow the
episode to continue. If the agent asks again without attempting SQL, terminate the episode as
`NO_SQL`. The fallback supplies no new analytical choice and is identical across models.

Also record `fallbackUsed`. A standalone episode that ends correctly after this response is a
`fallbackAssistedSuccess`: it contributes to FSR but cannot contribute to CDSR because intervention
was required.

## 6.2 `clarify_then_execute`

Used for ambiguity cases.

Expected:

```text
question
 -> agent asks clarification
 -> benchmark runner supplies predefined reply
 -> same Bedrock session continues
 -> SQL/tool use
 -> terminal result
```

Detect clarification from the documented Bedrock runtime trace shape: an orchestration
`OBSERVATION` whose `observation.type` is `ASK_USER`. The clarification text is stored under
`observation.finalResponse.text`. Do not require a separate `AMAZON.UserInput` invocation event;
the deployed agent traces do not emit one for this transition.

Use the resolution object embedded in each ambiguity record:

```json
{
    "clarification_target": "Ask whether top means realised revenue, invoice total, order count, or units purchased.",
    "resolution": {
        "acceptedSlots": ["ranking_metric"],
        "scriptedReply": "Use realised line-item revenue. Return exactly ten rows containing customer ID, first name, last name, and total realised revenue.",
        "gold_sql": "SELECT ...",
        "comparison": { "...": "..." }
    }
}
```

All 20 scripted replies and resolved golden queries are checked into the canonical benchmark JSON
and must be verified before formal runs. Keeping the resolution beside the primary case prevents a
separate resolution file from drifting out of sync.

If the agent does not request clarification and queries immediately, record `missed` clarification
and do not send the scripted reply. Do not score the guessed SQL against the benchmark's arbitrarily
chosen resolution, because the user never supplied that resolution. The authored ambiguity turn is
scored on clarification behaviour; post-clarification result correctness is defined only for
episodes that actually enter the scripted continuation.

## 6.3 `execute_sequence`

Used for interactive authored turns.

Interactive episodes must preserve session state.

If later gold SQL contains placeholders from an earlier turn, resolve them from the **preceding gold result**, not the model’s possibly incorrect result.

## 6.4 `refuse_or_decline_without_query`

Used for safety/OOD cases.

Expected:

```text
no SQL execution
appropriate refusal or decline
```

Do not include these cases in SQL execution accuracy.

No-query compliance is deterministic from the trace. Whether the final wording is an appropriate
refusal or decline is outside the primary metric. It may be checked in the bounded qualitative
audit, but it must not create an open-ended manual annotation requirement.

---

# 7. Clarification is orthogonal to outcome

Clarification must not be a mutually exclusive trajectory class.

A run can be:

```text
DIRECT_SUCCESS + expected clarification
DIRECT_SUCCESS + unnecessary clarification
EXECUTION_ERROR_RECOVERED + expected clarification
EXECUTED_SEMANTIC_FAILURE + no clarification
```

Store it separately:

```json
{
    "clarification": {
        "requested": true,
        "expected": false,
        "appropriate": false,
        "count": 1,
        "targetMatched": false,
        "fallbackUsed": true
    }
}
```

Recommended states:

```text
not_applicable
appropriate
unnecessary
missed
uncertain
```

The derived SQL trajectory class describes SQL-attempt history only. Missed or unnecessary
clarification is represented by `clarification` and `contractCompliant`; it does not make the SQL
trajectory class undefined. A run may therefore be `DIRECT_SUCCESS` while failing the interaction
contract and consequently not qualifying as a clean direct success.

---

# 8. Separate execution success from semantic correctness

Do not use a single field such as `firstAttemptSucceeded`.

Use:

```json
{
    "firstAttemptExecutedSuccessfully": true,
    "firstAttemptResultCorrect": false,
    "finalAttemptExecutedSuccessfully": true,
    "finalResultCorrect": false
}
```

A SQL statement can execute successfully and still answer the wrong question.

---

# 9. Store orthogonal trajectory facts first

Recommended internal representation:

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

Only then derive presentation classes.

---

# 10. Derived trajectory classes

Use mutually exclusive classes:

```text
DIRECT_SUCCESS
EXECUTION_ERROR_RECOVERED
SEMANTIC_REVISION_SUCCESS
EXECUTED_SEMANTIC_FAILURE
UNRECOVERED_EXECUTION_FAILURE
NO_SQL
SYSTEM_ERROR
```

### Classification precedence

Apply this order so every completed episode receives at most one class:

```text
1. If infrastructure, runner, persistence, or evaluator failure prevents an outcome:
       SYSTEM_ERROR

2. Else if no SQL was attempted where SQL was required:
       NO_SQL

3. Else if the terminal SQL result is gold-equivalent:
       a. first SQL result gold-equivalent:
              DIRECT_SUCCESS
       b. first SQL attempt produced an execution error:
              EXECUTION_ERROR_RECOVERED
       c. first SQL executed but was not gold-equivalent:
              SEMANTIC_REVISION_SUCCESS

4. Else if the final SQL attempt executed successfully but was not gold-equivalent:
       EXECUTED_SEMANTIC_FAILURE

5. Else:
       UNRECOVERED_EXECUTION_FAILURE
```

The class describes the transition from the first attempt to the terminal SQL outcome. Orthogonal
facts preserve mixed histories. For example, an execution error followed by executable but
incorrect SQL is `EXECUTED_SEMANTIC_FAILURE` with `executionErrorObserved = true`. A correct early
attempt followed by an incorrect terminal attempt is also `EXECUTED_SEMANTIC_FAILURE` with
`regressedAfterCorrectAttempt = true`.

The **terminal SQL attempt** is the last SQL invocation in the episode. FSR is based on that
attempt's captured or retrieved result. An earlier correct result followed by a failed or incorrect
SQL attempt is not counted as terminal success.

## DIRECT_SUCCESS

- first executed SQL is gold-equivalent; and
- terminal SQL result is gold-equivalent.

Expected or unexpected clarification and later redundant actions are stored as orthogonal facts.
They may disqualify clean direct success without changing this SQL-attempt class.

## EXECUTION_ERROR_RECOVERED

- the first SQL attempt produces an execution error;
- a later SQL attempt succeeds; and
- final result is gold-equivalent.

## SEMANTIC_REVISION_SUCCESS

- the first SQL attempt executes successfully;
- its result is not gold-equivalent; and
- a later SQL attempt becomes gold-equivalent.

This may be rare.

## EXECUTED_SEMANTIC_FAILURE

- the final SQL attempt executes successfully;
- its result is not gold-equivalent; and
- no later correct result is reached.

Use this instead of `SILENT_FAILURE`.

## UNRECOVERED_EXECUTION_FAILURE

- the final SQL attempt produces an execution error; and
- no terminal gold-equivalent result is reached.

## NO_SQL

- no SQL is executed where SQL would normally be required;
- or an interaction terminates after clarification without execution.

## SYSTEM_ERROR

Infrastructure/evaluator/runtime failure.

Do not count system errors as model failures by default.

Agent-produced invalid SQL or invalid action parameters are model outcomes, not `SYSTEM_ERROR`.
`SYSTEM_ERROR` is reserved for missing or unusable evidence outside a completed agent outcome in an
otherwise completed collection, such as candidate-result retrieval, persistence, evaluator, or
platform failure. A transport failure that stops collection invalidates the incomplete run instead
of becoming a scored benchmark case.

System-error runs remain in the audit output but are excluded from model-behaviour metrics. Formal
headline metrics are generated only from complete blocks; otherwise they are marked provisional
with their actual completed denominator.

---

# 11. Clean Direct Success Rate

Define a clean direct success as:

- first and terminal SQL results are gold-equivalent;
- exactly one SQL attempt, except where the benchmark contract explicitly requires more;
- no execution error;
- no deterministically redundant or prohibited database action;
- required clarification contract satisfied;
- no safety or interaction contract violation.

Use only auditable definitions of a redundant or prohibited action:

- equivalent SQL repeated without new user information or an intervening error that justifies it;
- a database invocation after the terminal gold-equivalent result;
- a database invocation forbidden by the case policy; or
- a retry beyond the frozen retry limit.

Do not mark a different exploratory query as unnecessary solely through subjective judgement. Such
actions are excluded from the primary CDSR rule and may only be described within the bounded
qualitative audit.

Metric:

```text
Clean Direct Success Rate =
    clean direct-success standalone runs / 160 standalone executable runs
```

Primary headline comparison:

```text
Final-to-Direct Success Gap =
    Final Success Rate - Clean Direct Success Rate
```

Interpret the three measures together:

```text
Initial reliability: Clean Direct Success Rate
Resilience:          Recovery Rate
Final effectiveness: Final Success Rate
```

---

# 12. Gold-result evaluation

## 12.1 Execute gold SQL once

For each executable case:

```text
gold SQL
 -> Athena
 -> full result
 -> local JSON reference result
```

The implemented `make gold` command reads the committed benchmark and writes one complete JSON
result per executable definition under `src/experiments/runs/golden-sql/`. The result contains only
the fields needed by the future evaluator:

```json
{
    "questionId": "CB200-E012",
    "turnNumber": null,
    "columns": [{ "name": "customer_id", "type": "integer" }],
    "rows": [["46"]],
    "rowCount": 1
}
```

Standalone and ambiguity files use the question ID. Interactive files add `-T01` or `-T02` so the
two turn results do not overwrite each other. No CSV, manifest, hash, or separate cache is created.
Running the command again overwrites existing reference files.

## 12.2 Prefer captured candidate observations

Evaluation order:

1. use the action observation persisted in the original trace as evidence of what the agent saw;
2. persist the Athena `queryExecutionId` for every successful action;
3. use `GetQueryResults` pagination with that ID to retrieve the complete original candidate result
   for evaluation;
4. classify the affected attempt as `evaluator_uncertain` if the complete original result cannot
   be retrieved; and
5. never silently re-execute candidate SQL as though it were original agent behaviour.

The action response may continue to expose only preview rows to the model. The observation must
distinguish:

```text
queryExecutionId
previewRowCount
previewTruncated
```

The preview cap must not be implemented by adding `LIMIT` to model-generated SQL. It constrains
only the action payload returned to the model. A SQL `LIMIT` is semantically valid only when the
question requests a bounded or top-N result.

The evaluator records the full evaluated row count separately. This avoids sending arbitrarily
large results to the model while allowing complete comparison against the exact original Athena
execution.

---

# 13. Result truncation must be resolved

Before formal experiments, verify the current Athena preview limit and complete-result retrieval.

A false positive is possible if candidate and gold results share the first N rows but differ later.

Before formal runs:

```text
execute all executable gold SQL
 -> calculate full row counts
 -> report min / median / max
 -> list every case above the current limit
```

Then either:

1. prove all benchmark results fit within the preview limit; or
2. retrieve the full original results through paginated `GetQueryResults` and save the complete
   result.

Increasing the rows returned to the model is not the default solution because it changes model
context size and may make conditions harder to compare.

---

# 14. Explicit result-comparison contracts

The benchmark materializes a comparison contract on every executable record, interactive turn,
and ambiguity resolution. Most cases use these common values:

- exact result comparison and equal column count;
- aliases ignored;
- unordered multiset row comparison;
- duplicates preserved;
- numeric tolerance of `0.000001` applied only to non-identifier numeric fields;
- NULL and timestamp normalization; and
- complete rather than preview-only results.

Each embedded contract makes exceptions such as ordering and semantic top-N limits explicit:

```json
{
    "comparison": {
        "mode": "exact_result",
        "requiredColumns": ["track_id", "name", "milliseconds"],
        "orderMatters": true,
        "columnOrderMatters": true,
        "preserveDuplicates": true,
        "numericTolerance": 0.000001,
        "compareColumnNames": false,
        "allowExtraColumns": false,
        "rowLimit": 10,
        "topNTiePolicy": "deterministic_secondary_key"
    }
}
```

Handle:

- ranking;
- chronology;
- `LIMIT`;
- duplicates;
- aliases;
- floating-point values;
- NULL;
- timestamps;
- empty results;
- top-N ties;
- column-order differences.

Frozen comparison contract:

- require equal column count;
- validate the candidate result against the semantic columns declared by `requiredColumns`;
- compare columns by position when `columnOrderMatters` is true;
- when `columnOrderMatters` is false, use an explicit per-case column mapping rather than guessing;
- ignore aliases only when `compareColumnNames` is false;
- compare unordered results as multisets, not sets, when `orderMatters` is false;
- compare ordered results row-by-row when `orderMatters` is true;
- apply numeric tolerance only to fields parsed as numeric; and
- fail closed as `evaluator_uncertain` when the declared comparison contract cannot be applied.

`topNTiePolicy = deterministic_secondary_key` means the metric ordering and stable secondary keys
written in the canonical query select one repeatable result at the cutoff. `rowLimit` is non-null
only when the natural-language question explicitly requests top-N output. The benchmark contains
no transport-driven `LIMIT 200` clauses. `result_set_only` is the simpler case-level alternative:
the evaluator compares the selected rows as an unordered multiset and ignores their presentation
order when all selected values are equal.

---

# 15. Core metrics

## Final Success Rate

```text
FSR =
    final gold-equivalent standalone runs / 160 standalone executable runs
```

## First-Attempt Result Correctness

```text
FASR =
    standalone runs with gold-equivalent first SQL result / 160 standalone executable runs
```

## Clean Direct Success Rate

```text
CDSR =
    clean direct-success standalone runs / 160 standalone executable runs
```

## Final-to-Direct Success Gap

```text
FDG = FSR - CDSR
```

FDG is a decomposition measure, not an error correction to FSR. Report the trajectory classes
within the gap so recovery, unnecessary interaction, and contract violations are not conflated.

## Recovered Success Contribution

```text
RSC =
    recovered successful standalone runs / all successful standalone runs
```

## Recovery Rate

```text
RR =
    standalone runs with an unsuccessful first SQL attempt that recover
    --------------------------------------------------------------------
    standalone runs whose first SQL attempt was an execution or semantic error
```

Report separately:

```text
Execution-error recovery rate =
    first-attempt execution errors ending correctly
    ------------------------------------------------
    standalone runs whose first attempt produced an execution error

Semantic revision rate =
    first-attempt semantic errors ending correctly
    -----------------------------------------------
    standalone runs whose first attempt executed but was not gold-equivalent
```

Exclude `NO_SQL` and `SYSTEM_ERROR` from recovery denominators and report them separately.

## Observation-to-action error-response metrics

For each persisted Athena execution-error observation, correlate the preceding SQL attempt, the
next SQL attempt if one exists, and the next execution observation. This produces an **eligible
error transition**. The analysis uses observable tool feedback and actions; it does not score the
model's rationale text.

Normalize error signatures before comparison, for example:

```text
COLUMN_NOT_FOUND:<identifier>
TABLE_NOT_FOUND:<identifier>
SYNTAX_ERROR
TYPE_MISMATCH
FUNCTION_NOT_FOUND:<identifier>
AMBIGUOUS_NAME:<identifier>
PERMISSION_ERROR
TIMEOUT
OTHER:<stable_normalized_code>
```

Remove volatile values such as line numbers, request IDs, timestamps, and generated execution IDs
from normalized signatures. Preserve the original error text as raw evidence.

### Retry Response Rate

```text
Retry Response Rate =
    error observations followed by another SQL attempt
    --------------------------------------------------
    eligible error observations
```

### Unchanged-query Retry Rate

```text
Unchanged-query Retry Rate =
    retried transitions whose canonical SQL is unchanged
    ----------------------------------------------------
    error observations followed by another SQL attempt
```

### Repeated-error Rate

```text
Repeated-error Rate =
    retried transitions producing the same normalized error signature
    -----------------------------------------------------------------
    retried transitions with an observable next execution outcome
```

### Immediate Error-resolution Rate

```text
Immediate Error-resolution Rate =
    retried transitions where the previous normalized error does not recur
    -----------------------------------------------------------------------
    retried transitions with an observable next execution outcome
```

Report whether resolution led to successful execution or merely to a different error. Therefore,
immediate error resolution is not equivalent to semantic correctness.

### New-error Introduction Rate

```text
New-error Introduction Rate =
    retried transitions producing a different normalized execution error
    --------------------------------------------------------------------
    retried transitions with an observable next execution outcome
```

### Observation-conditioned Recovery Rate

```text
Observation-conditioned Recovery Rate =
    standalone episodes with at least one execution error that end correctly
    ------------------------------------------------------------------------
    standalone episodes with at least one execution error
```

This episode-level denominator avoids treating several correlated errors from one run as
independent recovery opportunities. Report transition-level metrics with confidence intervals
clustered by benchmark case or episode. Primary error-response metrics use standalone executable
episodes; other executable partitions may be reported separately with explicit denominators.

## Executed Semantic Failure Rate

```text
ESFR =
    executed semantic failures / 160 standalone executable runs
```

## Clarification Detection Rate

```text
CDR =
    appropriate clarification requests / ambiguity cases
```

## Unnecessary Clarification Rate

```text
UCR =
    standalone cases with an unnecessary clarification / 160 standalone executable cases
```

## Fallback-assisted Success Rate

```text
Fallback-assisted Success Rate =
    standalone cases ending correctly after the frozen unexpected-clarification fallback
    -------------------------------------------------------------------------------------
    160 standalone executable cases
```

Report this as an intervention-dependence diagnostic. These cases remain final successes but are
excluded from clean direct success.

## Safety Compliance Rate

```text
SCR =
    safety/OOD cases with no disallowed query execution / safety/OOD cases
```

Also record distributions for:

```text
sql_attempt_count
athena_execution_count
athena_error_count
tool_call_count
clarification_count
total_turn_count
latency_ms
token_usage
```

Latency/tokens remain descriptive unless promoted to formal research questions.

For interactive and resolved ambiguity cases, report analogous result metrics with explicit
partition names; do not merge them into the primary standalone metrics.

---

# 16. Paired two-model experiment

Use exactly two frozen model conditions:

1. Amazon Nova Lite;
2. Anthropic Claude Haiku 4.5 through Amazon Bedrock.

Run one manually deployed model at a time. Label executor outputs with the model condition
(`nova-lite` or `haiku-4-5`) and repetition number. Do not copy or validate sensitive Bedrock agent
IDs, aliases, or versions in the experiment outputs.

The purpose is not to rank models by accuracy alone.

The purpose is to test whether similar final results hide different reliability profiles.

Illustrative only:

```text
                         Model A   Model B
Final success              84%       85%
Clean direct success       58%       74%
Execution recovery         22%        8%
Semantic failure           10%        5%
Unnecessary clarify        17%        6%
```

## Conditional Trajectory Divergence

For a single repetition:

```text
CTD =
    paired cases with same final outcome but different trajectory class
    ------------------------------------------------------------
    paired cases with same final outcome
```

Use only comparable paired cases.

For the two planned repetitions, calculate CTD within each frozen experiment block, then report the
two estimates and a pooled estimate with uncertainty clustered by benchmark case. Repetition labels
identify equivalent protocol blocks; they are not interpreted as matched stochastic samples.

If an optional third repetition is completed, a supplementary majority-outcome and
majority-trajectory analysis may be reported. It must not replace the complete per-run class
distributions. CTD is a study-specific descriptive metric, not a claimed general-purpose novel
metric.

Also report:

```text
Within-model trajectory stability =
    cases with the same trajectory class in every completed repetition
    ------------------------------------------------------------------
    cases with all planned repetitions completed
```

Outcome stability and trajectory stability must be reported separately.

---

# 17. Model-comparison controls

Keep constant where possible:

- benchmark;
- deployed Chinook data;
- schema/context;
- agent instructions;
- action-group implementation;
- available tools;
- clarification scripts;
- maximum turns;
- maximum retries;
- Athena workgroup;
- AWS region;
- result evaluator;
- embedded per-case result-comparison contracts;
- benchmark ordering.

Persist only the identifiers required to group the local results:

```json
{
    "modelCondition": "nova-lite",
    "repetition": 1,
    "benchmarkCaseId": "CB200-E001",
    "sessionId": "..."
}
```

Deploy and complete the Nova Lite runs first. Deploy Haiku 4.5 later and use the same runner and
benchmark definitions.

---

# 18. Run and episode identity

Persist:

```text
benchmark_case_id
model_condition
repetition
turn_number
session_id
interaction_order
```

Interactive and ambiguity episodes may span several server interactions under the same session.

If trace sequence numbers restart per interaction, add:

```text
global_episode_sequence
actor = user | agent | tool
```

Never correlate runs only by timestamp or question text.

---

# 19. Raw evidence preservation

The existing project already persists trace evidence in SQLite.

Prefer:

- preserving that trace database;
- enabling raw trace retention if required;
- storing derived evaluator outputs separately.

Avoid a second storage system unless it adds clear value.

---

# 20. Suggested run-level normalized schema

```json
{
    "modelCondition": "nova-lite",
    "benchmarkCaseId": "...",
    "sessionId": "...",
    "partition": "standalone",
    "difficulty": "hard",
    "repetition": 1,

    "firstAttempt": {
        "executedSuccessfully": false,
        "resultCorrect": false,
        "outcome": "execution_error"
    },

    "terminal": {
        "executedSuccessfully": true,
        "outcome": "correct",
        "resultCorrect": true,
        "attemptNumber": 2
    },

    "trajectory": {
        "executionErrorObserved": true,
        "retryAttempted": true,
        "recovered": true,
        "redundantActionObserved": false,
        "regressedAfterCorrectAttempt": false,
        "traceComplete": true,
        "derivedClass": "EXECUTION_ERROR_RECOVERED",
        "sqlAttemptCount": 2,
        "athenaExecutionCount": 2,
        "athenaErrorCount": 1,
        "toolCallCount": 2,
        "totalTurnCount": 1
    },

    "clarification": {
        "state": "not_applicable",
        "requested": false,
        "count": 0,
        "fallbackUsed": false,
        "fallbackAssistedSuccess": false
    },

    "contract": {
        "compliant": true,
        "violations": []
    },

    "performance": {
        "latencyMs": 0,
        "inputTokens": null,
        "outputTokens": null
    },

    "evaluation": {
        "manuallyReviewed": false,
        "uncertain": false
    },

    "sqlAttempts": [
        {
            "attempt": 1,
            "sql": "SELECT ...",
            "executionStatus": "ERROR",
            "goldEquivalent": false
        },
        {
            "attempt": 2,
            "sql": "SELECT ...",
            "executionStatus": "SUCCESS",
            "goldEquivalent": true
        }
    ],

    "errorTransitions": [
        {
            "observationSequence": 6,
            "precedingAttempt": 1,
            "normalizedError": "COLUMN_NOT_FOUND:playlist_id",
            "nextAttempt": 2,
            "retryProduced": true,
            "sqlChanged": true,
            "sameErrorRepeated": false,
            "previousErrorResolved": true,
            "newErrorIntroduced": false,
            "episodeEventuallyRecovered": true
        }
    ]
}
```

---

# 21. Secondary failure and error-response taxonomy

For recovered/failed runs, optionally classify the first critical observable issue:

```text
SCHEMA
INTENT
SQL_CONSTRUCTION
EXECUTION_RECOVERY
AMBIGUITY
CONTEXT_CARRYOVER
SAFETY_CONTRACT
OTHER
```

Use deterministic evidence where possible.

Manual overrides must be auditable and must not alter raw evidence.

Error-response classification is separate from the broad failure taxonomy. It should be generated
deterministically from correlated invocation and observation events using the normalized error
signatures defined with the core metrics. Any transition that cannot be correlated unambiguously
is marked `transition_uncertain` rather than guessed.

---

# 22. Main experiment procedure

## Phase 0 — Protocol and configuration freeze

Before the pilot:

1. deploy Nova Lite for the first experiment block and use the `nova-lite` condition label;
2. keep prompts, action group, maximum retry/turn policy, Athena environment, and Chinook data
   unchanged;
3. freeze the 160-case primary denominator and separate secondary partition reporting;
4. freeze classification precedence and contract-violation rules;
5. verify every embedded ambiguity resolution and scripted reply;
6. verify every embedded result-comparison contract and execute every corrected gold query;
7. verify that every successful Athena action persists `queryExecutionId`; and
8. freeze the infrastructure retry and incomplete-block policy; and
9. retain the runner's fixed five-second delay between episodes, with no artificial delay between
   interactions inside one episode.

The optional `QUESTION_ID` runner filter is for diagnostic and pilot checks only. Formal
repetitions must be unfiltered complete runs from a clean run directory.

## Phase A — Pilot

Run:

```text
20 selected cases
x 2 models
x 1 repetition
```

Include:

- simple/direct cases;
- medium/hard joins;
- likely execution errors;
- ambiguity;
- interactive follow-up;
- safety/OOD;
- ranking/order-sensitive result;
- numerical aggregation;
- at least one potential large result.

Goals:

- validate trace parsing;
- validate run correlation;
- validate clarification handling;
- validate result comparison;
- detect truncation;
- validate model comparability.

Do not proceed until the evaluator is trustworthy.

## Phase B — First complete collection

Run:

```text
200 authored turns
x 2 models
x 1 repetition
```

Evaluate:

- whether recovery occurs often enough to study;
- whether trajectory classes are sufficiently populated;
- whether models produce useful behavioural differences;
- whether benchmark/evaluator defects appear.

## Phase C — Second formal repetition

Only after validation:

```text
200 authored turns
x 2 models
x 1 additional repetition
--------------------------------
2 complete repetitions in total
```

This produces 800 authored benchmark-turn executions across the two models and two repetitions,
plus the scripted clarification continuations required by the ambiguity partition. The exact number
of Bedrock calls will therefore be higher than 800.

## Optional Phase D — Third repetition

Only if time, budget, and the first two repetitions justify it:

```text
200 authored turns
x 2 models
x 1 additional repetition
```

The third repetition strengthens stability and permits a supplementary majority-class analysis. It
is not required for the primary dissertation claims. Do not delay the analysis and writing stages
solely to obtain it.

---

# 23. Statistical analysis

The same benchmark questions are evaluated across models and repetitions, so observations are paired/clustered.

Do not treat:

```text
800 authored-turn executions = 800 independent questions
```

## Paired binary outcomes

Use:

```text
McNemar's test
```

for paired correctness.

## Paired count/continuous outcomes

Use:

```text
Wilcoxon signed-rank
```

or:

```text
paired permutation tests
```

for attempts, latency, turns.

For error-transition metrics, bootstrap or otherwise cluster uncertainty by benchmark case or
episode because one episode can contain several correlated error observations.

## Repetitions

Use:

- per-question aggregation;
- clustered bootstrap by question;
- mixed-effects modelling only if justified.

## Confidence intervals

Use Wilson or bootstrap confidence intervals for:

- FSR;
- CDSR;
- RSC;
- RR;
- ESFR;
- clarification rates;
- repeated-error rate;
- immediate error-resolution rate; and
- observation-conditioned recovery rate.

Report effect sizes and uncertainty, not only p-values.

---

# 24. Manual validation protocol

Manual validation is bounded and validates the automated evaluator; it is not a second full
annotation study.

Before the formal collection, freeze a maximum validation budget:

```text
Unique run/episode classifications:   maximum 40 episodes
Error-observation transitions:        20-30, drawn from those episodes where possible
Optional rationale illustrations:      5-10, drawn from the same episodes
```

Use stratified selection rather than a simple random 10% sample. The run sample should cover both
models, major trajectory classes, difficulty levels, ambiguity, interactive and safety partitions,
and known comparator edge cases. The transition sample should cover common normalized error types,
successful recovery, repeated error, and new-error introduction.

Parser failures, unknown trace types, and ambiguous event correlation discovered in the pilot are
implementation defects to fix before formal collection. During formal collection, emit them as
`evaluator_uncertain`. If their number exceeds the bounded audit capacity or threatens a headline
metric, pause evaluation and fix the instrument instead of creating an unbounded manual workload.

Report:

- sample size and sampling strata;
- automated-versus-manual agreement;
- a confusion matrix where sample counts support it;
- every evaluator defect discovered and its resolution; and
- remaining uncertain cases.

Per-class precision, recall, or Cohen's kappa are optional and should only be reported when the
sample size and class counts make them meaningful. Use a frozen classification codebook and do not
change scoring rules after seeing model-comparison results without versioning and rerunning the
evaluator.

Correct methodological wording:

> **Deterministic comparison improves consistency, repeatability, scalability, and auditability, while manual validation estimates the evaluator's correctness.**

---

# 25. What this study evaluates

It evaluates:

- first-attempt result correctness;
- final result correctness;
- clean direct success;
- execution-error recovery;
- semantic revision;
- executed semantic failures;
- retries;
- Athena errors;
- observable error-to-action responses;
- repeated and resolved normalized errors;
- new-error introduction after retry;
- clarification behaviour;
- safety/no-query compliance;
- context carry-over;
- trajectory profiles;
- paired model trajectory differences;
- interaction/tool-call counts;
- descriptive latency/token usage.

It does **not** evaluate:

- hidden chain-of-thought faithfulness;
- whether rationale caused an action;
- rationale quality;
- complete user-facing natural-language answer faithfulness;
- causal explanation quality;
- generalisation beyond Chinook/Athena/this architecture.

Persisted rationale events may support a bounded qualitative illustration of observable
rationale-action mismatches, such as a stated correction that is not implemented by the subsequent
SQL. These examples do not receive a benchmark score, are not used to infer hidden reasoning, and
do not affect the primary or secondary quantitative results.

Describe the study as:

> **trajectory-aware behavioural evaluation of agentic Text-to-SQL execution**

not as an evaluation of hidden model reasoning.

Unless natural-language answers are separately scored, do not claim full end-to-end user-answer reliability.

---

# 26. Academic positioning and resources

## BIRD

Resource: https://bird-bench.github.io/

Relationship:

> provides execution-based Text-to-SQL benchmarking and the gold-SQL outcome baseline.

## Gao et al. (2024)

**Text-to-SQL Empowered by Large Language Models: A Benchmark Evaluation**

DOI: https://doi.org/10.14778/3641204.3641221  
Preprint: https://arxiv.org/abs/2308.15363

Relationship:

> grounds systematic LLM Text-to-SQL benchmarking and execution-based comparison rather than SQL string equality.

## Ning et al. (2024)

**Insights into Natural Language Database Query Errors: From Attention Misalignment to User Handling Strategies**

DOI: https://doi.org/10.1145/3650114

Relationship:

> grounds systematic error categorisation and error/user-handling analysis. This project extends from query-level errors to complete agent execution trajectories.

## Dr.Spider

Dr.Spider studies robustness and diagnostic decomposition of Text-to-SQL systems under perturbations.

Official ICLR 2023 paper:
https://openreview.net/pdf?id=Wc5bmZZU9cy

Relationship:

> useful grounding for decomposing failure types rather than reporting only aggregate accuracy.

Use the peer-reviewed ICLR publication metadata in the final bibliography.

## Spider 2.0

**Spider 2.0: Evaluating Language Models on Real-World Enterprise Text-to-SQL Workflows**

Official ICLR/OpenReview:
https://openreview.net/forum?id=XmProj9cPs

Project:
https://spider2-sql.github.io/

Relationship:

> demonstrates the move from isolated SQL generation toward environment interaction, metadata use, and multi-step workflows.

## BIRD-INTERACT

**BIRD-INTERACT: Re-imagining Text-to-SQL Evaluation for Large Language Models via Lens of Dynamic Interactions**

Official ICLR 2026 paper:
https://openreview.net/pdf?id=nHrYBGujps

Project:
https://bird-interact.github.io/

Relationship:

> directly motivates treating clarification, environment interaction, and execution feedback as legitimate evaluation dimensions.

## RetrySQL

AAAI resource:
https://ojs.aaai.org/index.php/AAAI/article/view/40556

Relationship:

> directly supports separating first-attempt performance from retry/recovery behaviour.

This project differs by observing recovery in a deployed agentic pipeline rather than evaluating a retry-specific model.

## AgentBoard

**AgentBoard: An Analytical Evaluation Board of Multi-turn LLM Agents**

NeurIPS 2024 Datasets and Benchmarks Track:
https://proceedings.neurips.cc/paper_files/paper/2024/hash/877b40688e330a0e2a3fc24084208dfa-Abstract-Datasets_and_Benchmarks_Track.html

DOI:
https://doi.org/10.52202/079017-2365

Relationship:

> supports process-sensitive evaluation of agents rather than relying only on terminal success.

Use the peer-reviewed NeurIPS publication metadata in the final bibliography.

## AgentDiagnose

**AgentDiagnose: An Open Toolkit for Diagnosing LLM Agent Trajectories**

EMNLP 2025 System Demonstrations:
https://aclanthology.org/2025.emnlp-demos.15/

Relationship:

> strong general-agent methodological motivation for using observable multi-step trajectories as evaluation evidence.

Limitation:

> it motivates trajectory diagnosis but does not validate this project's specific deterministic Text-to-SQL taxonomy.

## TRAJECT-Bench

**TRAJECT-Bench: A Trajectory-Aware Benchmark for Evaluating Agentic Tool Use**

Preprint:
https://arxiv.org/abs/2510.04550

Relationship:

> conceptually supports outcome-vs-trajectory evaluation.

Do not use it as the sole methodological foundation if peer-reviewed references are required.

## SQLucid

DOI:
https://doi.org/10.1145/3654777.3676368

Relationship:

> supporting context for the value of intermediate query/result evidence and transparency.

## Talk2Data

DOI:
https://doi.org/10.1145/3643894

Relationship:

> supporting context for multi-step analytical interaction and decomposition.

---

# 27. Novelty and contribution boundary

Do **not** claim that:

- trajectory-aware agent evaluation is new;
- interactive Text-to-SQL evaluation is new;
- retry/recovery evaluation is new;
- multi-step Text-to-SQL workflows are new.

The defensible contribution is:

> **A controlled empirical study of how much final execution accuracy conceals about direct success, recovery, semantic failure, clarification, and interaction behaviour in a deployed Amazon Bedrock/Athena Text-to-SQL agent.**

With two models:

> **A paired empirical comparison testing whether Nova Lite and Haiku 4.5 exhibit different
> reliability, error-response, recovery, and interaction profiles when complete database-execution
> trajectories are analysed.**

This is an applied empirical contribution suitable for an MSc dissertation.

---

# 28. Implementation structure

```text
src/experiments/
  runner/
    run-benchmark
    question-runner
    episode-runner
    server-client
    agent-response-inspector
    candidate-result-collector
    run-result-writer

  evaluation/
    trace-parser
    result-normalizer
    result-comparator
    attempt-evaluator
    trajectory-facts
    trajectory-classifier
    error-transition-evaluator
    clarification-evaluator
    safety-evaluator
    report-generator

  golden-results/
    generate-golden-results
    gold-query-definition-builder
    gold-sql-resolver
    golden-result-generator
    golden-result-writer
  shared/services/
    athena/
      athena-service
    benchmark/
      benchmark-loader
    transcripts/
      transcript-reader

  runs/
    golden-sql/
```

`interaction-policy` must handle one-shot execution, ambiguity continuations, interactive sequences, and safety/no-query cases.

`result-comparator` is a critical research instrument and must implement per-case semantics.

`trajectory-facts` derives orthogonal facts before `trajectory-classifier` derives presentation classes.

`error-normalizer` removes volatile error details and produces versioned signatures.
`error-transition-builder` correlates each Athena error observation with the preceding and following
SQL actions. `error-response-evaluator` calculates the deterministic transition and episode-level
metrics. None of these modules interprets rationale text.

---

# 29. Implementation order

1. **Implemented:** load the committed benchmark and build all executable golden definitions.
2. **Implemented:** execute golden SQL, retrieve complete Athena results, and write JSON reference
   files.
3. **Implemented:** resolve interactive placeholders from preceding golden results.
4. Implement robust result equivalence with per-case metadata.
5. **Implemented:** execute benchmark cases sequentially with the four interaction policies and
   required episode/session continuity.
6. **Implemented:** retrieve and persist complete original candidate results using Athena
   query-execution IDs.
7. Normalize multi-turn traces into episode-level ordering.
8. Normalize Athena errors and build observation-to-action transitions.
9. Derive orthogonal facts and mutually exclusive trajectory classes.
10. Export JSON and Markdown evaluation results.
11. Pilot 20 strategically selected cases across both models.
12. Complete the bounded manual audit and fix evaluator defects.
13. Run the first complete benchmark pass per model.
14. Run the second planned repetition.
15. Run a third repetition only if time and budget permit.

---

# 30. Required outputs

```text
src/experiments/runs/
  golden-sql/
    CB200-E001.json
    ...

  <model-condition>/
    repetition-<number>/
      interactions.jsonl
      candidate-results/
      evaluation/
        results.jsonl
        error-transitions.jsonl
        evaluator-uncertain.jsonl
        summary.json
        summary.md
```

Version 1 uses JSON/JSONL for machine-readable data and Markdown for the readable summary. It does
not generate CSV files.

---

# 31. Suggested dissertation figures

1. Final Success Rate vs Clean Direct Success Rate
2. Final-to-Direct Success Gap by model
3. Direct vs recovered success decomposition
4. Trajectory-class distribution by difficulty
5. Execution-error vs semantic-failure distribution
6. Error-response outcomes after Athena observations by model
7. Repeated-error and observation-conditioned recovery rates by model
8. Appropriate vs unnecessary clarification
9. Conditional Trajectory Divergence between models
10. Attempt/turn distributions by difficulty/model

Keep only figures that directly answer the research questions.

---

# 32. Definition of done

The research harness is ready for formal experimentation when it can:

- load all benchmark partitions;
- execute the correct policy per case;
- preserve isolated sessions;
- continue scripted clarification in the same session;
- run interactive sequences;
- enforce no-query safety cases;
- correlate each run with persisted trace evidence;
- persist the Athena query-execution ID for every successful SQL action;
- retrieve complete Athena results;
- save complete golden results as local JSON files;
- compare candidate results using per-case rules;
- distinguish execution success from semantic correctness;
- evaluate every SQL attempt;
- derive first-attempt and terminal outcomes;
- derive orthogonal trajectory facts;
- derive mutually exclusive trajectory classes;
- normalize Athena error signatures;
- correlate error observations with preceding and subsequent SQL actions;
- calculate retry-response, unchanged-query, repeated-error, immediate-resolution, new-error, and
  observation-conditioned recovery metrics;
- apply the frozen class-precedence and contract-orthogonality rules;
- calculate FSR, CDSR, FDG, RSC, RR, ESFR, fallback-assisted success, clarification, and safety
  metrics;
- use the primary 160-case denominator and report other partitions separately;
- compare Nova Lite and Haiku 4.5 pairwise, calculate per-repetition and pooled CTD, and report
  within-model outcome and trajectory stability;
- treat a cancelled or failed collection as an incomplete run that is discarded and restarted from
  the beginning;
- export reproducible run-level data;
- support the bounded stratified manual-validation protocol;
- trace every headline statistic back to raw evidence.

---

# 33. Final methodological principle

The evaluator is a **research instrument**.

It must be:

- deterministic where possible;
- reproducible;
- auditable;
- manually validated;
- conservative about uncertain cases;
- explicit about assumptions;
- traceable from aggregate metric to individual run.

The strongest dissertation framing is:

> **“I used a validated automated evaluation instrument to quantify how much final execution
> accuracy conceals about the reliability, observable error-response, and execution behaviour of
> agentic Text-to-SQL systems.”**
