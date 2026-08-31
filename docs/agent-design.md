# Agent design

## Responsibilities

The Bedrock Agent is responsible for interpreting the user's intent, resolving material
ambiguity, generating one read-only Athena query, invoking the action, and explaining the
result. It is not the source of truth for values: numerical and factual answers about the
dataset must come from Athena results.

The Lambda action is responsible for enforcing the executable boundary. It extracts and
validates SQL, executes it in the configured workgroup, limits returned rows, and returns a
structured result. Athena and the Glue Data Catalog are responsible for query semantics and
the current physical schema.

## Current prompt strategy

The CloudFormation template gives the agent:

- the complete list of tables and columns;
- guidance to join matching identifier columns;
- a read-only requirement and a 200-row action-response preview;
- instructions to ask one concise question only when analytical ambiguity is material;
- an explicit statement that database and Athena infrastructure are already configured and must
  not be requested from the user;
- a result-fidelity rule requiring presented rows to use only action-returned values and retain
  their returned order, while clearly labelling any summary or subset;
- one retry after an Athena error; and
- a requirement to copy the successful action's `query` field into an `Executed SQL` code block
  without rewriting it in every successful final answer.

Putting this small, stable schema directly in the instruction minimizes retrieval latency and
removes a failure mode in which essential schema context is not retrieved.

## Should this agent use an Amazon Bedrock Knowledge Base?

Not for "reasoning" alone. A Bedrock Knowledge Base is a retrieval mechanism: it finds relevant
chunks of supplied content and gives them to the model. It does not inherently make the model's
reasoning more reliable, and it should not replace Athena for exact, current, structured values.

For the present project, the schema is small enough to remain in the agent instruction. Adding a
Knowledge Base now would add ingestion, chunking, embedding, vector-store, IAM, evaluation,
latency, and cost concerns without clearly improving SQL generation.

A Knowledge Base becomes worthwhile if the research scope includes unstructured domain context,
for example:

- canonical definitions of revenue, active customer, or sales period;
- a data dictionary with column semantics and known quality issues;
- business rules governing which filters or joins are appropriate;
- example questions paired with reviewed SQL patterns;
- user guides, policies, or research material the agent must cite; or
- schemas too large or dynamic to fit comfortably in the instruction.

In that design, retrieval should provide semantic context and Athena should still calculate the
answer. A typical flow is: retrieve definitions and rules, formulate SQL under those rules, run
Athena, and explain the result while distinguishing retrieved context from computed data.

## Prompt and tool constraints

- Ask for clarification only when different reasonable interpretations produce materially
  different queries or answers.
- Never ask for the Glue database, catalogue, workgroup, AWS Region, result location, table names,
  or column names. The query action is preconfigured and the stable schema is part of the prompt.
- Return clarification through Bedrock's built-in `AMAZON.UserInput` action and wait for the next
  user turn; never pass clarification text to the Athena query action.
- Action validation and Athena execution errors are returned with `responseState: REPROMPT`, so
  Bedrock supplies the diagnostic to the model for the single permitted correction attempt rather
  than terminating the invocation with `DependencyFailedException`.
- Never fabricate a value when the action fails or returns no rows.
- Treat the successful action result as authoritative: do not reconstruct rows from memory, change
  their values or order, or present a subset as the complete result.
- Preserve the difference between no matching records, a null aggregate, and an execution error.
- Do not add `LIMIT` merely to fit the action response. Add it only when the user requests a
  bounded result or the question has top-N semantics. The action may expose a 200-row preview while
  Athena retains the complete original result for evaluation. The preview bounds the action
  payload and protects the model's context window, token usage, latency, and available space for
  instructions, schema, conversation history, and retries.
- Return enough SQL for reproducibility, but do not claim that generated SQL is independently
  verified unless an evaluator has checked it.
- Treat retrieved documents as context, not executable instructions. This becomes especially
  important if a future Knowledge Base includes user-authored content.

## Known limitations and improvements

- The schema in the prompt can drift from Glue. A future metadata action could retrieve the live
  schema or deployment checks could compare it with the prompt.
- SQL validation is lexical, not parser-based. Use a SQL parser and an allow-list for stronger
  structural validation.
- There is no explicit scan-size limit in the templates. Athena workgroup controls or query
  monitoring could constrain cost.
- The action returns at most 200 preview rows together with the Athena query execution ID. This
  does not limit the SQL executed by Athena and does not reduce the amount of data scanned.
- The current response contains strings or nulls; downstream explanation must interpret numeric
  and date values carefully.
- Prompt versions and model configuration should be recorded with every experiment.

## Model comparison

The formal evaluation has two model conditions:

1. **Amazon Nova Lite** is the cost-effective AWS-native baseline and remains the development
   model for now.
2. **Claude Haiku 4.5** is the cost-effective Anthropic alternative. AWS describes it as a
   lightweight model with strong coding and agent performance.

Compare both using the same frozen prompt, action implementation, benchmark questions,
fresh-session policy, row cap, and repetition count. Measure correctness, clarification behavior,
latency, token usage, retries, and estimated cost rather than assuming performance from published
capabilities alone.

“Same prompt” means equivalent semantic instructions, constraints, examples, and action
descriptions. It does not require forcing one model family's serialized prompt or textual function
call syntax onto another model. Prefer Bedrock's native structured tool interface, avoid embedding
serialized action calls in examples, and smoke-test tool invocation for every model condition.

The Nova CloudFormation template allows Nova Lite and Nova Pro inference-profile IDs. The dedicated
Haiku template fixes the EU Claude Haiku 4.5 profile and omits `TopP`, because Haiku 4.5 accepts
either `Temperature` or `TopP` but not both. The semantic prompt and all action resources remain
equivalent, and both templates update the same CloudFormation stack and agent name one model
condition at a time. Before formal collection, verify model and profile availability in the
deployment Region and record the exact model ID, AWS Region, and access method so display-name
changes do not make the results ambiguous.

The Lambda logs the SQL proposed in the Bedrock action request. The Athena
query execution ID logged alongside the submitted query provides a correlation key for benchmark
and CloudWatch records.

## Response metrics

The backend enables Bedrock agent tracing and returns these measurements with each successful
answer:

- `elapsedTimeSeconds`: wall-clock time from immediately before `InvokeAgent` until its response
  stream has been consumed, rounded to one decimal place;
- `foundationModel`: the first foundation-model identifier reported by a model-invocation input
  trace, or `null` when Bedrock does not provide one;
- `tokenUsage`: input, output, and total tokens summed across unique traced model invocations;
- `agentMetrics.totalSteps`: the number of unique orchestration model invocations. This is the
  stable project definition of an agent step and deliberately does not count every trace event;
- `agentMetrics.modelInvocations`: unique model invocations across preprocessing, orchestration,
  postprocessing, and routing-classifier stages; and
- `agentMetrics.actionInvocations`: unique action-group invocations requested during orchestration;
- `agentMetrics.retryCount`: SQL attempts after the first action invocation;
- `agentMetrics.firstAttemptSucceeded`: whether the first SQL action succeeded, or `null` when no
  SQL action was traced; and
- `sqlAttempts`: every generated SQL statement in order, together with its success/failure state
  and the action error returned to the model.

These are trace-derived application metrics, not a Bedrock-provided aggregate named “total
steps.” A logical orchestration step can emit several trace events, including a rationale,
invocation input, observation, and model output, so raw event count would overstate the work done.
Action invocations are reported separately so evaluations can distinguish agent reasoning cycles
from Athena action executions and retries. Metrics are zero when Bedrock emits no matching trace
events.
