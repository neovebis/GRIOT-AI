import { randomUUID } from "node:crypto";
import { sha256 } from "./hash.js";
import { InvariantViolation, InvalidTransition, ScopeViolation, SheolError } from "./errors.js";
import type {
  Artifact, Constitution, ContinuityCapsule, EventRecord, GateResult, GateStatus,
  MissionSnapshot, MissionState, PhaseAttempt, PhaseContract, PhaseState, Plan,
  ReplanRecord, ReplanRequest, AttemptState,
} from "./domain.js";

const VALID_GATE_STATUSES = new Set(["PASS", "FAIL", "UNCERTAIN"]);
function clone<T>(value: T): T { return structuredClone(value); }
function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new SheolError(message); }

export class SheolKernel {
  private missionState: MissionState = "CREATED";
  private activePhaseId: string | null = null;
  private activeAttemptId: string | null = null;
  private readonly attemptCounters = new Map<string, number>();
  private readonly phaseStates = new Map<string, PhaseState>();
  private readonly attempts = new Map<string, PhaseAttempt>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly committedByPath = new Map<string, Artifact>();
  private readonly capsules = new Map<string, ContinuityCapsule>();
  private readonly gateResults: GateResult[] = [];
  private readonly replans: ReplanRecord[] = [];
  private readonly events: EventRecord[] = [];
  private readonly planHistory = new Map<number, Plan>();
  private plan: Plan | null = null;

  public constructor(public readonly constitution: Constitution) {
    ensure(constitution.hash === this.computeConstitutionHash(constitution), "Invalid constitution hash");
    this.emit("MISSION_CREATED", { constitutionHash: constitution.hash });
  }

  public get state(): MissionState { return this.missionState; }
  public get activePhase(): string | null { return this.activePhaseId; }
  public get activeAttempt(): string | null { return this.activeAttemptId; }
  public get eventLedger(): readonly EventRecord[] { return clone(this.events); }
  public getPlan(): Plan { ensure(this.plan, "No plan compiled"); return clone(this.plan); }
  public getPlans(): readonly Plan[] { return clone([...this.planHistory.values()].sort((a, b) => a.version - b.version)); }
  public getAttempts(): readonly PhaseAttempt[] { return clone([...this.attempts.values()]); }
  public getGateResults(): readonly GateResult[] { return clone(this.gateResults); }
  public getReplans(): readonly ReplanRecord[] { return clone(this.replans); }

  public compilePlan(plan: Plan): void {
    this.assertConstitutionCompatible(plan);
    this.assertPlanIntegrity(plan);
    ensure(this.missionState === "CREATED" || this.missionState === "REPLANNING", "Plan can only be compiled from CREATED or REPLANNING");

    const previousStates = new Map(this.phaseStates);
    this.plan = clone(plan);
    this.planHistory.set(plan.version, clone(plan));
    this.phaseStates.clear();
    this.activePhaseId = null;
    this.activeAttemptId = null;

    for (const [index, phase] of plan.phases.entries()) {
      const previous = previousStates.get(phase.id);
      if (previous === "COMMITTED") this.phaseStates.set(phase.id, "COMMITTED");
      else if (index === 0 || this.dependenciesSatisfied(phase)) this.phaseStates.set(phase.id, "READY");
      else this.phaseStates.set(phase.id, "LOCKED");
    }

    this.missionState = "PLANNED";
    this.emit("PLAN_COMPILED", { version: plan.version, phases: plan.phases.map(p => p.id) });
  }

