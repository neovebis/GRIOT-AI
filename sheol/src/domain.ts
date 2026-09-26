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
