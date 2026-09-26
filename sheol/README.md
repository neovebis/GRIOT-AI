# SHEOL

Mission Execution & Cognitive Orchestration Kernel.

## v0.5.0

SHEOL is executor-agnostic: execution planes are replaceable capability providers. The kernel does not depend on a sandbox and does not assume local execution.

### Core responsibility

SHEOL owns:

- immutable mission constitution/spine;
- phase contracts and locks;
- worker isolation;
- capability-aware routing;
- evidence collection;
- gates;
- artifact commits;
- continuity capsules;
- bounded rework and replanning;
- execution-plane selection.

### Execution planes

Supported plane kinds:

- local
- griot-sandbox
- remote
- custom

At runtime SHEOL:

1. probes candidate planes;
2. filters by required capabilities;
3. removes unavailable or forbidden planes;
4. scores compatible candidates using reliability, latency, cost, priority and preferences;
5. executes on the selected plane;
6. fails closed when no compatible plane is available.

The GRIOT Mobile local sandbox is one possible execution plane. A GRIOT sandbox is another. Remote/custom adapters can participate without changing the kernel.

### Architectural rule

**SHEOL is SHEOL.**

It is an independent orchestration motor. No cognitive motor, model provider, sandbox or compute provider is part of SHEOL's identity or mandatory for the kernel.

Supabase is persistent control-plane storage and remains outside the execution contract.

Validation: 21 versioned tests are recorded for v0.5.0. Benchmark task definitions are validated; no model runs are fabricated.

The GitHub branch stores the source, tests, schemas, migrations and release documentation natively.
