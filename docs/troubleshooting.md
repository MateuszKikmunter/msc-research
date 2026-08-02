# Troubleshooting

## Bedrock Agent deployment and first invocation

The following failures were encountered while deploying and testing the conversational-query
agent in `eu-west-1` on 2 August 2026.

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
requires one complete thought followed by one action or answer, includes a valid query-action
example, sets temperature to zero, and raises the maximum response length to 2,048 tokens. The
default Bedrock output parser remains in use.

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
