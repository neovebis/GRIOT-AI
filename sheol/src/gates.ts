import type { GateResult } from './domain.js';
import type { SandboxExecutor } from './sandbox.js';
import type { ExecutionCommand, ExecutionPlaneRouter } from './execution.js';

export interface GateContext {
  readonly phaseId: string;
  readonly requiredOutputs: readonly string[];
  readonly artifactPaths: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface Gate {
  readonly id: string;
  evaluate(context: GateContext): Promise<GateResult>;
}

export class RequiredOutputsGate implements Gate {
  public constructor(public readonly id: string) {}
  async evaluate(context: GateContext): Promise<GateResult> {
    const missing = context.requiredOutputs.filter(required => !context.artifactPaths.includes(required));
    return {
      phaseId: context.phaseId,
      gateId: this.id,
      status: missing.length ? 'FAIL' : 'PASS',
      reasons: missing.map(x => `Missing required output: ${x}`),
      evidence: context.artifactPaths,
    };
  }
}

export class CommandGate implements Gate {
  public constructor(
    public readonly id: string,
    private readonly executor: SandboxExecutor,
    private readonly command: ExecutionCommand,
  ) {}

  async evaluate(context: GateContext): Promise<GateResult> {
    const result = await this.executor.run(this.command);
    const passed = result.exitCode === 0;
    return {
      phaseId: context.phaseId,
      gateId: this.id,
      status: passed ? 'PASS' : 'FAIL',
      reasons: passed ? [] : [`Command exited with code ${String(result.exitCode)}`, result.stderr.slice(-2000)],
      evidence: [`stdout:${result.stdout.slice(-2000)}`, `stderr:${result.stderr.slice(-2000)}`],
    };
  }
}

export class GateEngine {
  public constructor(private readonly gates: readonly Gate[]) {}
  async evaluate(context: GateContext): Promise<readonly GateResult[]> {
    const results: GateResult[] = [];
    for (const gate of this.gates) results.push(await gate.evaluate(context));
    return results;
  }
}

export interface RoutedCommandGatePolicy {
  readonly requiredCapabilities: readonly string[];
  readonly risk: number;
  readonly preferredPlaneIds?: readonly string[];
  readonly forbiddenPlaneIds?: readonly string[];
}

/**
 * Selects the execution plane at gate time from all currently available adapters.
 * No execution plane is mandatory; unavailable candidates are skipped.
 */
export class RoutedCommandGate implements Gate {
  public constructor(
    public readonly id: string,
    private readonly router: ExecutionPlaneRouter,
    private readonly policy: RoutedCommandGatePolicy,
    private readonly command: ExecutionCommand,
  ) {}

  async evaluate(context: GateContext): Promise<GateResult> {
    const selection = await this.router.select(this.policy);
    const result = await selection.adapter.run(this.command);
    const passed = result.exitCode === 0;
    return {
      phaseId: context.phaseId,
      gateId: this.id,
      status: passed ? 'PASS' : 'FAIL',
      reasons: passed ? [] : [`Command exited with code ${String(result.exitCode)}`, result.stderr.slice(-2000)],
      evidence: [
        `executionPlane:${selection.adapter.descriptor.id}`,
        `executionPlaneKind:${selection.adapter.descriptor.kind}`,
        `selectionScore:${selection.score.toFixed(6)}`,
        `stdout:${result.stdout.slice(-2000)}`,
        `stderr:${result.stderr.slice(-2000)}`,
      ],
    };
  }
}
