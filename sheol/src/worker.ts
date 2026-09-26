export interface ArtifactInput {
  readonly id: string;
  readonly path: string;
}

export interface TechnicalHandoff {
  /** Compact phase-local facts required for the next phase. */
  readonly architectureFacts: readonly string[];
  readonly interfaces: readonly string[];
}

export interface WorkerContract {
  readonly missionId: string;
  readonly phaseId: string;
  readonly objective: string;
  readonly spine: {
    objective: string;
    hardInvariants: readonly string[];
    globalConstraints: readonly string[];
    architecturalPrinciples: readonly string[];
  };
  readonly scope: {
    allowedPaths: readonly string[];
    forbiddenPaths: readonly string[];
    allowedTools: readonly string[];
  };
  /**
   * Artifact metadata only. Previous phase contents are never injected into the
   * next worker's model context; tools/execution planes must be used to inspect
   * the actual workspace when inspection is required.
   */
  readonly inputs: readonly ArtifactInput[];
  readonly acceptanceCriteria: readonly string[];
  readonly continuity?: ContinuityView;
}

export interface ContinuityView {
  readonly phaseId: string;
  readonly artifactRefs: readonly string[];
  readonly architectureFacts: readonly string[];
  readonly interfaces: readonly string[];
  readonly decisions: readonly string[];
  readonly unresolved: readonly string[];
}

export interface WorkerResult {
  readonly artifacts: readonly {
    id: string;
    path: string;
    content: string;
  }[];
  readonly declaredDecisions: readonly string[];
  readonly unresolvedIssues: readonly string[];
  readonly technicalHandoff?: TechnicalHandoff;
  readonly claimedCompletion: boolean;
}
