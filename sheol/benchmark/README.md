# SHEOL Benchmark Harness

This harness exists to measure the SHEOL hypothesis; it does not assume a 5x result.

## Primary metric

ERTS (End-to-End Reliable Task Success): successful missions divided by total missions.

Relative lift is `ERTS_SHEOL / ERTS_SINGLE`.

A 5x result is only reportable when the baseline ERTS is non-zero and the frozen evaluation set is unchanged.

## Rules

- The single-model baseline and SHEOL must receive the same original mission.
- External resources and task inputs must be matched.
- The evaluator must be objective or provide explicit evidence requirements.
- No result may be fabricated when an executor/provider is unavailable.
- Task definitions are versioned and should be frozen before comparison.
- Report quality, critical failures, cost and latency separately.
- A benchmark result is not a claim about general intelligence.

## Run validation only

```bash
npm run bench:validate
```

Real execution adapters will be added behind `BenchmarkExecutor`; the CLI deliberately fails closed until one is configured.