  public startNextPhase(): PhaseContract {
    ensure(this.plan, "No plan compiled");
    if (this.missionState === "PLANNED") this.missionState = "READY";
    ensure(this.missionState === "READY" || this.missionState === "REWORK", "Mission is not ready to start a phase");

    const phase = this.plan.phases.find(p => this.phaseStates.get(p.id) === "READY" || this.phaseStates.get(p.id) === "REWORK");
    if (!phase) {
      this.missionState = "COMPLETED";
      this.emit("MISSION_COMPLETED", {});
      throw new SheolError("No executable phases remain");
    }

    ensure(!this.activePhaseId, "Another phase is already active");
    const attemptNumber = (this.attemptCounters.get(phase.id) ?? 0) + 1;
    const attemptId = randomUUID();
    const startedAt = new Date().toISOString();
    this.attemptCounters.set(phase.id, attemptNumber);
    this.activePhaseId = phase.id;
    this.activeAttemptId = attemptId;
    this.attempts.set(attemptId, {
      id: attemptId, missionId: this.constitution.missionId, phaseId: phase.id,
      attemptNo: attemptNumber, state: "RUNNING", startedAt,
    });
    this.phaseStates.set(phase.id, "RUNNING");
    this.missionState = "RUNNING";
    this.emit("PHASE_STARTED", { phaseId: phase.id, attemptNo: attemptNumber });
    return clone(phase);
  }

  public recordWorkerSelection(modelId: string, request?: unknown): void {
    const attempt = this.requireActiveAttempt();
    ensure(this.getAttemptState(attempt.id) === "RUNNING", "Worker can only be selected while an attempt is running");
    this.attempts.set(attempt.id, { ...attempt, modelId, ...(request === undefined ? {} : { request: clone(request) }) });
    this.emit("WORKER_SELECTED", { phaseId: attempt.phaseId, modelId });
  }

  public recordWorkerResult(result: unknown): void {
    const attempt = this.requireActiveAttempt();
    ensure(this.getAttemptState(attempt.id) === "RUNNING", "Worker result can only be recorded while an attempt is running");
    this.attempts.set(attempt.id, { ...attempt, result: clone(result) });
    this.emit("WORKER_RESULT_RECORDED", { phaseId: attempt.phaseId, hasResult: result !== undefined });
  }

  public recordExecutionPlaneSelection(input: {
    planeId: string;
    planeKind: string;
    score: number;
    rationale: readonly string[];
    commandFingerprint: string;
    policy: Readonly<Record<string, unknown>>;
  }): void {
    ensure(input.planeId.trim().length > 0, "Execution plane id is required");
    ensure(input.planeKind.trim().length > 0, "Execution plane kind is required");
    ensure(Number.isFinite(input.score), "Execution plane score must be finite");
    ensure(input.commandFingerprint.trim().length > 0, "Execution command fingerprint is required");
    this.emit("EXECUTION_PLANE_SELECTED", {
      planeId: input.planeId,
      planeKind: input.planeKind,
      score: input.score,
      rationale: clone(input.rationale),
      commandFingerprint: input.commandFingerprint,
      policy: clone(input.policy),
    });
  }

  public recordExecutionCompleted(input: {
    planeId: string;
    commandFingerprint: string;
    exitCode: number | null;
    signal: string | null;
    stdoutSha256: string;
    stderrSha256: string;
    stdoutBytes: number;
    stderrBytes: number;
    durationMs: number;
  }): void {
    this.emit("EXECUTION_COMPLETED", {
      planeId: input.planeId,
      commandFingerprint: input.commandFingerprint,
      exitCode: input.exitCode,
      signal: input.signal,
      stdoutSha256: input.stdoutSha256,
      stderrSha256: input.stderrSha256,
      stdoutBytes: input.stdoutBytes,
      stderrBytes: input.stderrBytes,
      durationMs: input.durationMs,
    });
  }

  public recordExecutionFailed(input: {
    planeId: string;
    commandFingerprint: string;
    reason: string;
  }): void {
    ensure(input.reason.trim().length > 0, "Execution failure reason is required");
    this.emit("EXECUTION_FAILED", {
      planeId: input.planeId,
      commandFingerprint: input.commandFingerprint,
      reason: input.reason.slice(0, 2000),
    });
  }

  public abortActiveAttempt(reason: string): void {
    const phase = this.requireActivePhase();
    ensure(this.activeAttemptId, "No active attempt");
    ensure(reason.trim().length > 0, "Abort reason is required");
    const attemptId = this.activeAttemptId;
    this.updateAttemptState("ABORTED", true);
    this.emit("ATTEMPT_ABORTED", { phaseId: phase.id, attemptId, reason });
    this.phaseStates.set(phase.id, "REWORK");
    this.activePhaseId = null;
    this.activeAttemptId = null;
    this.missionState = "REWORK";
  }

