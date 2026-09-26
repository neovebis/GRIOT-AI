import type { Constitution, ContinuityCapsule, GateResult, Plan, PhaseContract } from './domain.js';
import { SheolKernel } from './kernel.js';
import type { ArtifactStore, EventStore, MissionPersistence } from './persistence.js';
import { CapabilityRouter } from './model.js';
import type { WorkerContract, WorkerResult } from './worker.js';
import { GateEngine } from './gates.js';
import { ContinuityCapsuleCompiler } from './capsule.js';
import { sha256 } from './hash.js';
import type { ExecutionCommand, ExecutionPlaneRouter, ExecutionResult, ExecutionSelectionPolicy } from './execution.js';

export interface RuntimePolicy { readonly requiredCapabilities: readonly string[]; readonly risk: number; readonly maxReworkPerPhase?: number; }
export interface RuntimeDeps {
  readonly eventStore: EventStore;
  readonly artifactStore: ArtifactStore;
  readonly router: CapabilityRouter;
  readonly gateEngine: GateEngine;
  readonly capsuleCompiler: ContinuityCapsuleCompiler;
  readonly missionPersistence?: MissionPersistence;
  readonly executionRouter?: ExecutionPlaneRouter;
}
export interface PhaseExecution {
  readonly phaseId: string; readonly attemptId: string; readonly modelId: string; readonly workerResult: WorkerResult;
  readonly gates: readonly GateResult[]; readonly status: 'PASS' | 'FAIL' | 'UNCERTAIN'; readonly capsule?: ContinuityCapsule;
}

export class SheolRuntime {
  private eventCursor = 0;
  public constructor(public readonly kernel: SheolKernel, private readonly deps: RuntimeDeps) {}

  public compilePlan(plan: Plan): Promise<void> | void { this.kernel.compilePlan(plan); return this.persistNewState(); }

  /** Execute an OS/tool command on whichever configured execution plane is available. */
  public async executeCommand(
    policy: ExecutionSelectionPolicy,
    command: ExecutionCommand,
  ): Promise<{ result: ExecutionResult; planeId: string; score: number }> {
    if (!this.deps.executionRouter) throw new Error('SHEOL runtime has no execution-plane router configured');

    const commandFingerprint = sha256(JSON.stringify({
      executable: command.executable,
      args: command.args,
      cwd: command.cwd,
    }));

    const selection = await this.deps.executionRouter.select(policy);
    this.kernel.recordExecutionPlaneSelection({
      planeId: selection.adapter.descriptor.id,
      planeKind: selection.adapter.descriptor.kind,
      score: selection.score,
      rationale: selection.rationale,
      commandFingerprint,
      policy: {
        requiredCapabilities: policy.requiredCapabilities,
        risk: policy.risk,
        ...(policy.preferredPlaneIds ? { preferredPlaneIds: policy.preferredPlaneIds } : {}),
        ...(policy.forbiddenPlaneIds ? { forbiddenPlaneIds: policy.forbiddenPlaneIds } : {}),
        ...(policy.minReliability === undefined ? {} : { minReliability: policy.minReliability }),
        ...(policy.maxCostPerExecution === undefined ? {} : { maxCostPerExecution: policy.maxCostPerExecution }),
        ...(policy.maxLatencyMsP50 === undefined ? {} : { maxLatencyMsP50: policy.maxLatencyMsP50 }),
        ...(policy.requiredIsolation === undefined ? {} : { requiredIsolation: policy.requiredIsolation }),
        ...(policy.requiredNetworkAccess === undefined ? {} : { requiredNetworkAccess: policy.requiredNetworkAccess }),
      },
    });
    await this.persistNewState();

    try {
      const result = await selection.adapter.run(command);
      this.kernel.recordExecutionCompleted({
        planeId: selection.adapter.descriptor.id,
        commandFingerprint,
        exitCode: result.exitCode,
        signal: result.signal,
        stdoutSha256: sha256(result.stdout),
        stderrSha256: sha256(result.stderr),
        stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
        stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
        durationMs: result.durationMs,
      });
      await this.persistNewState();
      return { result, planeId: selection.adapter.descriptor.id, score: selection.score };
    } catch (error) {
      this.kernel.recordExecutionFailed({
        planeId: selection.adapter.descriptor.id,
        commandFingerprint,
        reason: error instanceof Error ? error.message : String(error),
      });
      await this.persistNewState();
      throw error;
    }
  }

