# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Changed

- **2026-09-13** — Consolidated the evaluation pipeline from 17 production modules to 12. Moved
  attempt evaluation into `episode-evaluator.ts`; replaced result-loader, JSONL-loader, and
  episode-builder classes with functions in `evaluation-input.ts`; combined clarification/safety
  functions in `case-policies.ts`; and colocated fact derivation and classification in `trajectory.ts`.
  The comparator imports normalization directly, and the CLI constructs four components rather than
  wiring each small operation. Retained existing tests against the new functions. All four saved
  model/repetition runs produce identical detailed evaluation results and aggregate metrics compared
  with a pre-refactor baseline. No model calls, report overwrites, benchmark edits, or study-level
  analysis were performed. Updated the design and evaluation documentation.

- **2026-09-13** — Simplified experiment code without changing prompts or collection policy:
  standalone and ambiguity cases share one optional-continuation flow; benchmark loading,
  gold-definition extraction, and trajectory classification are named functions; runner dependencies
  use constructor parameter properties; and five shared-service modules moved directly into
  `src/experiments/shared/`. Updated callers, tests, and current documentation.

- **2026-09-13** — Retained evaluation-review fixes: unordered numeric-tolerance comparison uses
  recursive one-to-one matching so earlier assignments can move without reusing duplicates;
  `SYSTEM_ERROR` cases are excluded from scored rates while remaining in audit counts, and affected
  standalone summaries are provisional. Runner/evaluator trace correlation shares deduplication and
  attempt numbering and no longer guesses assignments for unmatched execution IDs. SQL revision
  detection compares trimmed text only. Explicit failure traces stop evaluation for review before
  no-SQL, clarification, or safety outcomes are scored.

- **2026-09-13** — Recorded scope decisions: benchmark-question changes, malformed-artifact checks,
  and run-directory protection were not retained; run files are managed manually. Infrastructure
  error categorization within action observations and persistent manual-label import remain deferred.

### Added

- **2026-09-11** — Added the saved-run evaluation command and report writer. The new `make evaluate`
  target accepts the selected model condition and repetition, loads the committed benchmark,
  interactions, complete candidate results, and saved golden-result JSON files, and runs the
  deterministic evaluator and focused metrics calculator without calling Athena or SQLite. It
  writes `results.json`, `summary.json`, and `summary.md` under the selected run's evaluation
  directory. The Markdown report includes percentages together with raw fractions, trajectory and
  error-response counts, separate ambiguity/interactive/safety sections, and by-difficulty
  results. Added filesystem-mocked Jest coverage and updated the experiment and evaluation
  documentation.

- **2026-09-10** — Added the pure in-memory run metrics calculator for the focused trace-aware
  analysis. It reports auditable numerator/denominator/rate values for final success, clean direct
  success, their gap, recovered-success contribution, recovery, clarification, interactive turns,
  and descriptive no-query behaviour; separates execution-error and semantic-revision recoveries;
  produces mutually exclusive error-response counts plus episode-level observation-conditioned
  recovery; and provides bounded by-difficulty summaries. Safety compliance remains manually
  labelled, zero denominators produce `null`, and operational metrics are not promoted into the
  formal study. Added focused Jest coverage and aligned the evaluation plan and design documents.

- **2026-09-09** — Added the in-memory run evaluator that loads saved interactions, groups them by
  session, verifies benchmark coverage and interactive turns, and returns results in benchmark
  order. It trusts the runner-owned question, model, repetition, and session metadata rather than
  duplicating defensive validation. It routes executable, ambiguity, and safety cases through their
  existing evaluators. Missed ambiguity cases retain clarification evidence but are not compared
  with a scripted interpretation the user never supplied. Added focused Jest coverage without
  filesystem fixtures and updated the evaluation documentation.

- **2026-09-07** — Added deterministic clarification evaluation from ordered `ASK_USER` and SQL
  trace events, including appropriate, unnecessary, missed, and not-applicable states plus scripted
  reply and fallback facts. Added a separate safety evidence builder that exports final answers and
  every SQL attempt for bounded manual labeling. `noQueryObserved` remains an automated descriptive
  fact and is no longer treated as an automatic safety verdict, allowing composite safety prompts
  with legitimate read-only subtasks to be assessed correctly. Added focused Jest coverage and
  updated the experiment and evaluation documentation. Consolidated the benchmark/episode options,
  matching-question validation, object guard, and SQL-invocation parsing after confirming that each
  appeared in at least three consumers.

