# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- **2026-07-26** — Completed the AWS infrastructure for querying the Chinook
  Parquet dataset. The CloudFormation template creates the Glue Data Catalog
  database and crawler, its IAM role, and the Athena workgroup.

  The template is based on AWS Samples'
  [`cur2-glue-athena-integration.yml`](https://github.com/aws-samples/sample-conversational-athena-query-agent/blob/main/deployment/cur2-glue-athena-integration.yml).

  Create or update the stack with the template's default parameter values:

  ```sh
  aws cloudformation deploy \
    --template-file infra/athena.yaml \
    --stack-name chinook-athena \
    --capabilities CAPABILITY_IAM
  ```

  After the stack has been created, start the Glue crawler once to populate the
  Data Catalog:

  ```sh
  aws glue start-crawler --name chinook-athena-chinook
  ```

- **2026-07-25** — Initialized the repository and uploaded the Chinook database
  files to the `s3://msc-analytics/chinook/` bucket using
  `scripts/db-upload.sh`:

  ```sh
  cd scripts
  bash db-upload.sh
  ```

  Data source: [PRQL/chinook](https://github.com/PRQL/chinook).

- Added this changelog to track project changes.

### Changed

### Fixed

### Removed
