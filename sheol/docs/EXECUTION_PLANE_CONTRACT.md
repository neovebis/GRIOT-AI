# Execution Plane Contract

An execution adapter exposes:

- descriptor: stable id, kind, capabilities, reliability, latency, cost and optional priority;
- probe(): reports current availability;
- run(command): executes a generic SHEOL ExecutionCommand and returns ExecutionResult.

HTTP adapters use:
- GET <base><probePath> for health;
- POST <base><executePath> with JSON { "command": ... };
- a JSON execution result containing exitCode, signal, stdout, stderr and durationMs.

SHEOL does not assume that the remote implementation is a sandbox, container or cloud service.

Configuration for a GRIOT sandbox:
- SHEOL_GRIOT_SANDBOX_URL
- SHEOL_GRIOT_SANDBOX_HEALTH_PATH
- SHEOL_GRIOT_SANDBOX_EXECUTE_PATH
- SHEOL_GRIOT_SANDBOX_KEY

Configuration for a generic remote executor:
- SHEOL_REMOTE_EXECUTOR_URL
- SHEOL_REMOTE_EXECUTOR_HEALTH_PATH
- SHEOL_REMOTE_EXECUTOR_EXECUTE_PATH
- SHEOL_REMOTE_EXECUTOR_CAPABILITIES
- SHEOL_REMOTE_EXECUTOR_KEY

Secrets remain server-side and are never part of the client execution contract.
