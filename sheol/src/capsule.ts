import type { Artifact, ContinuityCapsule, Constitution, GateResult, PhaseContract } from './domain.js';

export interface CapsuleCompilationInput {
  readonly constitution: Constitution;
  readonly phase: PhaseContract;
  readonly committedArtifacts: readonly Artifact[];
  readonly gates: readonly GateResult[];
  readonly declaredDecisions?: readonly string[];
  readonly interfaces?: readonly string[];
  readonly architectureFacts?: readonly string[];
  readonly unresolved?: readonly string[];
}

export class ContinuityCapsuleCompiler {
  compile(input: CapsuleCompilationInput): ContinuityCapsule {
    const relevantGates = input.gates.filter(g => !g.phaseId || g.phaseId === input.phase.id);
    const unresolved = [
      ...(input.unresolved ?? []),
      ...relevantGates.filter(g => g.status !== 'PASS').flatMap(g => g.reasons),
    ];
    return {
      phaseId: input.phase.id,
      status: 'COMMITTED',
      artifactRefs: input.committedArtifacts.map(a => a.id),
      invariants: [...input.constitution.hardInvariants],
      acceptance: [...input.phase.acceptanceCriteria],
      architectureFacts: [
        ...new Set([
          ...input.constitution.architecturalPrinciples,
          ...(input.architectureFacts ?? []),
        ]),
      ],
      interfaces: [...new Set(input.interfaces ?? [])],
      decisions: [...new Set(input.declaredDecisions ?? [])],
      unresolved: [...new Set(unresolved)],
    };
  }
}
