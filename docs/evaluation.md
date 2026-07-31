# Evaluation methodology

## Research objective

Evaluate how reliably a conversational Bedrock Agent translates natural-language analytical
questions into safe, correct Athena queries and faithful explanations over the Chinook dataset.

## Research questions

1. How often does the agent produce executable and semantically correct SQL?
2. How often is the final natural-language answer supported by the query result?
3. Does the agent ask for clarification when ambiguity materially changes the answer, without
   over-clarifying straightforward requests?
4. Does the safety boundary reject non-read-only requests and adversarial prompt content?
5. What latency and cost trade-offs result from model choice and optional retrieval?

The model comparison will evaluate three conditions: Nova Lite as the cost-effective AWS-native
baseline, Claude Haiku 4.5 as the cost-effective Anthropic alternative, and Claude Sonnet 4.5 as
the higher-capability comparison. Published positioning motivates these choices but is not
evidence that any model will outperform another on this task.

The comparison should answer both whether model capability improves correctness and whether any
improvement justifies its latency and monetary cost. Report all three models independently; do
not collapse Haiku and Sonnet into a single Claude condition.

## Benchmark categories

Create reviewed cases across these categories:

| Category            | Example intent                                         | Main risk                      |
| ------------------- | ------------------------------------------------------ | ------------------------------ |
| Single-table lookup | List genres                                            | Unnecessary complexity         |
| Filter and sort     | Longest tracks in a genre                              | Wrong units or ordering        |
| Aggregation         | Revenue by billing country                             | Wrong revenue definition       |
| Multi-hop join      | Top artists by units sold                              | Missing or duplicating joins   |
| Time analysis       | Monthly revenue for a stated year                      | Date boundaries and grouping   |
| Null handling       | Customers without a company                            | Incorrect null predicate       |
| Ambiguity           | "Who are our best customers?"                          | Guessing the meaning of "best" |
| Empty result        | Sales for a deliberately unmatched filter              | Fabricating an answer          |
| Safety              | Request to delete or create a table                    | Unsafe SQL/tool invocation     |
| Adversarial         | Instruction embedded in user text or retrieved content | Prompt injection               |

For each case, store the user question, whether clarification is required, an accepted SQL form
or semantic rubric, expected result derived independently, and explanation criteria. Avoid a
benchmark composed only of examples already present in the agent instruction or Knowledge Base.

## Metrics

### Query metrics

- **Execution success:** Athena completes the query.
- **Semantic SQL correctness:** joins, filters, aggregation grain, date bounds, null handling, and
  metric definition match the reference intent.
- **Result correctness:** returned values match independently generated expected results.
- **Safety compliance:** unsafe requests do not result in an Athena execution.
- **Efficiency indicators:** tool-call count, retries, query duration, and bytes scanned where
  captured.

Execution success alone is not correctness: a valid query can answer the wrong question.

### Conversation metrics

- **Answer faithfulness:** every factual claim is supported by the returned rows or approved
  contextual documents.
- **Completeness:** the answer addresses the requested dimensions and units.
- **SQL disclosure:** the executed SQL is included as required.
- **Clarification precision:** proportion of truly ambiguous cases in which clarification occurs.
- **Clarification overuse:** proportion of unambiguous cases unnecessarily delayed by a question.

### Operational metrics

Measure end-to-end latency using consistent start and stop points. Record model invocations,
Athena bytes scanned, Lambda duration, errors, and retry count where available. Calculate cost
from contemporaneous AWS pricing and record the pricing date and region rather than hard-coding
prices in this document.

## Scoring procedure

TBD

## Threats to validity

- Chinook is small and clean, so results may not generalize to large enterprise schemas.
- A benchmark authored after observing agent failures can overfit subsequent prompts.
- Model behavior and managed-service implementations can change over time.
- Reusing a session can leak earlier schema or corrections into later cases.
- Human SQL rubrics can accept or reject alternative but equivalent queries inconsistently.

Mitigate these risks with versioned configurations, fresh sessions, held-out questions, repeated
runs, independently computed expected results, and complete experiment records.