- **2026-09-07** — Added in-memory episode evaluation that coordinates the existing attempt,
  error-transition, trajectory-fact, and classification components. Standalone and resolved
  ambiguity interactions are evaluated as one SQL trajectory, while interactive authored turns are
  evaluated separately against their corresponding golden definitions. Failed-only episodes need
  no candidate-result files; successful attempts retain fail-closed artifact handling. Added Jest
  coverage for direct success, repeated execution failure, recovery, missing successful artifacts,
  fallback and scripted continuations, interactive turns, and deferred safety evaluation. Verified
  the complete path against Nova Lite repetition 1 `CB200-H004`, preserving all 23 failed attempts
  and classifying the episode as `UNRECOVERED_EXECUTION_FAILURE`.

- **2026-09-05** — Added deterministic SQL-trajectory fact derivation and mutually exclusive
  classification. Attempt evaluations are ordered within one SQL-required evaluation unit to
  distinguish direct success, execution-error recovery, semantic revision, terminal semantic
  failure, unrecovered execution failure, no SQL, and system error. Trace completeness and result-
  evaluation completeness are recorded separately, and either incomplete condition fails closed.
  The builder also detects regression after an earlier correct result and auditable redundant SQL
  actions such as unchanged retries and actions after correctness. Exceeding the prompt's one-retry
  limit is recorded separately as `retryPolicyExceeded`, without automatically treating changed
  multi-step correction as redundant. Failed attempts are evaluated from the JSONL interaction and
  require no candidate-result file. Added focused Jest coverage; clarification, safety,
  aggregation, and reporting remain separate later phases.

- **2026-09-04** — Added the first deterministic evaluator stages. The evaluator reads each run's
  `interactions.jsonl`, groups interactions into session-based episodes, preserves nested trace
  ordering, and loads the saved golden and candidate JSON artifacts without reading SQLite. Result
  comparison supports positional aliases, ordered or unordered multiset rows, exact integer and
  tolerant numeric comparison, NULLs, and Athena timestamps. Each recorded SQL attempt is now
  classified independently as correct, semantic error, execution error, or evaluator-uncertain.
  The seven Trino-style execution-error prefixes observed across the saved Nova Lite and Haiku
  runs are normalized into stable study-specific signatures; unobserved prefixes remain identifiable
  as `OTHER:<original_code>`. These are documented separately from AWS Athena's official numeric
  error types. Failed observations are correlated with subsequent SQL attempts and outcomes using
  trace IDs and sequence order. This
  records changed or unchanged retries, repeated errors, resolved errors, newly introduced errors,
  and missing retry observations without interpreting rationale text. Added focused Jest coverage
  and verified the implementation against a saved Haiku recovery. Trajectory classes, aggregate
  metrics, and reports remain pending.

- **2026-08-31** — Added a dedicated Claude Haiku 4.5 conversational-agent template that preserves
  the existing stack's resource identities and semantic configuration but uses the EU Haiku
  inference profile and only `Temperature: 0`. Omitting `TopP` resolves Haiku's validation failure
  because the model does not allow `temperature` and `top_p` together. The Haiku template advances
  the same live alias to revision `v8`; the Nova template remains available for switching the same
  stack back to the baseline condition.

- **2026-08-22** — Corrected benchmark-runner clarification detection to use Bedrock's documented
  orchestration `ASK_USER` observation rather than expecting an `AMAZON.UserInput` invocation.
  Ambiguity and unnecessary-clarification continuations now follow the runtime trace shape emitted
  by the deployed agent. Clarification-only interactions intentionally have no candidate-result
  file because no Athena query was executed. Added the optional `QUESTION_ID` filter for isolated
  diagnostic execution and a fixed five-second delay between benchmark episodes; formal
  repetitions remain unfiltered complete runs.

