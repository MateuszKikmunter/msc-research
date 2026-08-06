# Future conversation storage

Conversation persistence is deferred. If the local Express backend remains a single-process
application, SQLite is an appropriate first store for transcripts and experiment measurements:
it is simple to operate, supports transactions, and can be queried directly during analysis.
It should be reconsidered if the backend is deployed with multiple concurrent instances or as
serverless functions; PostgreSQL or DynamoDB would avoid coordinating writes to one local file.

## Proposed schema

Use one record per request-response interaction rather than separate, duplicated question and
answer records:

- `sessions`: `session_id`, `created_at`, and optional experiment metadata;
- `interactions`: an auto-incremented `id`, `session_id`, `question`, `answer`, `started_at`,
  `elapsed_ms`, input/output/total tokens, agent metrics, `status`, and an optional error; and
- optionally `messages`: a role, content, and sequence number if the application later needs
  system/tool messages, multiple answers, or a transcript that is not strictly request-response.

Store timestamps in UTC, elapsed duration as integer milliseconds, and index `session_id` and
`started_at`. Record failures as well as successes. For reproducible experiments, each interaction
should also identify the model, AWS Region, agent alias/version, prompt version, and experimental
condition. Define retention and redaction rules before storing user-provided content or raw traces.

Bedrock's agent `sessionId` maintains conversational context for invocation, but it should not be
treated as the application's durable transcript or research-results store.