  public beginVerification(): void {
    const phase = this.requireActivePhase();
    ensure(this.phaseStates.get(phase.id) === "RUNNING", "Phase is not running");
    this.phaseStates.set(phase.id, "VERIFYING");
    this.updateAttemptState("VERIFYING");
    this.missionState = "VERIFYING";
    this.emit("PHASE_VERIFYING", { phaseId: phase.id });
  }

  public recordArtifact(input: { id: string; path: string; content: string }): Artifact {
    const phase = this.requireActivePhase();
    const state = this.phaseStates.get(phase.id);
    ensure(state === "RUNNING" || state === "VERIFYING" || state === "REWORK", "Phase cannot write artifacts in its current state");
    this.assertPathAllowed(phase, input.path);
    const previous = this.committedByPath.get(input.path);
    ensure(this.activeAttemptId, "No active attempt");

    const artifact: Artifact = {
      id: input.id, missionId: this.constitution.missionId, path: input.path, content: input.content,
      sha256: sha256(input.content), version: (previous?.version ?? 0) + 1,
      phaseId: phase.id, attemptId: this.activeAttemptId, committed: false,
    };
    this.artifacts.set(artifact.id, artifact);
    this.emit("ARTIFACT_PROPOSED", { phaseId: phase.id, artifactId: artifact.id, path: artifact.path, sha256: artifact.sha256 });
    return clone(artifact);
  }

  public evaluateGates(results: readonly GateResult[]): GateStatus {
    const phase = this.requireActivePhase();
    ensure(this.phaseStates.get(phase.id) === "VERIFYING", "Phase is not in verification");
    ensure(results.length > 0, "At least one gate result is required");
    ensure(this.activeAttemptId, "No active attempt");

    const attemptId = this.activeAttemptId;
    const normalized = results.map(result => ({
      ...clone(result), phaseId: result.phaseId ?? phase.id, attemptId: result.attemptId ?? attemptId,
    }));
    for (const result of normalized) ensure(VALID_GATE_STATUSES.has(result.status), `Invalid gate status: ${String(result.status)}`);
    this.gateResults.push(...normalized);

    if (normalized.some(r => r.status === "FAIL")) {
      this.updateAttemptState("FAIL", true);
      this.phaseStates.set(phase.id, "REWORK");
      this.activePhaseId = null; this.activeAttemptId = null; this.missionState = "REWORK";
      this.emit("GATE_FAILED", { phaseId: phase.id, attemptId, results: clone(normalized) });
      return "FAIL";
    }

    if (normalized.some(r => r.status === "UNCERTAIN")) {
      this.updateAttemptState("UNCERTAIN", true);
      this.phaseStates.set(phase.id, "REWORK");
      this.activePhaseId = null; this.activeAttemptId = null; this.missionState = "REWORK";
      this.emit("GATE_UNCERTAIN", { phaseId: phase.id, attemptId, results: clone(normalized) });
      return "UNCERTAIN";
    }

    this.commitPhase(phase, normalized);
    return "PASS";
  }

  public requestReplan(request: ReplanRequest): void {
    ensure(this.missionState === "REWORK" || this.missionState === "VERIFYING" || this.missionState === "RUNNING", "Replan is unavailable in the current state");
    ensure(request.reason.trim().length > 0, "Replan reason is required");
    ensure(request.evidence.length > 0, "Replan requires evidence");
    this.assertConstitutionCompatible(request.proposedPlan);
    this.assertPlanIntegrity(request.proposedPlan);
    const fromVersion = this.plan?.version ?? 0;
    const record: ReplanRecord = {
      id: randomUUID(), missionId: this.constitution.missionId, fromPlanVersion: fromVersion,
      toPlanVersion: request.proposedPlan.version, reason: request.reason,
      evidence: clone(request.evidence), proposedPlan: clone(request.proposedPlan), accepted: true,
      createdAt: new Date().toISOString(),
    };
    this.replans.push(record);
    this.activePhaseId = null;
    this.activeAttemptId = null;
    this.missionState = "REPLANNING";
    this.emit("REPLAN_REQUESTED", { replanId: record.id, reason: request.reason, evidence: request.evidence, proposedVersion: request.proposedPlan.version });
    this.compilePlan(request.proposedPlan);
  }