- **2026-08-21** — Implemented the TypeScript Chinook-Bench-200 question runner. It executes all
  benchmark cases sequentially through the local server, uses a fresh session per case, preserves
  sessions for scripted ambiguity continuations and interactive turns, sends the frozen fallback
  once after unnecessary standalone clarification, and handles safety/OOD cases without adding a
  continuation. Successful SQL observations are correlated with their original Athena
  query-execution IDs and their complete paginated results are saved under the model/repetition
  run directory. After each episode, its records are appended individually to
  `interactions.jsonl`, so completed work remains inspectable after cancellation, with sensitive
  agent IDs, aliases, and versions removed from copied traces. This append-only output does not
  provide pause or resume functionality. Added `make execute` with `MODEL` and
  `REPETITION` variables, plus Jest coverage for execution policies, trace inspection, result
  capture, result writing, and sequential failure reporting. Cancelled runs are
  intentionally discarded rather than resumed.

- **2026-08-20** — Added the first experiment-tooling stage under `src/experiments`. The
  TypeScript golden-result generator loads the committed Chinook-Bench-200 JSON, builds all 190
  executable definitions, resolves interactive placeholders from preceding golden results,
  retrieves complete paginated Athena results, and writes JSON reference files under
  `src/experiments/runs/golden-sql`. Stateless responsibilities use named static classes so the
  execution flow is explicit, while `AthenaService` owns the AWS client. Added root Make targets
  for local services, golden generation, experiment tests, and type-checking, together with focused
  Jest coverage. Athena access is isolated under `shared/services/athena`, while golden-result
  orchestration and writing live under `src/experiments/golden-results`. The evaluator remains
  pending.

- **2026-08-12** — Added Chinook-Bench-200, a machine-readable benchmark with exactly 200 question
  turns across 195 cases: 50 easy, 60 medium, 50 hard, 20 ambiguity, 10 interactive turns, and 10
  safety questions. The machine-readable JSON and human-readable Markdown versions include
  canonical Athena
  SQL for executable questions and explicit clarification/refusal targets when SQL must not run.
  The benchmark now exposes 190 executable golden definitions: 160 standalone queries, 10
  interactive turns, and 20 resolved ambiguity continuations. Expanded the evaluation methodology
  with gold-query review, result-equivalence rules, first/final execution accuracy, recovery,
  conversational and clarification metrics, experimental controls, and peer-reviewed
  methodological references.

- **2026-08-11** — Added ordered Bedrock agent-trajectory capture to transcript persistence and
  successful chat API responses. Each interaction stores normalized model, rationale, invocation,
  observation, guardrail, failure, usage, and
  latency trace fields together with a sanitized copy of each AWS trace part. Prompt text, raw
  model responses, repeated session IDs, and caller ARNs are excluded by default; complete raw
  events are available only through the explicit
  `STORE_RAW_AGENT_TRACES=true` research setting. Trace rows commit atomically with their parent
  interaction and retain agent alias/version information so draft and deployed runs can be
  distinguished. An indexed `session_id` on every trace row supports direct retrieval of the
  complete trajectory across all interactions in a session.

- **2026-08-08** — Implemented local SQLite transcript persistence for research-data collection.
  The backend now stores one transactional record per Bedrock interaction, including the question,
  answer, UTC timing, token usage, agent and retry metrics, SQL attempts, success or failure state,
  reproducibility metadata, and pending evaluation fields. Successful records are committed before
  the API returns; Bedrock failures are retained on a best-effort basis. Repository logs identify
  the database path and committed interaction without printing transcript content, and runtime
  database/WAL files are excluded from Git.

- **2026-08-07** — Added a formal research and benchmark plan covering the revised research
  question and hypotheses, experimental conditions, a proposed 24-case benchmark, ground-truth
  preparation, SQL/recovery/final-answer scoring, operational metrics, an optional blinded utility
  study, the formal run protocol, a suggested result-record schema, and threats to validity. H2 is
  narrowed to observed latency and cost rather than untested scalability, while H3 compares
  first-attempt SQL quality with recovery and end-to-end outcomes.

- **2026-08-07** — Added SQL-attempt observability to successful API responses. The backend now
  correlates Bedrock action inputs and observations by trace ID and returns each generated SQL
  statement, its attempt number, success/failure state, and Athena diagnostic. Agent metrics now
  include retry count and whether the first attempt succeeded. The chat presents this information
  in an expandable SQL-attempt panel so corrected final answers do not conceal failed first
  attempts.

- **2026-08-06** — Added a deferred conversation-storage design. It proposes SQLite for the
  current single-process research application, session and interaction records, UTC timestamps,
  millisecond durations, response and agent metrics, failure retention, reproducibility metadata,
  indexes, privacy considerations, and deployment limits of the local SQLite approach.

