# SHEOL v0.5 — Executor-Agnostic Runtime

SHEOL does not depend on a sandbox.

The canonical execution contract is ExecutionCommand, ExecutionResult and ExecutionAdapter. A plane advertises capabilities and provides a health probe before SHEOL can select it.

## Selection

For each execution request SHEOL:
1. ignores explicitly forbidden planes;
2. probes candidate planes;
3. rejects unavailable planes;
4. rejects planes missing required capabilities;
5. scores compatible candidates;
6. selects an available compatible plane;
7. fails closed when no compatible plane exists.

No local-first rule exists in this layer.

## GRIOT sandbox

The GRIOT sandbox is an optional execution plane. SHEOL can discover it through environment configuration, probe its health endpoint and use it when available. The GRIOT endpoint is intentionally not hard-coded because its concrete contract must come from the actual GRIOT integration.

## Other planes

The HTTP adapter supports generic remote/custom execution services implementing the documented health and execution contract.

## Runtime boundary

GRIOT Mobile local execution, the GRIOT sandbox, remote compute and future adapters can all participate without changing the SHEOL kernel.

## Failure rule

Availability is observed, not assumed. A configured but unreachable executor is skipped. When no compatible executor remains, SHEOL fails closed.
