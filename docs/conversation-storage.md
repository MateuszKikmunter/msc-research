# Conversation storage

The local Express backend persists every Bedrock request-response interaction to SQLite. This is
appropriate for the current single-user, single-process research application: it is simple to
operate, supports transactions, and can be queried directly during analysis. The database is
stored at `src/backend/data/transcripts.db` and is excluded from Git together with its WAL files.

`TranscriptRepository` creates the schema and indexes when the backend starts. It writes the
session and interaction in one transaction after the Bedrock completion stream has been
aggregated and before a successful response is returned to the HTTP caller. Bedrock failures are
also recorded when possible; a storage failure during that failure path is logged without
replacing the original Bedrock error.

The repository logs the database path when it is ready and logs the interaction ID, session ID,
and status after a successful commit. It deliberately does not print question or answer content.

## Schema

Use one record per request-response interaction rather than separate, duplicated question and
answer records:

- `sessions`: `session_id`, `created_at`, experiment name and condition, prompt version, agent ID,
  agent alias, AWS Region, and observed foundation model; and
- `interactions`: an auto-incremented `id`, `session_id`, `question`, `answer`, `started_at`,
  `elapsed_ms`, status and error, foundation model, input/output/total tokens, orchestration
  metrics, first-attempt outcome, serialized SQL attempts, and pending evaluation fields.

Timestamps use UTC ISO 8601 strings, elapsed duration uses integer milliseconds, and indexes cover
`session_id` and `started_at`. Boolean metrics use SQLite integers (`1`, `0`, or `NULL`), while SQL
attempts are JSON encoded.

Optional experiment metadata is read from `EXPERIMENT_NAME`, `EXPERIMENT_CONDITION`, and
`PROMPT_VERSION`. Agent ID, alias, and Region come from the existing Bedrock configuration.

## Verification

On startup, the backend should print a message similar to:

```text
Transcript database ready {
  databasePath: '/path/to/src/backend/data/transcripts.db'
}
```

After an interaction commits, it prints:

```text
Transcript interaction saved {
  interactionId: 1,
  sessionId: '...',
  status: 'succeeded'
}
```

Inspect the most recent records directly with the SQLite CLI:

```bash
sqlite3 src/backend/data/transcripts.db \
  "SELECT id, session_id, status, started_at, elapsed_ms FROM interactions ORDER BY id DESC LIMIT 10;"
```

## Boundaries and privacy

The database contains raw user questions and model answers. Before collecting participant or
production-derived data, define consent, retention, deletion, access-control, and redaction rules.
Do not commit the database to source control or include it in ordinary diagnostic logs.

SQLite should be reconsidered if the backend is later deployed with multiple concurrent instances
or as serverless functions; PostgreSQL or DynamoDB would avoid coordinating writes to one local
file. A separate `messages` table would also be preferable if the application later needs to store
system/tool messages, multiple candidate answers, or non-paired transcript events.

Bedrock's agent `sessionId` maintains conversational context for invocation, but it should not be
treated as the application's durable transcript or research-results store.
