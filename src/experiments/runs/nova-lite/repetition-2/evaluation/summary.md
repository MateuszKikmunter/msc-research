# Evaluation summary

- Model: `nova-lite`
- Repetition: 2

## Standalone executable cases

| Metric                         |            Score |
| ------------------------------ | ---------------: |
| Final Success Rate             | 77.50% (124/160) |
| Clean Direct Success Rate      | 74.38% (119/160) |
| Final-to-Direct Success Gap    |    3.13% (5/160) |
| Recovered Success Contribution |    4.03% (5/124) |
| Recovery Rate                  |    12.20% (5/41) |
| Unnecessary Clarification Rate |    0.00% (0/160) |
| Execution-error recoveries     |                5 |
| Semantic-revision recoveries   |                0 |

## Standalone trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |   119 |
| `EXECUTION_ERROR_RECOVERED`     |     5 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |    26 |
| `UNRECOVERED_EXECUTION_FAILURE` |    10 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

## Athena error responses

Total correlated transitions: 182

| Response category                | Count |
| -------------------------------- | ----: |
| `no_retry`                       |    10 |
| `retry_executed_successfully`    |    10 |
| `retry_repeated_same_error`      |   158 |
| `retry_produced_different_error` |     4 |
| `transition_uncertain`           |     0 |

- Observation-conditioned Recovery Rate: 25.00% (5/20)

## Ambiguity cases

- Clarification Detection Rate: 80.00% (16/20)
- Missed Clarification Rate: 20.00% (4/20)
- Scripted continuations: 16
- Post-clarification Accuracy: 68.75% (11/16)

## Interactive cases

- Turn Accuracy: 70.00% (7/10)
- Complete Episode Accuracy: 60.00% (3/5)

## Safety and out-of-domain cases

- No-Query Rate: 80.00% (8/10)
- Unreviewed cases: 0

| Manual label          | Count |
| --------------------- | ----: |
| `compliant`           |     8 |
| `partially_compliant` |     0 |
| `non_compliant`       |     2 |
| `uncertain`           |     0 |

## Standalone results by difficulty

| Difficulty |             FSR |            CDSR |          FDG | Median SQL attempts |
| ---------- | --------------: | --------------: | -----------: | ------------------: |
| easy       | 100.00% (50/50) | 100.00% (50/50) | 0.00% (0/50) |                   1 |
| medium     |  81.67% (49/60) |  80.00% (48/60) | 1.67% (1/60) |                   1 |
| hard       |  50.00% (25/50) |  42.00% (21/50) | 8.00% (4/50) |                   1 |

### easy trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    50 |
| `EXECUTION_ERROR_RECOVERED`     |     0 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     0 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

### medium trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    48 |
| `EXECUTION_ERROR_RECOVERED`     |     1 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     9 |
| `UNRECOVERED_EXECUTION_FAILURE` |     2 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

### hard trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    21 |
| `EXECUTION_ERROR_RECOVERED`     |     4 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |    17 |
| `UNRECOVERED_EXECUTION_FAILURE` |     8 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |
