# SHEOL 5x Benchmark v0.1

## Goal

Test whether SHEOL materially improves end-to-end reliable task completion over a single-model baseline on tasks requiring multi-stage execution and verification.

5x is an engineering target, not an assumed result.

## Primary metric

**ERTS — End-to-End Reliable Task Success**

A mission succeeds only when all hard requirements are satisfied, mandatory gates pass, no critical invariant is violated, and the final artifact is usable.

`ERTS = successful missions / total missions`

Relative lift:

`ERTS_SHEOL / ERTS_SINGLE`

A verified 5x result means relative lift >= 5.0 on a pre-registered evaluation set.

## Baselines

1. single best permitted model
2. single model + tools
3. sequential pipeline without gating
4. ensemble/debate baseline
5. SHEOL without replan
6. SHEOL without scope firewall
7. full SHEOL

## Task families

- software engineering with repository edits and objective tests
- architecture with machine-checkable constraints
- data transformation with schemas and validations
- research with explicit evidence requirements
- design-to-implementation with acceptance criteria

## Secondary metrics

- critical failure rate
- hard-requirement coverage
- functional test pass rate
- rework rate
- replan rate
- token usage
- tool-call count
- cost
- latency

## Experimental rules

- freeze test set before final comparison
- identical task inputs
- matched external resources
- record every attempt
- do not remove difficult cases after seeing results
- report confidence intervals
- report results per task family
- separate quality lift from cost and latency

## Core hypothesis

The expected advantage is not "more models = more intelligence". It is that controlled decomposition, context isolation, artifact state, verification, scope control and recovery can convert a strong but fallible model into a more reliable end-to-end execution system.
