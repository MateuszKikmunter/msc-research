# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

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
  indexes, privacy considerations, and migration criteria for PostgreSQL or DynamoDB.

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
