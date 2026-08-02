# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

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
