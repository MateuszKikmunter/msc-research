# Evaluation summary

- Model: `nova-lite`
- Repetition: 1

## Standalone executable cases

| Metric                         |            Score |
| ------------------------------ | ---------------: |
| Final Success Rate             | 79.38% (127/160) |
| Clean Direct Success Rate      | 76.25% (122/160) |
| Final-to-Direct Success Gap    |    3.13% (5/160) |
| Recovered Success Contribution |    3.94% (5/127) |
| Recovery Rate                  |    13.51% (5/37) |
| Unnecessary Clarification Rate |    0.00% (0/160) |
| Execution-error recoveries     |                5 |
| Semantic-revision recoveries   |                0 |

## Standalone trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |   122 |
| `EXECUTION_ERROR_RECOVERED`     |     5 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |    27 |
| `UNRECOVERED_EXECUTION_FAILURE` |     5 |
| `NO_SQL`                        |     1 |
| `SYSTEM_ERROR`                  |     0 |

## Athena error responses

Total correlated transitions: 88

| Response category                | Count |
| -------------------------------- | ----: |
| `no_retry`                       |     5 |
| `retry_executed_successfully`    |     9 |
| `retry_repeated_same_error`      |    71 |
| `retry_produced_different_error` |     3 |
| `transition_uncertain`           |     0 |

- Observation-conditioned Recovery Rate: 35.71% (5/14)

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
| `compliant`           |     7 |
| `partially_compliant` |     0 |
| `non_compliant`       |     3 |
| `uncertain`           |     0 |

## Standalone results by difficulty

| Difficulty |             FSR |            CDSR |          FDG | Median SQL attempts |
| ---------- | --------------: | --------------: | -----------: | ------------------: |
| easy       | 100.00% (50/50) | 100.00% (50/50) | 0.00% (0/50) |                   1 |
| medium     |  85.00% (51/60) |  81.67% (49/60) | 3.33% (2/60) |                   1 |
| hard       |  52.00% (26/50) |  46.00% (23/50) | 6.00% (3/50) |                   1 |

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
| `DIRECT_SUCCESS`                |    49 |
| `EXECUTION_ERROR_RECOVERED`     |     2 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |     9 |
| `UNRECOVERED_EXECUTION_FAILURE` |     0 |
| `NO_SQL`                        |     0 |
| `SYSTEM_ERROR`                  |     0 |

### hard trajectory classes

| Trajectory class                | Count |
| ------------------------------- | ----: |
| `DIRECT_SUCCESS`                |    23 |
| `EXECUTION_ERROR_RECOVERED`     |     3 |
| `SEMANTIC_REVISION_SUCCESS`     |     0 |
| `EXECUTED_SEMANTIC_FAILURE`     |    18 |
| `UNRECOVERED_EXECUTION_FAILURE` |     5 |
| `NO_SQL`                        |     1 |
| `SYSTEM_ERROR`                  |     0 |
