# MSC research: conversational Chinook analytics

Design rationale, dataset semantics, experiment methodology, evaluation guidance, and
troubleshooting are maintained in [`docs/`](docs/README.md).

The infrastructure is split into two AWS CloudFormation templates. The agent
template uses the AWS SAM transform to build its TypeScript Lambda:

- `infra/athena.yaml` creates the Glue catalog, crawler, and Athena workgroup.
- `infra/conversational-query-agent.yaml` creates an Amazon Bedrock Agent using
  the selected supported foundation model, plus its Athena action Lambda and deployable agent
  alias. Nova Lite is the default; Nova Pro, Claude Haiku 4.5, and Claude Sonnet 4.5 are also
  allowed when available in the deployment Region.

## Run locally

Install the dependencies once:

```bash
npm install
npm --prefix src/backend install
npm --prefix src/frontend/analytics-pipeline-ui install
```

Then start the Express backend and Angular frontend together:

```bash
npm start
```

The launcher starts both development servers.
Press Ctrl+C once to stop both processes. The backend
runs at `http://localhost:8000` and the frontend at `http://localhost:4200`.

## Deploy

### Prerequisites

- Node.js and npm
- AWS CLI authenticated with the `aws your` profile
- AWS SAM CLI
- An existing `msc-analytics` S3 bucket in the deployment account

If you use a different AWS profile, bucket, or data prefix, update
`scripts/db-upload.sh` and supply the corresponding CloudFormation parameter
overrides when deploying the templates.

### 1. Upload the dataset

The `chinook/` directory contains one Parquet file per table. Run the upload script
from its own directory:

```bash
cd scripts
bash db-upload.sh
cd ..
```

The script uploads each file into a separate table prefix:

```text
s3://msc-analytics/chinook/albums/albums.parquet
s3://msc-analytics/chinook/artists/artists.parquet
s3://msc-analytics/chinook/tracks/tracks.parquet
...
```

You can verify the uploaded dataset with:

```bash
aws s3 ls s3://msc-analytics/chinook/ \
    --profile matt-dev \
    --recursive
```

### 2. Deploy Athena and discover the tables

From the repository root, deploy the Glue database, crawler, and Athena workgroup:

```bash
aws cloudformation deploy \
    --profile matt-dev \
    --template-file infra/athena.yaml \
    --stack-name chinook-athena \
    --capabilities CAPABILITY_IAM
```

Run the crawler after the stack deployment completes:

```bash
aws glue start-crawler \
    --profile matt-dev \
    --name chinook-athena-chinook
```

Wait for the crawler to finish before deploying or invoking the agent. It creates
the Glue tables used by Athena.

### 3. Build and deploy the agent

Install the Lambda dependencies, build the SAM application, and deploy it:

```bash
npm --prefix src/lambda install

PATH="$PWD/src/lambda/node_modules/.bin:$PATH" \
    sam build --template-file infra/conversational-query-agent.yaml

sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --guided
```

`AgentAliasRevision` controls publication through the deployable `live` alias. Increment it (for
example, from `v1` to `v2`) whenever an agent instruction, action schema, or other agent
configuration change must reach the application. Changing the revision updates the alias without
changing its ID and causes Bedrock to create and associate a new immutable agent version. The
playground's `TSTALIASID` continues to target `DRAFT` and must not be used as the deployed
application alias.

After deployment, retrieve the application identifiers from the stack outputs:

```bash
aws cloudformation describe-stacks \
    --profile matt-dev \
    --stack-name <agent-stack-name> \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentId` || OutputKey==`AgentAliasId`].[OutputKey,OutputValue]' \
    --output table
```

Copy the returned values into `.env`:

```dotenv
AGENT_ID=<AgentId output>
AGENT_ALIAS=<AgentAliasId output>
# Optional and discouraged for routine use; sanitized trace storage is always enabled.
STORE_RAW_AGENT_TRACES=false
```

The alias ID normally remains stable across revisions; the revision changes the numbered agent
version to which that alias routes. Restart the backend after editing `.env`.
Raw Bedrock traces can contain prompts, conversation history, tool results, and AWS identifiers.
Keep raw trace storage disabled unless a controlled experiment specifically requires it; see the
[agent trace storage documentation](docs/agent-trace-storage.md) for details.

For `AthenaWorkGroupName`, use the `AthenaWorkGroup` output from the Athena stack.
With the deployment commands above, its value is `chinook-athena-chinook`. The
other parameter defaults match `infra/athena.yaml`; override them if that stack was
deployed with different values.

`esbuild` is installed locally with the Lambda dependencies. Local npm
executables are not automatically available to commands run directly in the
shell, so the build command temporarily adds `src/lambda/node_modules/.bin` to
`PATH`. After the build succeeds, SAM writes the deployable template to
`.aws-sam/build/template.yaml`; passing that path to `sam deploy` avoids looking
for a source `template.yml` in the repository root.

SAM follows the function's `CodeUri` into `src/lambda/` and uses its
`BuildMethod: esbuild` metadata to compile and bundle `index.ts`. During deployment,
SAM uploads the artifact and replaces the local `CodeUri` with its packaged S3
location. The executable Lambda code remains in dedicated TypeScript files instead
of a CloudFormation `ZipFile`/`InlineCode` block.

To build the Lambda without deploying:

```bash
npm --prefix src/lambda run typecheck
npm --prefix src/lambda run build
```

## Code quality

Install the repository tooling once to activate the Husky Git hooks:

```bash
npm install
```

Before each commit, lint-staged automatically runs ESLint and Prettier against
the staged files. The same checks can be run manually across the repository:

```bash
npm run lint
npm run format:check
```
