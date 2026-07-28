# MSC research: conversational Chinook analytics

The infrastructure is split into two AWS CloudFormation templates. The agent
template uses the AWS SAM transform to build its TypeScript Lambda:

- `infra/athena.yaml` creates the Glue catalog, crawler, and Athena workgroup.
- `infra/conversational-query-agent.yaml` creates an Amazon Bedrock Agent using
  Amazon Nova, plus its Athena action Lambda and deployable agent alias.

## Deploy

Upload the dataset and deploy `infra/athena.yaml` first. Run its Glue crawler once so
that the Chinook tables exist. Then build and deploy the agent from the repository
root:

```bash
npm --prefix src/lambda install
sam build --template-file infra/conversational-query-agent.yaml
sam deploy --guided
```

For `AthenaWorkGroupName`, use the `AthenaWorkGroup` output from the Athena stack.
The other defaults match `infra/athena.yaml`; override them if that stack was
deployed with different parameter values.

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