  public async executeNextPhase(policy: RuntimePolicy): Promise<PhaseExecution | null> {
    const phase = this.kernel.startNextPhase();
    const attemptId = this.kernel.activeAttempt;
    if (!attemptId) throw new Error('Kernel started a phase without an active attempt');
    await this.persistNewState();

    const previous = this.findPreviousCapsule(phase);
    const contract = this.buildWorkerContract(phase, previous);
    const provider = this.deps.router.select(contract, policy);
    this.kernel.recordWorkerSelection(provider.profile.modelId, { requiredCapabilities: policy.requiredCapabilities, risk: policy.risk });
    await this.persistNewState();

    let workerResult: WorkerResult;
    try {
      workerResult = await provider.execute(contract);
      this.kernel.recordWorkerResult(workerResult);
      await this.persistNewState();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.kernel.abortActiveAttempt(`worker_execution_failed: ${reason}`);
      await this.persistNewState();
      throw error;
    }

    for (const artifact of workerResult.artifacts) {
      const recorded = this.kernel.recordArtifact(artifact);
      await this.deps.artifactStore.put(recorded);
    }

    this.kernel.beginVerification();
    await this.persistNewState();

    const gates = await this.deps.gateEngine.evaluate({
      phaseId: phase.id,
      requiredOutputs: phase.requiredOutputs,
      artifactPaths: workerResult.artifacts.map(a => a.path),
      acceptanceCriteria: phase.acceptanceCriteria,
    });
    const status = this.kernel.evaluateGates(gates);
    for (const artifact of this.kernel.getArtifacts().filter(a => a.phaseId === phase.id)) await this.deps.artifactStore.put(artifact);
    await this.persistNewState();

    if (status !== 'PASS') return { phaseId: phase.id, attemptId, modelId: provider.profile.modelId, workerResult, gates, status };

    const committed = this.kernel.getArtifacts().filter(a => a.phaseId === phase.id && a.committed);
    const capsule = this.deps.capsuleCompiler.compile({
      constitution: this.kernel.constitution,
      phase,
      committedArtifacts: committed,
      gates,
      declaredDecisions: workerResult.declaredDecisions,
      architectureFacts: workerResult.technicalHandoff?.architectureFacts,
      interfaces: workerResult.technicalHandoff?.interfaces,
      unresolved: workerResult.unresolvedIssues,
    });
    this.kernel.registerContinuityCapsule(capsule);
    await this.persistNewState();
    return { phaseId: phase.id, attemptId, modelId: provider.profile.modelId, workerResult, gates, status, capsule };
  }

  public async runUntilBlocked(policy: RuntimePolicy): Promise<readonly PhaseExecution[]> {
    const executions: PhaseExecution[] = [];
    while (this.kernel.state !== 'COMPLETED') {
      if (this.kernel.state !== 'PLANNED' && this.kernel.state !== 'READY' && this.kernel.state !== 'REWORK') break;
      const result = await this.executeNextPhase(policy);
      if (!result) break;
      executions.push(result);
      if (result.status !== 'PASS') break;
    }
    return executions;
  }

  private buildWorkerContract(phase: PhaseContract, previous?: ContinuityCapsule): WorkerContract {
    const artifacts = previous ? this.kernel.getArtifacts().filter(a => previous.artifactRefs.includes(a.id) && a.committed) : [];
    const base: WorkerContract = {
      missionId: this.kernel.constitution.missionId, phaseId: phase.id, objective: phase.objective,
      spine: { objective: this.kernel.constitution.objective, hardInvariants: this.kernel.constitution.hardInvariants, globalConstraints: this.kernel.constitution.globalConstraints, architecturalPrinciples: this.kernel.constitution.architecturalPrinciples },
      scope: { allowedPaths: phase.allowedPaths, forbiddenPaths: phase.forbiddenPaths, allowedTools: phase.allowedTools },
      // Only metadata crosses the phase boundary. Artifact contents remain in the workspace.
      inputs: artifacts.map(a => ({ id: a.id, path: a.path })), acceptanceCriteria: phase.acceptanceCriteria,
    };
    return previous ? { ...base, continuity: previous } : base;
  }

  private findPreviousCapsule(phase: PhaseContract): ContinuityCapsule | undefined {
    for (const dep of [...phase.dependencies].reverse()) { try { return this.kernel.getContinuityCapsule(dep); } catch { /* dependency may not emit a capsule */ } }
    return undefined;
  }

  private async persistNewState(): Promise<void> {
    const events = this.kernel.eventLedger;
    const pending = events.slice(this.eventCursor);
    if (this.deps.missionPersistence) {
      await this.deps.missionPersistence.persist(this.kernel.snapshot(), pending);
    } else {
      for (const event of pending) await this.deps.eventStore.append(event);
    }
    this.eventCursor = events.length;
  }
}
