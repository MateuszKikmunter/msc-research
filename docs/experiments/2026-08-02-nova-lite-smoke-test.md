# Nova Lite exploratory smoke test — 2 August 2026

## Status and scope

This was the first small end-to-end conversational experiment after the Bedrock Agent could
successfully invoke Athena. It is an exploratory smoke test, not a scored benchmark result: the
questions were improvised, one session retained conversation history, and expected answers were
not independently prepared before the run.

| Field                     | Value                                   |
| ------------------------- | --------------------------------------- |
| AWS Region                | `eu-west-1`                             |
| Agent ID                  | `WQOZNPBXRI`                            |
| Alias                     | working-draft test alias (`TSTALIASID`) |
| Model reported in trace   | `amazon.nova-lite-v1:0`                 |
| Temperature               | `0`                                     |
| Maximum output tokens     | `2048`                                  |
| Trace time for final turn | `2026-08-02T22:38:17Z`                  |

## Conversation observations

1. **“What is the most popular genre?”** Nova interpreted popularity as the number of tracks
   without asking for a metric. The query succeeded and returned Rock with 1,297 tracks.
2. **“And who is the best client?”** Nova interpreted best as the number of invoices, again
   without clarification. It returned Leonie Köhler with seven invoices.
3. **“Why he is the best? Can something else define him as the best customer?”** Nova changed the
   metric to total spending and returned Helena Holý with a total of 49.62. It did not address the
   mismatch between the user's pronoun and the previously named customer, and the metric change
   also changed the winning customer.
4. Further turns compared invoice count plus total spending, then average invoice value. Both
   actions succeeded and returned Helena Holý: seven invoices, total spending of 49.62, and an
   average invoice value of approximately 7.09.
5. **“What is her spending within the last 3 years?”** Nova preserved customer ID 6 from the
   session but submitted unsupported date syntax. Athena rejected the query, Nova did not retry
   with corrected SQL, and the user received no answer.

The successful responses also omitted the required `Executed SQL` block even though the agent
instruction asks for it. This is a response-compliance failure separate from SQL execution.

## Final failed query

Nova submitted:

```sql
SELECT
    c.customer_id,
    c.first_name,
    c.last_name,
    SUM(i.total) AS total_spent
FROM customers c
JOIN invoices i ON c.customer_id = i.customer_id
WHERE i.invoice_date >= DATE_SUB(CURRENT_DATE, INTERVAL 3 YEAR)
  AND c.customer_id = 6
GROUP BY c.customer_id, c.first_name, c.last_name
```

Lambda received the action, but Athena returned:

```text
InvalidRequestException: Queries of this type are not supported
AthenaErrorCode: MALFORMED_QUERY
ErrorCode: MALFORMED_QUERY
```

An Athena-compatible correction is:

```sql
SELECT
    c.customer_id,
    c.first_name,
    c.last_name,
    SUM(i.total) AS total_spent
FROM customers c
JOIN invoices i ON c.customer_id = i.customer_id
WHERE i.invoice_date >= date_add('year', -3, current_date)
  AND c.customer_id = 6
GROUP BY c.customer_id, c.first_name, c.last_name
```

The phrase “last 3 years” also needs an explicit evaluation rule. Relative to the 2026 execution
date it likely produces no rows because Chinook contains historical sample data. A formal test
must distinguish a rolling three-year window from the latest three years present in the dataset.

## Preliminary findings

- The complete Bedrock-to-Lambda-to-Athena path worked for five consecutive actions.
- Nova Lite generated valid joins and aggregations for several simple ranking metrics.
- It did not follow the clarification policy for materially ambiguous words such as “popular” and
  “best” when the instruction was included in the prompt. However, it did follow the clarification
  instruction when invoked through the AWS SDK.
- It did not consistently follow the SQL-disclosure requirement.
- It generated SQL from the wrong dialect and did not execute the instructed corrective retry.
- Conversation state successfully carried the selected customer into the final turn, but earlier
  ambiguity made that state semantically fragile.

These observations should inform benchmark cases but should not be counted in formal model
comparison metrics.