  public buildContinuityCapsule(phaseId: string): ContinuityCapsule {
    const phase = this.getPhase(phaseId);
    ensure(this.phaseStates.get(phaseId) === "COMMITTED", "Continuity can only be emitted for committed phases");
    const artifactRefs = [...this.committedByPath.values()].filter(a => a.phaseId === phaseId).map(a => a.id);
    const capsule: ContinuityCapsule = {
      phaseId, status: "COMMITTED", artifactRefs,
      invariants: [...this.constitution.hardInvariants], acceptance: [...phase.acceptanceCriteria],
      architectureFacts: [...this.constitution.architecturalPrinciples], interfaces: [], decisions: [], unresolved: [],
    };
    this.capsules.set(phaseId, capsule);
    this.emit("CAPSULE_COMPILED", { phaseId, artifactRefs });
    return clone(capsule);
  }

  public getContinuityCapsule(phaseId: string): ContinuityCapsule {
    const capsule = this.capsules.get(phaseId); ensure(capsule, `No continuity capsule exists for ${phaseId}`); return clone(capsule);
  }
  public getArtifacts(): readonly Artifact[] { return clone([...this.artifacts.values()]); }
  public getContinuityCapsules(): readonly ContinuityCapsule[] { return clone([...this.capsules.values()]); }

  public registerContinuityCapsule(capsule: ContinuityCapsule): void {
    const phase = this.getPhase(capsule.phaseId);
    ensure(this.phaseStates.get(phase.id) === "COMMITTED", "Continuity can only be registered for committed phases");
    for (const artifactId of capsule.artifactRefs) {
      const artifact = this.artifacts.get(artifactId);
      ensure(artifact?.committed && artifact.phaseId === phase.id, `Continuity references an invalid artifact: ${artifactId}`);
    }
    this.capsules.set(capsule.phaseId, clone(capsule));
    this.emit("CAPSULE_REGISTERED", { phaseId: capsule.phaseId, artifactRefs: capsule.artifactRefs });
  }

  public snapshot(): MissionSnapshot {
    return clone({
      state: this.missionState, activePhaseId: this.activePhaseId, activeAttemptId: this.activeAttemptId,
      constitution: this.constitution, plan: this.plan, planHistory: this.getPlans(),
      phaseStates: Object.fromEntries(this.phaseStates.entries()), attempts: this.getAttempts(),
      artifacts: this.getArtifacts(), gateResults: this.getGateResults(), capsules: this.getContinuityCapsules(), replans: this.getReplans(),
    });
  }

  private commitPhase(phase: PhaseContract, results: readonly GateResult[]): void {
    ensure(this.activeAttemptId, "No active attempt to commit");
    const attemptId = this.activeAttemptId;
    const phaseArtifacts = [...this.artifacts.values()].filter(a => a.phaseId === phase.id && a.attemptId === attemptId && !a.committed);
    for (const artifact of phaseArtifacts) {
      const committed = { ...artifact, committed: true };
      this.artifacts.set(artifact.id, committed);
      this.committedByPath.set(artifact.path, committed);
    }

    this.updateAttemptState("PASS", true, true);
    this.phaseStates.set(phase.id, "COMMITTED");
    this.activePhaseId = null; this.activeAttemptId = null;
    const next = this.plan?.phases.find(p => this.phaseStates.get(p.id) === "LOCKED" && this.dependenciesSatisfied(p));
    if (next) this.phaseStates.set(next.id, "READY");
    this.missionState = this.allPhasesCommitted() ? "COMPLETED" : "READY";
    this.emit("PHASE_COMMITTED", { phaseId: phase.id, attemptId, gateCount: results.length, artifactCount: phaseArtifacts.length });
    if (this.missionState === "COMPLETED") this.emit("MISSION_COMPLETED", {});
  }

  private updateAttemptState(state: AttemptState, finished = false, committed = false): void {
    ensure(this.activeAttemptId, "No active attempt");
    const current = this.attempts.get(this.activeAttemptId);
    ensure(current, `Attempt not found: ${this.activeAttemptId}`);
    const now = new Date().toISOString();
    this.attempts.set(current.id, {
      ...current, state,
      ...(finished ? { finishedAt: now } : {}),
      ...(committed ? { committedAt: now } : {}),
    });
  }

  private getAttemptState(id: string): AttemptState { const attempt = this.attempts.get(id); ensure(attempt, `Attempt not found: ${id}`); return attempt.state; }
  private requireActiveAttempt(): PhaseAttempt { ensure(this.activeAttemptId, "No active attempt"); const attempt = this.attempts.get(this.activeAttemptId); ensure(attempt, `Attempt not found: ${this.activeAttemptId}`); return clone(attempt); }
  private assertConstitutionCompatible(plan: Plan): void {
    for (const phase of plan.phases) {
      if (phase.allowedPaths.some(path => phase.forbiddenPaths.includes(path))) throw new InvariantViolation(`Phase ${phase.id} allows and forbids the same path`);
      if (this.constitution.forbiddenScope.some(scope => phase.title.includes(scope))) throw new InvariantViolation(`Phase ${phase.id} overlaps forbidden mission scope`);
    }
  }

  private assertPlanIntegrity(plan: Plan): void {
    ensure(plan.version > 0 && Number.isInteger(plan.version), "Plan version must be a positive integer");
    ensure(plan.phases.length > 0, "Plan must contain at least one phase");
    const ids = new Set<string>();
    for (const phase of plan.phases) { ensure(!ids.has(phase.id), `Duplicate phase id: ${phase.id}`); ids.add(phase.id); }
    for (const phase of plan.phases) for (const dep of phase.dependencies) ensure(ids.has(dep), `Unknown dependency ${dep} in phase ${phase.id}`);
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new InvariantViolation(`Cyclic dependency detected at phase ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      const phase = plan.phases.find(p => p.id === id); ensure(phase, `Unknown phase ${id}`);
      for (const dep of phase.dependencies) visit(dep);
      visiting.delete(id); visited.add(id);
    };
    for (const phase of plan.phases) visit(phase.id);
  }

  private dependenciesSatisfied(phase: PhaseContract): boolean { return phase.dependencies.every(dep => this.phaseStates.get(dep) === "COMMITTED"); }
  private allPhasesCommitted(): boolean { return [...this.phaseStates.values()].every(state => state === "COMMITTED"); }
  private requireActivePhase(): PhaseContract { ensure(this.activePhaseId, "No active phase"); return this.getPhase(this.activePhaseId); }
  private getPhase(id: string): PhaseContract { const phase = this.plan?.phases.find(p => p.id === id); ensure(phase, `Unknown phase ${id}`); return phase; }
  private assertPathAllowed(phase: PhaseContract, path: string): void {
    if (phase.forbiddenPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) throw new ScopeViolation(`Path forbidden by phase contract: ${path}`);
    if (phase.allowedPaths.length > 0 && !phase.allowedPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) throw new ScopeViolation(`Path outside allowed write surface: ${path}`);
  }
  private computeConstitutionHash(input: Constitution): string { const { hash: _hash, ...rest } = input; return sha256(JSON.stringify(rest)); }
  private emit(type: string, data: Readonly<Record<string, unknown>>, phaseId?: string): void {
    const eventPhaseId = phaseId ?? this.activePhaseId ?? undefined; const eventAttemptId = this.activeAttemptId ?? undefined;
    this.events.push({ id: randomUUID(), type, missionId: this.constitution.missionId,
      ...(eventPhaseId ? { phaseId: eventPhaseId } : {}), ...(eventAttemptId ? { attemptId: eventAttemptId } : {}),
      timestamp: new Date().toISOString(), data: clone(data) });
  }
}

export { InvariantViolation, InvalidTransition, ScopeViolation, SheolError };
