# Troubleshooting

## Bedrock Agent deployment and first invocation

The following failures were encountered while deploying and testing the conversational-query
agent in `eu-west-1` on 2 August 2026.

### Claude Haiku rejected the prompt inference configuration

**Symptom:** `InvokeAgent` failed before emitting trace events with a validation error stating that
`temperature` and `top_p` cannot both be specified.

**Cause:** The shared orchestration prompt configured both `Temperature: 0` and `TopP: 1`. Nova
accepted that combination, but Claude Haiku 4.5 permits only one of those sampling parameters.

**Fix:** Deploy `infra/conversational-query-agent-haiku.yaml` to the existing
`chinook-conversational-query-agent` stack. It retains `Temperature: 0` for deterministic
experiments and omits `TopP`, while preserving the action Lambda, IAM boundaries, prompt, schema,
and alias structure.

### Bedrock access denied before action invocation

**Symptom:** The agent playground reported `Access denied when calling Bedrock`, and the query
Lambda had no invocation logs.

**Cause:** The agent was changed from a direct model ID to an EU cross-Region inference profile,
but its role still constructed a `foundation-model` ARN from the profile ID. Invoking an inference
profile requires permission for both the selected `inference-profile` resource and the foundation
models to which it can route.

**Fix:** The agent role now grants `bedrock:InvokeModel` on the selected inference-profile ARN and
on regional foundation models only when `bedrock:InferenceProfileArn` matches that selected
profile. The Lambda permission was not the cause: the template already had a resource-based
`AWS::Lambda::Permission` allowing the Bedrock service principal to invoke the action Lambda.

### Nova Lite returned an invalid orchestration prediction

**Symptom:** The playground returned `Sorry, I am unable to assist you with this request.` The
trace reported `LLM prediction format incorrect`, and Lambda was not invoked.

**Cause:** The default Nova Lite orchestration prompt prefilled an incomplete thought beginning
with `Thought: <thinking>\n(1)`. Nova completed that thought and then began another `<thinking>`
block instead of emitting an action. A configured stop sequence stopped generation at the second
block, leaving no valid action or answer for the default parser.

**Fix:** The agent now overrides the orchestration prompt. It removes the partial-thought prefill,
requires one complete thought followed by one native action or answer, sets temperature to zero,
and raises the maximum response length to 2,048 tokens. The default Bedrock output parser remains
in use.

### A textual action call was returned as the answer

**Symptom:** The application displayed text resembling
`<REDACTED>__<REDACTED>(query="SELECT ...")<REDACTED>` instead of invoking the query action.
Short analytical questions, including the suggested UI questions, triggered the issue more
consistently than manually composed questions.

**Cause:** The custom orchestration prompt contained a manually serialized `<function_call>`
example. The model could imitate that example as response text instead of emitting a native
structured tool-use event. Bedrock then treated it as completion text and redacted internal action
identifiers. The UI correctly rendered the completion it received.

**Fix:** Remove serialized function-call examples from the prompt and require action invocation
through Bedrock's native structured tool interface. Keep the final-answer example because it does
not prescribe tool serialization. After deploying the prompt change, publish a new numbered agent
version and update the application alias; testing only `TSTALIASID` updates the playground draft.

This risk is not unique to Nova Lite. Prompt payload and tool-call conventions can differ between
model families. Formal comparisons should freeze equivalent semantic instructions while allowing
model-compatible serialization supplied by Bedrock. Every model condition requires a smoke test
that confirms actions appear as structured `toolUse` trace events rather than response text.

### Clarification looped through the SQL action

**Symptom:** One ambiguous question produced approximately 30 failed SQL attempts and unusually
high token usage. Each recorded “query” was actually a repeated clarification sentence, and the
validator returned `Only SELECT queries ...` every time.

**Cause:** The prompt instructed the agent to ask the user for missing information, but the agent
did not have Bedrock's built-in user-input action group. It placed the clarification sentence into
the only available action's `query` parameter. The Lambda correctly rejected the non-SQL text and
returned `REPROMPT`; the model then repeated the same invalid action until Bedrock stopped
orchestration. These were real Lambda action invocations but not Athena query executions.

**Fix:** Add an enabled action group with `ParentActionGroupSignature: AMAZON.UserInput`. A
clarification now becomes the assistant response for the current turn and waits for the user's next
message in the same session. It does not invoke the query Lambda and is not counted as a SQL
attempt.

### Athena could not verify the output bucket

**Symptom:** Bedrock reported `Received failed response from API execution`. Lambda logged an
Athena `InvalidRequestException` with `INSUFFICIENT_PERMISSIONS` and `Unable to verify/create
output bucket msc-analytics`.

**Cause:** `s3:GetBucketLocation` and `s3:ListBucket` shared a statement restricted by an
`s3:prefix` condition. `GetBucketLocation` does not supply that condition key, so IAM denied the
bucket verification request.

**Fix:** `s3:GetBucketLocation` is now an unconditional bucket-level permission. `s3:ListBucket`
remains restricted to the exact data and Athena-results prefixes and their descendants. Object
read/write permissions remain scoped to their respective prefixes.

### Athena rejected model-generated date syntax

**Symptom:** Lambda logged `MALFORMED_QUERY: Queries of this type are not supported`, and the
agent did not answer the user's question.

**Cause:** Nova Lite generated MySQL-style date arithmetic:

```sql
DATE_SUB(CURRENT_DATE, INTERVAL 3 YEAR)
```

Athena's Trino/Presto SQL dialect does not support that form. An appropriate expression is:

```sql
date_add('year', -3, current_date)
```

This is currently a model SQL-correctness failure, not a deployment failure. The action returned
an error as designed, but the agent did not perform the single corrective retry requested by its
instructions. The first observed instance is recorded in the exploratory experiment below.
