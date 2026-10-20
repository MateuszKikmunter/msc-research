# Project documentation

This directory records the design and research context that cannot be inferred
reliably from the source code alone.

- [Architecture](architecture.md) describes the deployed components and request flow.
- [Dataset](dataset.md) documents the Chinook tables, relationships, and analytical caveats.
- [Agent design](agent-design.md) explains prompting, tool use, safety boundaries, and the
  role a Bedrock Knowledge Base could play.
- [Conversation storage](conversation-storage.md) documents the implemented SQLite transcript
  repository, schema, verification steps, privacy considerations, and deployment limits.
- [Agent trace storage](agent-trace-storage.md) explains structured Bedrock trajectory capture,
  sanitization, optional raw retention, querying, research uses, and limitations.
- [Evaluation methodology](evaluation.md) defines Chinook-Bench-200's result comparison,
  trajectory-aware scoring, experimental protocol, and peer-reviewed methodological references.
  The machine-readable cases and canonical SQL are in
  [`../benchmarks/`](../benchmarks/README.md).
- [Experiment runner and evaluator design](../src/experiments/DESIGN.md) documents the implemented
  golden-result generator, question runner, offline evaluator and reading order.
- [Troubleshooting](troubleshooting.md) records diagnosed deployment and runtime failures.
- [Saved experiments](../src/experiments/runs/) contains reference results and the four completed
  model/repetition evaluations.
- [Thesis writing plan](thesis-writing-plan.md) records current chapter progress and remaining work.
- [Literature guide](thesis-literature-review.md) records source selection and verification limits.
- [Thesis build guide](thesis/README.md) explains combined and standalone PDFs, analysis outputs
  and appendices.
- [Documentation status](documentation-status.md) records the latest consistency review and
  distinguishes current guidance from historical proposals.
- [Decision records](decisions/) explain important architectural choices.

Keep deployment commands in the repository-level `README.md`. Update these documents when
a design decision, schema assumption, experimental method, or operational constraint changes.
