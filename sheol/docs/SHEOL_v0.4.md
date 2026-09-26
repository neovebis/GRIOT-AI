# SHEOL v0.4 — Evaluation Foundation

SHEOL v0.4 adds a benchmark harness for the 5x hypothesis.

## Primary metric

ERTS (End-to-End Reliable Task Success) = successful missions / total missions.

Relative lift = ERTS_SHEOL / ERTS_SINGLE.

The 5x target is a falsifiable engineering hypothesis, not an architectural claim.

## Benchmark rules

- same original mission for both targets
- matched resources and evaluator
- frozen task definitions before comparison
- objective evidence for success
- report quality, critical failures, cost and latency separately
- fail closed when a real executor is unavailable

The current release validates the harness only. No model benchmark result is claimed.