# Bedrock agent trace storage

> **Current study scope:** this page describes backend capture and possible uses of trace data.
> Formal evaluation reads the runner's sanitized traces in `interactions.jsonl` and complete JSON
> result files, not the SQLite tables. It scores SQL execution trajectories and result agreement;
> rationale quality, general answer faithfulness, cost and latency are not formal study outcomes.

## Purpose and terminology

The backend enables tracing on every `InvokeAgent` request and stores the trace parts returned by
Amazon Bedrock alongside the corresponding transcript interaction. These events make the agent's
observable trajectory available for debugging and research: model-invocation metadata, exposed
orchestration rationale, action selection, action inputs, action observations, failures,
guardrails, and final-response steps.

This data must not be described as the foundation model's complete internal chain of thought.
Bedrock exposes an agent-level `rationale` and orchestration trace, but that rationale is a
generated, observable justification and is not evidence of every internal model computation or a
faithful causal explanation. In research outputs, use terms such as **agent trajectory**,
**Bedrock-exposed rationale**, and **orchestration trace**.

AWS reference documentation:

- [Track the agent's step-by-step reasoning using trace](https://docs.aws.amazon.com/bedrock/latest/userguide/trace-events.html)
- [OrchestrationTrace API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_OrchestrationTrace.html)
- [InvokeAgentCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-bedrock-agent-runtime/Class/InvokeAgentCommand/)

## Capture flow

`BedrockAgentClient` sends `enableTrace: true`, while `BedrockResponseProcessor` owns all
completion-stream interpretation. The processor decodes the answer, derives token usage and agent
metrics, correlates SQL attempts, and assigns each `TracePart` an interaction-local sequence number
and stage/event classification. The complete ordered collection is returned in the API's
`traceEvents` field and passed to `TranscriptRepository` by the client.

The repository inserts the parent interaction first and then inserts all trace rows using that
interaction ID. The interaction and trace rows share one SQLite transaction, so they either commit
or roll back together.

Supported stages are `PRE_PROCESSING`, `ORCHESTRATION`, `POST_PROCESSING`,
`ROUTING_CLASSIFIER`, `GUARDRAIL`, `FAILURE`, `CUSTOM_ORCHESTRATION`, and `UNKNOWN`. The
`UNKNOWN` value retains forward-compatible AWS variants. Event classifications are `MODEL_INPUT`,
`MODEL_OUTPUT`, `RATIONALE`, `INVOCATION`, `OBSERVATION`, `GUARDRAIL`, `FAILURE`, and `UNKNOWN`.

## Database schema

Each row in `trace_events` belongs to one `interactions` row and contains:

| Column                                        | Meaning                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `interaction_id`                              | Parent interaction foreign key                             |
| `session_id`                                  | Session ID for direct whole-session lookup                 |
| `sequence_number`                             | Original order in the Bedrock completion stream            |
| `trace_id`                                    | AWS trace-step identifier used to correlate related events |
| `event_time`                                  | Bedrock event timestamp in UTC                             |
| `stage`, `event_type`                         | Normalized classification                                  |
| `agent_id`, `agent_alias_id`, `agent_version` | Runtime identity, including draft versus deployed versions |
| `foundation_model`                            | Model reported for that invocation                         |
| `rationale`                                   | Bedrock-exposed orchestration rationale                    |
| `action_group`, `action_name`, `action_input` | Selected tool and its parameters                           |
| `observation`                                 | Parsed action result or other observation                  |
| `input_tokens`, `output_tokens`               | Per-model-invocation usage where reported                  |
| `model_latency_ms`, `action_latency_ms`       | Per-step latency where reported                            |
| `sanitized_event`                             | Sanitized JSON representation of the complete trace part   |
| `raw_event`                                   | Optional unsanitized JSON, disabled by default             |

The `(interaction_id, sequence_number)` pair is unique. Indexes support lookup by interaction,
session, AWS trace ID, and stage/event type. Deleting an interaction cascades to its trace events.

## Sanitization and raw storage

The default `sanitized_event` removes:

- `modelInvocationInput.text`, which can contain the complete system prompt, schema, prior
  messages, and tool results;
- `modelInvocationOutput.rawResponse`, which duplicates raw model output and may contain prompted
  reasoning text;
- `sessionId`, already represented by the parent interaction; and
- `callerChain`, which contains AWS account ARNs.

Structured rationale, action parameters, and action observations remain available because they are
the evidence required for trajectory and answer-faithfulness analysis. They can still contain user
or database content and must therefore be handled as research data.

Complete raw trace retention is opt-in:

```dotenv
STORE_RAW_AGENT_TRACES=true
```

Any value other than case-insensitive `true`, including an unset variable, leaves `raw_event`
`NULL`. Raw storage is intended only for controlled debugging or experiments. It substantially
increases duplication and can retain prompts, conversation history, tool results, AWS identifiers,
and other sensitive information.

## Querying traces

Inspect an interaction's ordered trajectory:

```bash
sqlite3 -header -column src/backend/data/transcripts.db \
  "SELECT sequence_number, stage, event_type, trace_id, rationale, action_name
   FROM trace_events
   WHERE interaction_id = 1
   ORDER BY sequence_number;"
```

Inspect the complete trajectory across all interactions in one session:

```bash
sqlite3 -header -column src/backend/data/transcripts.db \
  "SELECT interaction_id, sequence_number, stage, event_type, rationale, action_name
   FROM trace_events
   WHERE session_id = 'your-session-id'
   ORDER BY interaction_id, sequence_number;"
```

Find action observations for automated answer verification:

```bash
sqlite3 src/backend/data/transcripts.db \
  "SELECT interaction_id, observation
   FROM trace_events
   WHERE stage = 'ORCHESTRATION' AND event_type = 'OBSERVATION';"
```

Compare draft/test and deployed agent versions:

```bash
sqlite3 -header -column src/backend/data/transcripts.db \
  "SELECT agent_alias_id, agent_version, COUNT(*) AS events
   FROM trace_events
   GROUP BY agent_alias_id, agent_version;"
```

This distinction matters because the Bedrock console test alias is `TSTALIASID` and targets
`DRAFT`, while the application should normally use its configured deployed alias and immutable
agent version.

## Evaluation uses

The captured fields can support the following analyses. Only clarification, SQL attempts,
execution feedback and result correctness are used by the current evaluator:

- identify the rationale preceding correct and incorrect SQL;
- determine whether clarification occurred before a tool call;
- compare the first SQL attempt with retries and Athena diagnostics;
- verify final-answer claims against the exact action-observation rows;
- measure per-step model and action latency and token usage;
- locate guardrail or orchestration failures; and
- detect accidental mixing of draft and deployed experimental conditions.

If rationale quality is studied in future, it must be reported separately from outcome correctness. A plausible rationale
does not establish that the SQL, returned result, or final answer is correct. Deterministic result
checks remain primary; rationale analysis is diagnostic and explanatory.

## Retention and limitations

Define retention, access, redaction, and deletion rules before collecting participant data. Keep
raw traces disabled unless the research question requires them, and do not commit the SQLite
database or export trace content into ordinary logs.

Trace fields are controlled by the AWS service and can vary by model, agent stage, and SDK version.
Unknown variants are retained in sanitized form rather than discarded. A stream failure before
aggregation completes may prevent the partial in-memory trajectory from being attached to the
failure record; complete successful interactions are stored atomically.
