# Chinook-Bench-200

[`chinook-bench-200.jsonl`](chinook-bench-200.jsonl) is the versioned machine-readable source for
evaluating the local Bedrock text-to-SQL application. The generated
[`chinook-bench-200.json`](chinook-bench-200.json) is a JSON array for tools that do not consume
JSONL, and [`chinook-bench-200.md`](chinook-bench-200.md) is the generated human-readable form.
The benchmark contains exactly 200 primary natural-language question turns across 195 cases,
grounded in the repository's Chinook schema:

| Difficulty  | Questions | Cases | Primary capability                                        |
| ----------- | --------: | ----: | --------------------------------------------------------- |
| Easy        |        50 |    50 | Lookup, filtering, sorting, nulls, and basic aggregation  |
| Medium      |        60 |    60 | Joins, grouped metrics, dates, anti-joins, and sales      |
| Hard        |        50 |    50 | Multi-hop joins, CTEs, subqueries, windows, and sets      |
| Ambiguous   |        20 |    20 | Material ambiguity that requires clarification            |
| Interactive |        10 |     5 | Context carry-over, correction, and drill-down            |
| Safety      |        10 |    10 | Write requests, injection, privacy, and domain boundaries |

The easy, medium, and hard partitions contain 160 independently executable questions. The five
interactive cases contain ten executable turns. Twenty ambiguity questions require clarification
and define one scripted reply plus a resolved golden query. Those replies are experimental stimuli,
not additional primary benchmark questions. Ten safety questions intentionally have no SQL.

## Record contract

Each JSONL record has:

- `id`: stable case identifier;
- `difficulty` and `category`: reporting strata fixed before experiment execution;
- `question`, or `turns` for an interaction sequence;
- `expected_behavior`: `execute`, `execute_sequence`, `clarify_then_execute`,
  `refuse_without_query`, or `decline_without_query`; and
- `gold_sql`: canonical Athena SQL, or `null` when invoking Athena would be incorrect.

Every executable record or turn has a `comparison` object:

- `mode`: `exact_result`;
- `requiredColumns`: canonical output columns, in semantic order;
- `orderMatters`: whether row order is part of the requested answer;
- `columnOrderMatters`: whether output expressions must have the same semantic order;
- `compareColumnNames`: whether aliases themselves are scored;
- `allowExtraColumns`: whether an otherwise matching result may add columns;
- `preserveDuplicates`: whether row multiplicity is significant;
- `numericTolerance`: absolute tolerance for non-identifier numeric values;
- `rowLimit`: a user-requested top-N limit, otherwise `null`; and
- `topNTiePolicy`: the declared rule for selecting a bounded result.

Column aliases are not scored (`compareColumnNames: false`), but the current exact-result contract
requires the same number and semantic order of columns. Counts and identifiers remain exact even
though `numericTolerance` is available for decimal aggregates.

Ambiguity records provide `clarification_target` and a `resolution` object containing
`acceptedSlots`, one frozen `scriptedReply`, resolved `gold_sql`, and its comparison contract. The
runner sends the reply only after a relevant clarification and uses the same Bedrock session. A SQL
action before clarification fails clarification recall; a correct resolved result is scored
separately as clarification resolution. Safety records provide `safety_target`.

Interactive SQL can contain a typed placeholder such as `:previous_genre_name`. The benchmark
runner must replace it with the value returned by the preceding gold query, not a hard-coded value.

## Gold-query policy

The canonical query is a reviewed expression of the intended semantics, not the only acceptable
SQL string. Evaluation must compare normalized execution results under the case's declared
`comparison` contract; it must not require literal SQL or abstract-syntax-tree equality. Projection
aliases, join order, equivalent predicates, CTEs, and subqueries may differ without changing
correctness.

Result comparison must:

1. execute generated and gold SQL against the same frozen dataset snapshot and engine version;
2. compare column meaning, row multiplicity, values, and nulls;
3. enforce the declared required column count and semantic order while ignoring aliases;
4. compare ordered rows only when `orderMatters` is true;
5. otherwise compare results as unordered multisets;
6. preserve duplicates and nulls;
7. normalize numeric representation using the declared decimal tolerance while retaining exact
   counts and identifiers; and
8. classify a contract that cannot be applied deterministically as `evaluator_uncertain` for the
   bounded adjudication sample rather than automatically counting it as model failure.

The gold SQL never uses `LIMIT 200` as a transport or display cap. The Lambda's 200-row action
preview is not part of benchmark semantics, and the evaluator must retrieve the complete candidate
result using its Athena execution ID. A gold `LIMIT` appears only when the question explicitly asks
for top-N output. Most bounded cases use `deterministic_secondary_key`: metric order is followed by
the stable secondary keys written in the gold query, so a repeatable set is selected at the cutoff.
`result_set_only` instead compares the selected rows as an unordered multiset and does not penalize
different presentation ordering when the complete selected values are equal.

## Design rationale and references

The benchmark adapts the following peer-reviewed precedents rather than copying their datasets:

- **BIRD** motivates database-value grounding, execution accuracy, and a distinct efficiency
  analysis. Chinook-Bench uses result equivalence as its main SQL outcome, but does not label local
  endpoint latency as BIRD's VES. Li et al., NeurIPS 2023 Datasets and Benchmarks,
  [DOI 10.52202/075280-1835](https://doi.org/10.52202/075280-1835).
- **Spider** motivates controlled SQL-complexity coverage and human-authored question/query pairs.
  This project is deliberately single-domain, so it cannot claim Spider's cross-domain
  generalization. Yu et al., EMNLP 2018,
  [DOI 10.18653/v1/D18-1425](https://doi.org/10.18653/v1/D18-1425).
- **AMBROSIA** motivates explicit ambiguity strata and interpretation-aware evaluation. Here the
  correct product behavior is to ask one useful question before querying. Saparina and Lapata,
  NeurIPS 2024 Datasets and Benchmarks,
  [DOI 10.52202/079017-2876](https://doi.org/10.52202/079017-2876).
- **SParC** motivates coherent multi-turn cases and interaction-level accuracy in addition to
  per-turn accuracy. Yu et al., ACL 2019,
  [DOI 10.18653/v1/P19-1443](https://doi.org/10.18653/v1/P19-1443).
- **SQLucid** motivates evaluation beyond SQL generation: users must be able to understand and
  validate the query/result relationship. It informs the separate answer-quality and optional user
  study, not an automatic claim that exposed rationale is correct. Tian et al., UIST 2024,
  [DOI 10.1145/3654777.3676368](https://doi.org/10.1145/3654777.3676368).
- Pourreza and Rafiei show why one reference string or even one reference interpretation can
  mis-score valid outputs. Their findings motivate execution comparison plus adjudication.
  EMNLP 2023, [DOI 10.18653/v1/2023.emnlp-main.99](https://doi.org/10.18653/v1/2023.emnlp-main.99).

These sources are methodological references. Chinook-Bench-200 remains a project-specific,
manually authored benchmark and should not be presented as an official extension of BIRD, Spider,
AMBROSIA, SParC, or SQLucid.

## Known limitations

- One small, clean database measures in-domain reliability, not cross-domain generalization.
- Some generated questions use explicit schema-domain vocabulary and may be easier than organic
  user questions.
- Difficulty labels are design strata and must be validated empirically using observed error rates.
- Equivalent SQL can diverge on another database instance; the frozen snapshot may not expose every
  semantic mistake. Mutation or test-database evaluation is a useful later extension.
