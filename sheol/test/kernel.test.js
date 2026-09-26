import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, SheolKernel, ScopeViolation, InvariantViolation } from '../dist/src/index.js';

function constitution() {
  const base = {
    missionId: 'm1',
    objective: 'Build a constrained site',
    hardInvariants: ['Use TypeScript', 'Do not expand scope'],
    scope: ['site'],
    forbiddenScope: ['marketplace'],
    globalConstraints: ['No new backend'],
    architecturalPrinciples: ['Component-first'],
    acceptanceCriteria: ['Build succeeds']
  };
  return { ...base, hash: sha256(JSON.stringify(base)) };
}

function plan() {
  return {
    version: 1,
    phases: [
      {
        id: 'P1', title: 'Implement button', objective: 'Implement button', dependencies: [],
        requiredOutputs: ['button'], allowedPaths: ['src/button'], forbiddenPaths: ['src/app'],
        allowedTools: ['fs'], acceptanceCriteria: ['button exists']
      },
      {
        id: 'P2', title: 'Test button', objective: 'Test button', dependencies: ['P1'],
        requiredOutputs: ['tests'], allowedPaths: ['test/button'], forbiddenPaths: [],
        allowedTools: ['fs'], acceptanceCriteria: ['tests pass']
      }
    ]
  };
}

test('phase lock + artifact scope + atomic commit', () => {
  const k = new SheolKernel(constitution());
  k.compilePlan(plan());
  const p1 = k.startNextPhase();
  assert.equal(p1.id, 'P1');
  assert.throws(() => k.recordArtifact({ id: 'bad', path: 'src/app/x.ts', content: 'x' }), ScopeViolation);
  k.recordArtifact({ id: 'b1', path: 'src/button/Button.tsx', content: 'export const Button = () => null' });
  k.beginVerification();
  assert.equal(k.evaluateGates([{ gateId: 'G1', status: 'PASS', reasons: [], evidence: ['b1'] }]), 'PASS');
  assert.equal(k.state, 'READY');
  const capsule = k.buildContinuityCapsule('P1');
  assert.deepEqual(capsule.artifactRefs, ['b1']);
  const p2 = k.startNextPhase();
  assert.equal(p2.id, 'P2');
});

test('failed gate enters rework and failed attempt is isolated', () => {
  const k = new SheolKernel(constitution());
  k.compilePlan(plan());
  k.startNextPhase();
  k.recordArtifact({ id: 'b1', path: 'src/button/Button.tsx', content: 'bad' });
  k.beginVerification();
  assert.equal(k.evaluateGates([{ gateId: 'G1', status: 'FAIL', reasons: ['missing behavior'], evidence: [] }]), 'FAIL');
  assert.equal(k.state, 'REWORK');
  assert.equal(k.activePhase, null);

  k.startNextPhase();
  const repaired = k.recordArtifact({ id: 'b2', path: 'src/button/Button.tsx', content: 'good' });
  k.beginVerification();
  assert.equal(k.evaluateGates([{ gateId: 'G1', status: 'PASS', reasons: [], evidence: ['b2'] }]), 'PASS');

  const artifacts = k.getArtifacts();
  assert.equal(artifacts.find(a => a.id === 'b1')?.committed, false);
  assert.equal(artifacts.find(a => a.id === 'b2')?.committed, true);
  assert.notEqual(repaired.attemptId, artifacts.find(a => a.id === 'b1')?.attemptId);
});

test('replan requires evidence and preserves constitutional constraints', () => {
  const k = new SheolKernel(constitution());
  k.compilePlan(plan());
  k.startNextPhase();
  k.beginVerification();
  assert.throws(() => k.requestReplan({ reason: 'change', evidence: [], proposedPlan: plan() }), /evidence/i);
  const p = { ...plan(), version: 2 };
  k.requestReplan({ reason: 'P1 is incomplete', evidence: ['gate:G1'], proposedPlan: p });
  assert.equal(k.getPlan().version, 2);
});

test('forbidden mission scope cannot be hidden inside a plan', () => {
  const c = constitution();
  const k = new SheolKernel(c);
  const p = { version: 1, phases: [{ ...plan().phases[0], title: 'marketplace checkout' }] };
  assert.throws(() => k.compilePlan(p), InvariantViolation);
});