- **2026-08-06** — Added Bedrock trace-derived response metadata. Successful backend responses now
  include the reported foundation model, input/output/total token usage, unique orchestration
  steps, model invocations, and action invocations. Corresponding frontend types and response
  metadata displays were added.

- **2026-08-05** — Added the standalone Angular frontend and its local integration with the
  Express API. This included routing to the chat screen, an HTTP client, Angular Material, shared
  response types, and CORS support in the backend.

- **2026-08-04** — Added the local Express-to-Bedrock runtime path. The backend validates the
  question and session ID, invokes the configured Bedrock Agent alias with tracing enabled,
  aggregates streamed completion events, and returns a typed response to the frontend.

- **2026-08-02** — Documented the deployment and runtime failures encountered during the first
  Bedrock Agent rollout, their causes, and the applied IAM and orchestration fixes. Added the first
  exploratory Nova Lite end-to-end experiment, including successful Athena actions, ambiguity and
  response-compliance observations, and the final malformed date query.

- **2026-07-28** — Added the deployable conversational-query stack in
  `infra/conversational-query-agent.yaml`. The SAM/CloudFormation template
  provisions:

    - an Amazon Bedrock Agent and deployable alias;
    - a TypeScript Lambda action for executing Athena queries;
    - the Lambda and Bedrock IAM roles and invocation permission; and
    - environment variables connecting the Lambda to the existing Glue database,
      Athena workgroup, and S3 result location.

- **2026-07-28** — Added the TypeScript Athena action under `src/lambda/`. The
  implementation is separated into query extraction, read-only SQL validation,
  Athena execution, result collection, response formatting, shared types, and the
  Lambda handler. Athena results are collected across result pages, capped at the
  configured row limit, and returned with column names, row count, the executed
  SQL, and a truncation indicator.

- **2026-07-28** — Added repository-wide development tooling:

    - ESLint with TypeScript support;
    - Prettier using the project's four-space formatting style;
    - Husky for Git hooks; and
    - lint-staged to lint and format only files staged for a commit.

    The pre-commit hook applies ESLint and Prettier automatically. The same checks
    can be run manually with `npm run lint` and `npm run format:check`.

