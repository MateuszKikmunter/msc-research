# Evaluation summary

- Model: `haiku-4-5`
- Repetition: 2

## Standalone executable cases

| Metric                         |            Score |
| ------------------------------ | ---------------: |
| Final Success Rate             | 91.88% (147/160) |
| Clean Direct Success Rate      | 88.75% (142/160) |
| Final-to-Direct Success Gap    |    3.13% (5/160) |
| Recovered Success Contribution |    3.40% (5/147) |
| Recovery Rate                  |    27.78% (5/18) |
| Unnecessary Clarification Rate |    0.00% (0/160) |
| Execution-error recoveries     |                5 |
| Semantic-revision recoveries   |                0 |

## Standalone trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |   142 |
| `EXECUTION_ERROR_RECOVERED`     |     5 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |    13 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

## Athena error responses

Total correlated transitions: 5

| Response category                | Count |
| -------------------------------- | ----: |
| `no_retry`                       |     0 |
| `retry_executed_successfully`    |     5 |
| `retry_repeated_same_error`      |     0 |
| `retry_produced_different_error` |     0 |
| `transition_uncertain`           |     0 |

- Observation-conditioned Recovery Rate: 100.00% (5/5)

## Ambiguity cases

- Clarification Detection Rate: 65.00% (13/20)
- Missed Clarification Rate: 35.00% (7/20)
- Scripted continuations: 13
- Post-clarification Accuracy: 100.00% (13/13)

## Interactive cases

- Turn Accuracy: 80.00% (8/10)
- Complete Episode Accuracy: 80.00% (4/5)

## Safety and out-of-domain cases

- No-Query Rate: 80.00% (8/10)
- Unreviewed cases: 0

| Manual label          | Count |
| --------------------- | ----: |
| `compliant`           |     7 |
| `partially_compliant` |     1 |
| `non_compliant`       |     2 |
| `uncertain`           |     0 |

## Standalone results by difficulty

| Difficulty |             FSR |           CDSR |          FDG | Median SQL attempts |
| ---------- | --------------: | -------------: | -----------: | ------------------: |
| easy       | 100.00% (50/50) | 98.00% (49/50) | 2.00% (1/50) |                   1 |
| medium     |  91.67% (55/60) | 91.67% (55/60) | 0.00% (0/60) |                   1 |
| hard       |  84.00% (42/50) | 76.00% (38/50) | 8.00% (4/50) |                   1 |

### easy trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    49 |
| `EXECUTION_ERROR_RECOVERED`     |     1 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     0 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

### medium trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    55 |
| `EXECUTION_ERROR_RECOVERED`     |     0 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     5 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

### hard trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    38 |
| `EXECUTION_ERROR_RECOVERED`     |     4 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     8 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |
