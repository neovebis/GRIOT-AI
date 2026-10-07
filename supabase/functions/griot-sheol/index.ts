import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
export type MissionState =
  | "CREATED" | "PLANNED" | "READY" | "RUNNING" | "VERIFYING"
  | "REWORK" | "REPLANNING" | "COMMITTED" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PhaseState = "LOCKED" | "READY" | "RUNNING" | "VERIFYING" | "REWORK" | "COMMITTED" | "FAILED";
export type GateStatus = "PASS" | "FAIL" | "UNCERTAIN";
export type AttemptState = "RUNNING" | "VERIFYING" | "PASS" | "FAIL" | "UNCERTAIN" | "ABORTED";

export interface Constitution {
  readonly missionId: string;
  readonly objective: string;
  readonly hardInvariants: readonly string[];
  readonly scope: readonly string[];
  readonly forbiddenScope: readonly string[];
  readonly globalConstraints: readonly string[];
  readonly architecturalPrinciples: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly hash: string;
}

export interface PhaseContract {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly dependencies: readonly string[];
  readonly requiredOutputs: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly allowedTools: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface Plan { readonly version: number; readonly phases: readonly PhaseContract[]; }

export interface Artifact {
  readonly missionId: string; readonly id: string; readonly path: string; readonly content: string;
  readonly sha256: string; readonly version: number; readonly phaseId: string; readonly attemptId: string;
  readonly committed: boolean;
}

export interface GateResult {
  readonly phaseId?: string;
  readonly attemptId?: string;
  readonly gateId: string;
  readonly status: GateStatus;
  readonly reasons: readonly string[];
  readonly evidence: readonly string[];
}

export interface PhaseAttempt {
  readonly id: string;
  readonly missionId: string;
  readonly phaseId: string;
  readonly attemptNo: number;
  readonly state: AttemptState;
  readonly modelId?: string;
  readonly request?: unknown;
  readonly result?: unknown;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly committedAt?: string;
}

export interface ContinuityCapsule {
  readonly phaseId: string;
  readonly status: "COMMITTED";
  readonly artifactRefs: readonly string[];
  readonly invariants: readonly string[];
  readonly acceptance: readonly string[];
  readonly architectureFacts: readonly string[];
  readonly interfaces: readonly string[];
  readonly decisions: readonly string[];
  readonly unresolved: readonly string[];
}

export interface ReplanRequest { readonly reason: string; readonly evidence: readonly string[]; readonly proposedPlan: Plan; }

export interface ReplanRecord {
  readonly id: string;
  readonly missionId: string;
  readonly fromPlanVersion: number;
  readonly toPlanVersion: number;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly proposedPlan: Plan;
  readonly accepted: boolean;
  readonly createdAt: string;
}

export interface EventRecord {
  readonly id: string; readonly type: string; readonly missionId: string;
  readonly phaseId?: string; readonly attemptId?: string; readonly timestamp: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface MissionSnapshot {
  readonly state: MissionState;
  readonly activePhaseId: string | null;
  readonly activeAttemptId: string | null;
  readonly constitution: Constitution;
  readonly plan: Plan | null;
  readonly planHistory: readonly Plan[];
  readonly phaseStates: Readonly<Record<string, PhaseState>>;
  readonly attempts: readonly PhaseAttempt[];
  readonly artifacts: readonly Artifact[];
  readonly gateResults: readonly GateResult[];
  readonly capsules: readonly ContinuityCapsule[];
  readonly replans: readonly ReplanRecord[];
}

export class SheolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SheolError";
  }
}

export class InvariantViolation extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "InvariantViolation";
  }
}

export class InvalidTransition extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidTransition";
  }
}

export class ScopeViolation extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "ScopeViolation";
  }
}

import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

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

type Row = Record<string, any>;
type SheolCtx = { user:any; workspaceId:string; role:string; db:any; authorization:string };
class ApiError extends Error { constructor(readonly status:number,message:string){ super(message); this.name="ApiError"; } }
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";
const GATEWAY_KEY=Deno.env.get("GRIOT_EXECUTION_GATEWAY_INTERNAL_KEY")||"";
const MUTATION_TOOLS=new Set(["workspace.write","workspace.delete","workspace.rename","archive.extract"]);
const VERIFIER_TOOLS=new Set(["test.run","build.run"]);
const EXECUTION_TOOLS=new Set(["command.execute","test.run","build.run"]);
const ALL_TOOLS=new Set(["workspace.list","workspace.read","workspace.write","workspace.delete","workspace.rename","archive.extract","command.execute","test.run","build.run"]);
function ensureConfig(){ if(!URL||!ANON||!SERVICE) throw new ApiError(503,"Supabase server keys are not configured"); if(GATEWAY_KEY.length<32) throw new ApiError(503,"SHEOL execution bridge is not configured"); }
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function cors(req:Request){const h=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-griot-workspace-id","access-control-max-age":"86400","vary":"Origin"});const o=req.headers.get("origin");if(!o||["https://griot.pt","https://canary.griot.pt","https://studio-canary.griot.pt","http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173"].includes(o))h.set("access-control-allow-origin",o||"https://griot.pt");return h;}
function out(req:Request,v:unknown,s=200){return new Response(JSON.stringify(v),{status:s,headers:cors(req)});}
async function jsonBody(req:Request):Promise<Row>{try{const v=await req.json();if(!v||typeof v!=="object"||Array.isArray(v))throw 0;return v as Row;}catch{throw new ApiError(400,"Invalid JSON body");}}
function userClient(a:string){return createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:a}}});}
function adminClient(){return createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});}
async function auth(req:Request):Promise<SheolCtx>{ensureConfig();const a=req.headers.get("authorization")||"";if(!a.toLowerCase().startsWith("bearer "))throw new ApiError(401,"Authentication required");const u=await userClient(a).auth.getUser();if(u.error||!u.data.user)throw new ApiError(401,"Invalid or expired session");const db=adminClient(),requested=req.headers.get("x-griot-workspace-id")?.trim()||"";let q=db.from("griot_workspace_members").select("workspace_id,role,created_at").eq("user_id",u.data.user.id).order("created_at",{ascending:true});q=requested?q.eq("workspace_id",requested):q.limit(1);const m=await q.maybeSingle();if(m.error)throw new ApiError(500,"Could not validate workspace membership");if(!m.data)throw new ApiError(403,"No workspace access");return{user:u.data.user,workspaceId:m.data.workspace_id,role:m.data.role,db,authorization:a};}
function asStrings(v:unknown):string[]{return Array.isArray(v)?v.map(String).map(x=>x.trim()).filter(Boolean):[];}
function boundedInt(v:unknown,fallback:number,min:number,max:number){const n=Number(v);return Number.isSafeInteger(n)?Math.max(min,Math.min(max,n)):fallback;}
function record(v:unknown):Row|null{return v&&typeof v==="object"&&!Array.isArray(v)?v as Row:null;}
async function assertMissionOwnership(c:SheolCtx,missionId:string){const q=await c.db.schema("private").from("sheol_missions").select("mission_id,owner_user_id").eq("mission_id",missionId).maybeSingle();if(q.error)throw new ApiError(500,"Could not validate SHEOL mission ownership");if(q.data&&q.data.owner_user_id&&q.data.owner_user_id!==c.user.id)throw new ApiError(409,"Mission id already belongs to another user");}
function phaseSpecs(input:unknown){const map=new Map<string,Row>();if(Array.isArray(input)){for(const raw of input){const item=record(raw),id=String(item?.phaseId||"").trim();if(!id||map.has(id))throw new ApiError(400,"Each phaseExecution requires a unique phaseId");map.set(id,item!);}}else if(record(input)){for(const [id,raw] of Object.entries(input as Row)){const item=record(raw);if(!item)throw new ApiError(400,"phaseExecutions entries must be objects");map.set(id,{...item,phaseId:id});}}return map;}
function validatePlanShape(plan:any){if(!plan||!Number.isInteger(Number(plan.version))||Number(plan.version)<1)throw new ApiError(400,"plan.version must be a positive integer");if(!Array.isArray(plan.phases)||!plan.phases.length)throw new ApiError(400,"A non-empty plan is required");if(plan.phases.length>64)throw new ApiError(400,"Plan exceeds 64 phases");for(const p of plan.phases){if(!p||typeof p!=="object"||!String(p.id||"").trim()||!String(p.title||"").trim())throw new ApiError(400,"Every phase requires id and title");p.objective=String(p.objective||p.title);p.dependencies=asStrings(p.dependencies);p.requiredOutputs=asStrings(p.requiredOutputs);p.allowedPaths=asStrings(p.allowedPaths);p.forbiddenPaths=asStrings(p.forbiddenPaths);p.allowedTools=asStrings(p.allowedTools);p.acceptanceCriteria=asStrings(p.acceptanceCriteria);}}
type ToolReceipt={tool:string;ok:boolean;approvalRequired:boolean;status:number;state:string|null;exitCode:number|null;executionId:string|null;resultSha256:string;result:unknown};
async function digest(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function executeTool(c:SheolCtx,projectId:string,tool:string,input:Row):Promise<ToolReceipt>{if(!ALL_TOOLS.has(tool))throw new ApiError(400,"Unsupported SHEOL tool: "+tool);const controller=new AbortController(),timeoutMs=EXECUTION_TOOLS.has(tool)?600000:tool==="archive.extract"?240000:90000,timer=setTimeout(()=>controller.abort(),timeoutMs);let response:Response;try{response=await fetch(URL+"/functions/v1/griot-studio-compute/projects/"+encodeURIComponent(projectId)+"/agent/tool",{method:"POST",headers:{authorization:c.authorization,apikey:ANON,"content-type":"application/json","x-griot-workspace-id":c.workspaceId,"x-griot-execution-gateway-key":GATEWAY_KEY},body:JSON.stringify({tool,input}),signal:controller.signal});}catch(e){if(e instanceof DOMException&&e.name==="AbortError")throw new ApiError(504,"SHEOL tool timed out: "+tool);throw new ApiError(502,"SHEOL could not reach Studio Compute for "+tool);}finally{clearTimeout(timer);}const raw=await response.text();let payload:unknown={};try{payload=raw?JSON.parse(raw):{};}catch{payload={error:"non-json-tool-response",raw:raw.slice(0,1000)};}const obj=record(payload)||{},nested=record(obj.result)||record(obj.execution)||{},stateRaw=obj.state??nested.state??obj.status??nested.status,state=typeof stateRaw==="string"?stateRaw.toLowerCase():null,exitRaw=obj.exitCode??obj.exit_code??nested.exitCode??nested.exit_code,exitNum=Number(exitRaw),exitCode=Number.isSafeInteger(exitNum)?exitNum:null,idRaw=obj.executionId??obj.execution_id??obj.requestId??nested.executionId??nested.execution_id??nested.requestId,executionId=typeof idRaw==="string"&&idRaw.trim()?idRaw.trim().slice(0,200):null,approvalRequired=response.status===202||state==="approval_required",failedState=state!==null&&["failed","error","cancelled","aborted","blocked"].includes(state),successState=state!==null&&["completed","succeeded","success","ok","ready"].includes(state),executionEvidence=!EXECUTION_TOOLS.has(tool)||successState||exitCode===0,ok=response.ok&&!approvalRequired&&!failedState&&(exitCode===null||exitCode===0)&&executionEvidence;return{tool,ok,approvalRequired,status:response.status,state,exitCode,executionId,resultSha256:await digest(JSON.stringify(payload)),result:payload};}
function enforceAllowedTool(phase:any,tool:string){if(Array.isArray(phase.allowedTools)&&phase.allowedTools.length&&!phase.allowedTools.includes(tool))throw new ApiError(409,"Phase "+phase.id+" does not allow tool "+tool);}
function gateFromReceipt(gateId:string,r:ToolReceipt):GateResult{if(r.approvalRequired)return{gateId,status:"UNCERTAIN",reasons:["Execution requires explicit user approval"],evidence:[r.resultSha256,r.executionId||"no-execution-id"]};if(!r.ok)return{gateId,status:"FAIL",reasons:["Tool "+r.tool+" did not produce successful execution evidence"],evidence:[r.resultSha256,String(r.status),r.state||"no-state",String(r.exitCode)]};return{gateId,status:"PASS",reasons:["Audited execution receipt satisfied the gate"],evidence:[r.resultSha256,r.executionId||"no-execution-id",r.state||"no-state",String(r.exitCode)]};}
async function persist(c:SheolCtx,k:SheolKernel){const snap=k.snapshot(),p=await c.db.rpc("sheol_persist_runtime_state",{p_owner_user_id:c.user.id,p_snapshot:{...snap,events:k.eventLedger}});if(p.error)throw new ApiError(500,"SHEOL persistence failed: "+p.error.message);return p.data;}
async function meter(c:SheolCtx,missionId:string,phaseId:string,attemptId:string,started:number){const ms=Math.max(0,performance.now()-started),m=await c.db.rpc("griot_gcu_meter_event",{p_workspace_id:c.workspaceId,p_user_id:c.user.id,p_idempotency_key:("sheol:"+missionId+":"+phaseId+":"+attemptId).slice(0,255),p_component:"sheol",p_operation:"phase_execution",p_metrics:{compute_seconds:ms/1000},p_metadata:{missionId,phaseId,measurement:"SHEOL managed phase wall-clock including Studio Compute calls"},p_project_id:null,p_duration_ms:ms});if(m.error)throw new ApiError(402,"GCU metering failed: "+m.error.message);return m.data;}
async function runManaged(req:Request){const c=await auth(req),b=await jsonBody(req);if(b.phaseResults||b.gates)throw new ApiError(400,"Client-supplied phaseResults/gates are not accepted by SHEOL 1.0 managed mode");const raw=record(b.constitution)||record(b.mission);if(!raw)throw new ApiError(400,"constitution or mission is required");const missionId=String(raw.missionId||"").trim();if(!uuid(missionId))throw new ApiError(400,"missionId must be a UUID");const objective=String(raw.objective||"").trim();if(!objective||objective.length>20000)throw new ApiError(400,"objective must contain 1-20000 characters");await assertMissionOwnership(c,missionId);const base={missionId,objective,hardInvariants:asStrings(raw.hardInvariants),scope:asStrings(raw.scope),forbiddenScope:asStrings(raw.forbiddenScope),globalConstraints:asStrings(raw.globalConstraints),architecturalPrinciples:asStrings(raw.architecturalPrinciples),acceptanceCriteria:asStrings(raw.acceptanceCriteria)},con={...base,hash:sha256(JSON.stringify(base))},plan=b.plan;validatePlanShape(plan);const projectId=String(b.projectId||"").trim();if(!uuid(projectId))throw new ApiError(400,"projectId is required and must be a UUID");const specs=phaseSpecs(b.phaseExecutions);for(const p of plan.phases)if(!specs.has(String(p.id)))throw new ApiError(400,"Missing phaseExecution for "+p.id);const k=new SheolKernel(con);k.compilePlan(plan);const phaseReceipts:Row[]=[];const maxPhases=boundedInt(b.maxPhases,plan.phases.length,1,plan.phases.length);for(let phaseIndex=0;phaseIndex<maxPhases&&k.state!=="COMPLETED";phaseIndex++){const phaseStarted=performance.now(),phase=k.startNextPhase(),spec=specs.get(phase.id)!,modelId=String(spec.modelId||"sheol-managed-worker").slice(0,200);k.recordWorkerSelection(modelId,{projectId,phaseId:phase.id,actionCount:Array.isArray(spec.actions)?spec.actions.length:0,verifierCount:Array.isArray(spec.verifiers)?spec.verifiers.length:0});const actions=Array.isArray(spec.actions)?spec.actions:[],verifiers=Array.isArray(spec.verifiers)?spec.verifiers:[];if(!verifiers.length)throw new ApiError(400,"Phase "+phase.id+" requires at least one test.run or build.run verifier");const receipts:ToolReceipt[]=[];let hasMutation=false;for(let i=0;i<actions.length;i++){const a=record(actions[i]);if(!a)throw new ApiError(400,"Invalid action "+i+" for phase "+phase.id);const tool=String(a.tool||"");enforceAllowedTool(phase,tool);hasMutation=hasMutation||MUTATION_TOOLS.has(tool);const fp=await digest(JSON.stringify({tool,input:record(a.input)||{}}));k.recordExecutionPlaneSelection({planeId:"griot-studio-compute",planeKind:"connected-compute",score:1,rationale:["Phase contract selected Studio Compute audited tool surface"],commandFingerprint:fp,policy:{tool,projectId,allowedByPhase:true}});const receipt=await executeTool(c,projectId,tool,record(a.input)||{});receipts.push(receipt);if(receipt.ok)k.recordExecutionCompleted({planeId:"griot-studio-compute",commandFingerprint:fp,exitCode:receipt.exitCode,signal:null,stdoutSha256:receipt.resultSha256,stderrSha256:await digest(""),stdoutBytes:JSON.stringify(receipt.result).length,stderrBytes:0,durationMs:0});else k.recordExecutionFailed({planeId:"griot-studio-compute",commandFingerprint:fp,reason:"tool="+tool+" status="+receipt.status+" state="+receipt.state});if(receipt.approvalRequired||!receipt.ok)break;}k.recordWorkerResult({source:"studio-compute-receipts",receipts:receipts.map(r=>({tool:r.tool,ok:r.ok,approvalRequired:r.approvalRequired,status:r.status,state:r.state,exitCode:r.exitCode,executionId:r.executionId,resultSha256:r.resultSha256}))});for(const rawArt of (Array.isArray(spec.artifacts)?spec.artifacts:[])){const art=record(rawArt);if(!art)throw new ApiError(400,"Invalid artifact declaration for phase "+phase.id);const path=String(art.path||"").trim();if(!path)throw new ApiError(400,"Artifact path is required");k.recordArtifact({id:uuid(art.id)?art.id:randomUUID(),path,content:String(art.content??"")});}k.beginVerification();const gates:GateResult[]=[];for(let i=0;i<receipts.length;i++)if(!receipts[i].ok||receipts[i].approvalRequired)gates.push(gateFromReceipt("action:"+(i+1)+":"+receipts[i].tool,receipts[i]));if(!gates.some(g=>g.status!=="PASS")){for(let i=0;i<verifiers.length;i++){const v=record(verifiers[i]);if(!v)throw new ApiError(400,"Invalid verifier "+i+" for phase "+phase.id);const tool=String(v.tool||"");if(!VERIFIER_TOOLS.has(tool))throw new ApiError(400,"Verifier "+i+" for phase "+phase.id+" must use test.run or build.run");enforceAllowedTool(phase,tool);const receipt=await executeTool(c,projectId,tool,record(v.input)||{});receipts.push(receipt);gates.push(gateFromReceipt(String(v.id||tool+":"+(i+1)),receipt));if(receipt.approvalRequired)break;}}if(!gates.length)throw new ApiError(500,"Phase "+phase.id+" produced no verification gates");const status=k.evaluateGates(gates),attempts=k.getAttempts().filter(a=>a.phaseId===phase.id),attemptId=attempts.at(-1)?.id||phase.id,gcu=await meter(c,missionId,phase.id,attemptId,phaseStarted);phaseReceipts.push({phaseId:phase.id,status,hasMutation,attempts:attempts.length,receipts:receipts.map(r=>({tool:r.tool,ok:r.ok,approvalRequired:r.approvalRequired,status:r.status,state:r.state,exitCode:r.exitCode,executionId:r.executionId,resultSha256:r.resultSha256})),gates,gcu});if(status!=="PASS")break;k.buildContinuityCapsule(phase.id);}const persistence=await persist(c,k),snap=k.snapshot(),ok=snap.state==="COMPLETED";return{ok,service:"griot-sheol",kernel:"SHEOL",version:"1.0.0",mode:"managed-receipt-gates",missionId,projectId,workspaceId:c.workspaceId,state:snap.state,activePhaseId:snap.activePhaseId,phaseStates:snap.phaseStates,verificationAuthority:"server-derived-from-studio-compute-receipts",clientSuppliedGatesAccepted:false,phaseReceipts,events:k.eventLedger,persistence};}
async function dispatch(req:Request){if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method==="GET")return out(req,{ok:true,service:"griot-sheol",kernel:"SHEOL",version:"1.0.0",mode:"managed-receipt-gates",clientSuppliedGatesAccepted:false,studioComputeVerification:true,workspaceBound:true});if(req.method==="POST")return out(req,await runManaged(req));throw new ApiError(404,"Route not found");}
Deno.serve(async req=>{try{return await dispatch(req);}catch(e){if(e instanceof ApiError)return out(req,{error:e.message},e.status);if(e instanceof InvariantViolation||e instanceof ScopeViolation||e instanceof InvalidTransition||e instanceof SheolError)return out(req,{error:e.message,type:e.name},409);console.error("griot-sheol",e);return out(req,{error:"Internal server error"},500);}});