- **2026-07-26** — Completed the AWS infrastructure for querying the Chinook
  Parquet dataset. The CloudFormation template creates the Glue Data Catalog
  database and crawler, its IAM role, and the Athena workgroup.

    The template is based on AWS Samples'
    [`cur2-glue-athena-integration.yml`](https://github.com/aws-samples/sample-conversational-athena-query-agent/blob/main/deployment/cur2-glue-athena-integration.yml).

    Create or update the stack with the template's default parameter values:

    ```sh
    aws cloudformation deploy \
      --template-file infra/athena.yaml \
      --stack-name chinook-athena \
      --capabilities CAPABILITY_IAM
    ```

    After the stack has been created, start the Glue crawler once to populate the
    Data Catalog:

    ```sh
    aws glue start-crawler --name chinook-athena-chinook
    ```

- **2026-07-25** — Initialized the repository and uploaded the Chinook database
  files to the `s3://msc-analytics/chinook/` bucket using
  `scripts/db-upload.sh`:

    ```sh
    cd scripts
    bash db-upload.sh
    ```

    Data source: [PRQL/chinook](https://github.com/PRQL/chinook).

- Added this changelog to track project changes.

### Changed

- **2026-08-17** — Completed the Chinook-Bench-200 projection-alignment review. Eighty-three
  executable questions and ten ambiguity-resolution replies now explicitly request every field in
  their unchanged golden result contract, without making incidental golden-query ordering part of
  unordered questions.

- **2026-08-17** — Strengthened the Bedrock agent's post-execution fidelity rules. Successful
  action results are now authoritative: presented rows must use returned values and order, subsets
  must be labelled, and the final `Executed SQL` must copy the action's query exactly rather than
  reconstructing or correcting it. Bumped the default alias revision so deployment publishes the
  updated instruction.

- **2026-08-17** — Tightened Chinook-Bench-200's ordered-result contracts. Thirty-five ordered
  questions, ambiguity replies, and interactive turns now state their required output fields,
  primary ordering, and deterministic secondary tie-breaks. CB200-C002's second turn now returns
  only the requested album count instead of repeating the artist identifier and name.

- **2026-08-17** — Replaced the earlier broad evaluation methodology with the finalized
  trajectory-aware protocol. The document now makes the final-to-direct success gap the primary
  estimand, defines terminal-attempt and trajectory-class rules, separates execution-error recovery
  from semantic revision, adds observation-to-action error metrics and paired-model trajectory
  analysis, and bounds manual validation. It retains the current benchmark comparison contracts,
  treats `acceptedSlots` as unimplemented metadata, and removes natural-language answer and LLM
  judge scoring from the current study scope.

- **2026-08-16** — Repaired the Chinook-Bench-200 evaluation contract after the model-facing
  preview cap was separated from SQL semantics. Removed all 51 arbitrary `LIMIT 200` clauses,
  made the price-listing question's expected projection explicit, and changed the co-purchase
  question to explicitly request the retained top 20. Every executable record and interactive
  turn now declares its required columns, row/column ordering, duplicate, tolerance, semantic
  limit, and tie behavior. All 20 ambiguity cases now include accepted clarification slots, a
  frozen scripted reply, resolved golden SQL, and a resolved comparison contract. The JSON export
  is now a valid array generated with the Markdown representation from canonical JSON, with a
  validation command to prevent drift. Because the gold SQL changed and 20 resolved queries were
  added, all 190 executable query definitions must be run against the frozen Athena snapshot
  before the formal experiment.

- **2026-08-16** — Removed the agent instruction that added `LIMIT 200` to every detail listing,
  because that changed query semantics and could invalidate complete-result benchmark comparisons.
  The Athena action now treats 200 rows strictly as the model-facing preview cap and returns
  `queryExecutionId`, `previewRowCount`, and `previewTruncated`. The evaluator can use the execution
  ID to paginate the complete original Athena result and compare it with the cached complete gold
  result. The agent prompt now states that Glue/Athena infrastructure is preconfigured, prohibits
  infrastructure clarification questions, and limits clarification to materially different
  interpretations of the user's analytical intent. The benchmark runner policy records unexpected
  clarification, sends one frozen fallback, and reports fallback-assisted success separately from
  clean direct success.

- **2026-08-11** — Extracted Bedrock completion-stream interpretation from `BedrockAgentClient`
  into `BedrockResponseProcessor`. Trace normalization and sanitization, token and agent metrics,
  foundation-model detection, SQL-attempt correlation, and answer decoding now have a dedicated
  owner; the client is limited to invoking Bedrock, timing the call, persisting the interaction,
  and returning the processed response.

- **2026-08-07** — Migrated the Athena action group from an OpenAPI `ApiSchema` contract to
  function details with `FunctionSchema`. Lambda event extraction and response formatting now use
  function parameters and `functionResponse`. Validation and Athena errors return
  `responseState: REPROMPT`, allowing the model to receive the concrete diagnostic and perform the
  single correction attempt already defined by the agent policy.

- **2026-08-07** — Made agent publication explicit through `AgentAliasRevision`. Changing this
  parameter forces the deployable alias to publish and route to a new immutable agent version
  while normally preserving the agent and alias IDs. CloudFormation now outputs the agent ID,
  alias ID, and configured foundation-model ID, and the README documents output retrieval and
  `.env` configuration. This separates the playground's `TSTALIASID`/`DRAFT` path from the
  numbered version used by the application.

- **2026-08-07** — Enabled Bedrock's built-in `AMAZON.UserInput` action. Material ambiguity now
  produces a clarification response in the chat and waits for the user's next message in the same
  session instead of sending clarification text to the SQL Lambda.

- **2026-08-07** — Revised the custom orchestration prompt to require Bedrock-native structured
  tool invocation and prohibit textual action-call output. The manually serialized
  `<function_call>` example was removed. Cross-model evaluation guidance now keeps semantic
  instructions equivalent without requiring one model family's prompt/tool serialization for
  Nova, Haiku, and Sonnet.

- **2026-08-06** — Rebuilt the frontend as a responsive chat application. It retains all questions
  and answers in the current view, timestamps every message, keeps the composer at the bottom,
  displays the session ID and agent-response metrics, provides suggested questions and loading/error
  states, and submits the actual textarea value rather than a hard-coded development question.

- **2026-08-06** — Added Material light and dark themes with a toolbar toggle. The selected theme
  is saved in browser `localStorage`, restored on startup, and applied across responsive desktop
  and mobile layouts. The successful SQL-attempt badge uses a brighter dark-theme treatment for
  readability.

- **2026-08-06** — Added a repository-level development launcher using `concurrently`, allowing
  the backend and frontend development servers to start and stop together with `npm start`.

- **2026-07-28** — Updated the README deployment guide with prerequisites,
  dataset upload and verification, Athena stack deployment, Glue crawler startup,
  and agent stack deployment. The infrastructure remains split into two
  CloudFormation stacks: `chinook-athena` for Glue/Athena and a separately named
  SAM stack for the Lambda and Bedrock Agent.

- **2026-07-28** — Configured the Lambda bundle to remain readable. SAM now builds
  unminified CommonJS output and does not generate source maps. This makes the
  deployed JavaScript easier to inspect, at the cost of a somewhat larger
  artifact and stack traces referring to bundled JavaScript rather than original
  TypeScript line numbers.

- **2026-07-28** — Replaced the compile-time `HttpCode` const enum with an
  `as const` object. HTTP codes now remain visible as a normal runtime object and
  work consistently with esbuild's isolated TypeScript transpilation.

- **2026-07-28** — Refactored Athena result collection to use an explicit
  pagination loop and a dedicated row-formatting function. The revised flow
  names the remaining capacity and truncation conditions directly while
  preserving header removal, pagination, row limits, and `NextToken` handling.

### Fixed

- **2026-08-07** — Diagnosed and corrected the deployed-agent version mismatch. The Bedrock
  playground used `TSTALIASID` and the current `DRAFT`, while the UI invoked a live alias still
  pointing to an older immutable action contract. The explicit alias-revision deployment process
  now makes publishing configuration changes deliberate and verifiable.

- **2026-08-07** — Removed an intermittent action-call leak in which Bedrock returned redacted
  text resembling `<REDACTED>__<REDACTED>(query=...)<REDACTED>` instead of invoking the Lambda.
  The model had imitated the prompt's serialized function-call example rather than emitting a
  structured `toolUse` event.

- **2026-08-07** — Fixed an expensive clarification loop that generated approximately 30 failed
  action attempts. Without the built-in user-input action, the model placed a clarification
  sentence in the query parameter; Lambda rejected it, and `REPROMPT` repeated the cycle. The
  user-input action now returns the clarification to the application without invoking Lambda or
  Athena.

- **2026-08-07** — Preserved visibility into SQL-generation failures after enabling recovery.
  First-attempt correctness, retries, and corrected SQL are now returned to the application rather
  than requiring manual CloudWatch investigation.

- **2026-08-06** — Fixed the chat client replacing prior responses and sending a hard-coded
  “most popular genre” query. Submitted questions and corresponding answers are now appended to
  the conversation, and Enter/Shift+Enter behaviour matches a conventional chat composer.

- **2026-08-02** — Updated the Bedrock Agent role for EU inference-profile invocation, replaced
  Nova Lite's failure-prone default orchestration prefill with a deterministic prompt override,
  and separated `s3:GetBucketLocation` from prefix-conditioned `s3:ListBucket` so Athena can verify
  its output bucket.

- **2026-07-28** — Documented and verified the complete SAM build and deployment
  sequence:

    ```sh
    npm --prefix src/lambda install

    PATH="$PWD/src/lambda/node_modules/.bin:$PATH" \
        sam build --template-file infra/conversational-query-agent.yaml

    sam deploy \
        --template-file .aws-sam/build/template.yaml \
        --guided
    ```

    `npm --prefix src/lambda install` installs the Lambda's dependencies beside
    its `CodeUri`. However, installing `esbuild` locally does not automatically
    add `node_modules/.bin` to the interactive shell's executable search path.
    Prefixing `PATH` for the build command exposes that local executable to the
    SAM `NodejsNpmEsbuildBuilder` without requiring a global installation.

    A successful build writes the transformed deployment template to
    `.aws-sam/build/template.yaml`. Passing that path explicitly to
    `sam deploy` prevents SAM from falling back to a nonexistent `template.yml`
    in the repository root, which was the second error seen after the original
    build failed.

- **2026-07-28** — Corrected numeric environment-variable defaults for the Athena
  row limit and query timeout. The fallback is now applied before conversion with
  `Number`, avoiding a nullish-coalescing expression whose left side could never
  be null or undefined.

### Removed
