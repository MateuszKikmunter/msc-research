# ADR 001: Use Athena over Parquet for analytical queries

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

The project needs a serverless query layer over the Chinook dataset that can be invoked by a
conversational agent. The source is a fixed collection of table-shaped data and the research
focus is natural-language analytics rather than database administration.

## Decision

Store one Parquet file per table in Amazon S3, discover the tables through the AWS Glue Data
Catalog, and execute SQL in a dedicated Amazon Athena workgroup. Write query results to a separate
S3 prefix with SSE-S3 encryption.

## Consequences

- Infrastructure remains serverless and requires no continuously running database.
- SQL queries and scanned data provide observable evaluation artifacts.
- Parquet supports columnar scans and preserves a relational analytical interface.
- The system depends on correct S3 layout, Glue inference, and crawler execution.
- Query latency is less predictable than a continuously running transactional database.
- Cost depends on scanned data, so larger future datasets will require partitioning, query limits,
  and cost monitoring.

## Alternatives considered

- **Load Chinook into a managed relational database:** familiar SQL and lower interactive latency,
  but additional provisioning and lifecycle management for a small research dataset.
- **Let the model inspect raw files:** unsuitable for exact aggregation, joins, and reproducible
  numerical answers.
