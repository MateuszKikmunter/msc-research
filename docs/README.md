# Project documentation

This directory records the design and research context that cannot be inferred
reliably from the source code alone.

- [Architecture](architecture.md) describes the deployed components and request flow.
- [Dataset](dataset.md) documents the Chinook tables, relationships, and analytical caveats.
- [Agent design](agent-design.md) explains prompting, tool use, safety boundaries, and the
  role a Bedrock Knowledge Base could play.
- [Decision records](decisions/) explain important architectural choices.

Keep deployment commands in the repository-level `README.md`. Update these documents when
a design decision, schema assumption, experimental method, or operational constraint changes.
