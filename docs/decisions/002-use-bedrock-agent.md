# ADR 002: Use a Bedrock Agent with an Athena action group

- **Status:** Accepted
- **Date:** 2026-07-28
- **Last updated:** 2026-08-20

## Context

The project needs to translate natural-language questions into SQL, execute the SQL through a
controlled interface, and explain results. The language model must not receive broad AWS access or
be trusted as the only safety control.

## Decision

Use an Amazon Bedrock Agent backed by a selected supported foundation model and expose one
action-group operation,
`executeAthenaQuery`. Implement the action as a TypeScript Lambda that accepts a single SQL string,
applies read-only validation, executes it in the project Athena workgroup, and returns structured
results. Keep the small Chinook schema in the agent instruction.

Use exactly two model conditions in the formal evaluation: Amazon Nova Lite as the development
and AWS-native baseline, and Claude Haiku 4.5 as the Anthropic alternative. Deploy and run one
condition at a time. Keep the prompt, action contract, Lambda implementation, benchmark, session
policy, and repetition count fixed so that the foundation model is the experimental variable.

The deployment template may continue to allow Nova Pro and Claude Sonnet 4.5 for development or
future work, but they are not part of this formal evaluation.

Do not add an Amazon Bedrock Knowledge Base to the baseline architecture. Evaluate it separately
if the project introduces curated business definitions or other unstructured context.

## Consequences

- Model orchestration and tool invocation use a managed AWS interface.
- IAM and Lambda validation form boundaries outside the prompt.
- The executed SQL and returned rows can be retained for evaluation.
- The action contract is intentionally narrow and easier to audit.
- Agent behavior remains probabilistic and requires repeated benchmark runs.
- Supporting both evaluation conditions requires model-specific deployment and IAM configuration,
  while the action contract and data path remain common.
- The embedded schema can drift from Glue and must be maintained.
- Lexical validation is a pragmatic first boundary but should not be treated as a complete SQL
  security parser.
- Adding a Knowledge Base later must demonstrate improved correctness relative to its ingestion,
  retrieval, latency, and cost overhead.

## Alternatives considered

- **Call a foundation model directly and implement orchestration in application code:** gives more
  control and portability, but requires building the full tool loop and session behavior.
- **Place database contents in a Knowledge Base:** inappropriate for exact joins and aggregations;
  Athena should remain the computational source of truth.
- **Let the agent call Athena directly:** provides a broader and less auditable permission surface
  than the narrow Lambda action.
