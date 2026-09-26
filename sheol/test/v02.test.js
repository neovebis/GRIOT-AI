import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CapabilityRouter,
  StaticModelProvider,
  RequiredOutputsGate,
  GateEngine,
  ContinuityCapsuleCompiler,
  LocalSandboxExecutor,
  JsonlEventStore,
  FileArtifactStore,
  PostgresEventStore,
  PostgresArtifactStore,
  sha256
} from '../dist/src/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workerResult = {
  artifacts: [],
  declaredDecisions: [],
  unresolvedIssues: [],
  claimedCompletion: true
};

test('capability router chooses the highest utility provider for the requested capability', async () => {
  const slow = new StaticModelProvider(
    {
      modelId: 'slow',
      capabilities: { coding: 0.7 },
      costPer1kTokens: 0.01,
      latencyMsP50: 1000,
      reliability: 0.8
    },
    async () => workerResult
  );
  const strong = new StaticModelProvider(
    {
      modelId: 'strong',
      capabilities: { coding: 0.98 },
      costPer1kTokens: 0.05,
      latencyMsP50: 1500,
      reliability: 0.99
    },
    async () => workerResult
  );
  const router = new CapabilityRouter([slow, strong]);
  const selected = router.select({}, { requiredCapabilities: ['coding'], risk: 1 });
  assert.equal(selected.profile.modelId, 'strong');
});

test('gate engine performs deterministic required-output validation', async () => {
  const engine = new GateEngine([new RequiredOutputsGate('outputs')]);
  const [result] = await engine.evaluate({
    phaseId: 'P1',
    requiredOutputs: ['src/x.ts'],
    artifactPaths: ['src/x.ts'],
    acceptanceCriteria: []
  });
  assert.equal(result.status, 'PASS');
});

test('continuity capsule is compiled from committed evidence', () => {
  const base = {
    missionId: 'm',
    objective: 'x',
    hardInvariants: ['i'],
    scope: ['x'],
    forbiddenScope: [],
    globalConstraints: [],
    architecturalPrinciples: ['a'],
    acceptanceCriteria: ['ok']
  };
  const constitution = { ...base, hash: sha256(JSON.stringify(base)) };
  const phase = {
    id: 'P1',
    title: 'x',
    objective: 'x',
    dependencies: [],
    requiredOutputs: [],
    allowedPaths: [],
    forbiddenPaths: [],
    allowedTools: [],
    acceptanceCriteria: ['ok']
  };
  const artifact = {
    missionId: 'm',
    id: 'a',
    path: 'x',
    content: 'x',
    sha256: sha256('x'),
    version: 1,
    phaseId: 'P1',
    attemptId: 'P1:attempt:1',
    committed: true
  };
  const capsule = new ContinuityCapsuleCompiler().compile({
    constitution,
    phase,
    committedArtifacts: [artifact],
    gates: [{ phaseId: 'P1', gateId: 'g', status: 'PASS', reasons: [], evidence: ['a'] }]
  });
  assert.deepEqual(capsule.artifactRefs, ['a']);
  assert.deepEqual(capsule.invariants, ['i']);
});

test('local sandbox executes without a shell and enforces process completion', async () => {
  const sandbox = new LocalSandboxExecutor();
  const result = await sandbox.run({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write("ok")'],
    cwd: process.cwd(),
    timeoutMs: 5000
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'ok');
});

test('jsonl and file artifact stores persist state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sheol-'));
  try {
    const eventStore = new JsonlEventStore(join(root, 'events.jsonl'));
    await eventStore.append({
      id: 'e1',
      type: 'TEST',
      missionId: 'm',
      timestamp: new Date().toISOString(),
      data: {}
    });
    assert.equal((await eventStore.list('m')).length, 1);

    const artifacts = new FileArtifactStore(join(root, 'artifacts'));
    const artifact = {
      missionId: 'm',
      id: 'a1',
      path: 'x',
      content: 'x',
      sha256: sha256('x'),
      version: 1,
      phaseId: 'P1',
      attemptId: 'a1',
      committed: true
    };
    await artifacts.put(artifact);
    assert.deepEqual(await artifacts.get('a1'), artifact);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('postgres persistence adapters emit parameterized queries without embedding mission data', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };

  const events = new PostgresEventStore(db);
  await events.append({
    id: 'e1',
    missionId: 'm1',
    phaseId: 'P1',
    attemptId: 'attempt-1',
    type: 'PHASE_STARTED',
    timestamp: '2026-09-26T00:00:00.000Z',
    data: { x: 'ok' }
  });
  assert.match(calls[0].sql, /insert into private\.sheol_events/);
  assert.equal(calls[0].params[0], 'e1');
  assert.equal(calls[0].params[1], 'm1');
  assert.equal(calls[0].params[2], 'P1');
  assert.equal(calls[0].params[3], 'attempt-1');

  const artifacts = new PostgresArtifactStore(db);
  await artifacts.put({
    missionId: 'm1',
    id: 'artifact-1',
    path: 'src/x.ts',
    content: 'x',
    sha256: sha256('x'),
    version: 1,
    phaseId: 'P1',
    attemptId: 'attempt-1',
    committed: false
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params[0], 'artifact-1');
  assert.equal(calls[1].params[2], 'P1');
  assert.equal(calls[1].params[3], 'attempt-1');
});

test('postgres mission persistence atomically projects mission state, attempts, gates, capsules, replans and events', async () => {
  const calls = [];
  const tx = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };
  const db = {
    query: tx.query,
    transaction: async fn => fn(tx)
  };
  const { PostgresMissionPersistence } = await import('../dist/src/index.js');
  const store = new PostgresMissionPersistence(db);
  const base = {
    missionId: 'm',
    objective: 'build',
    hardInvariants: ['no-scope-expansion'],
    scope: ['x'],
    forbiddenScope: ['y'],
    globalConstraints: [],
    architecturalPrinciples: ['component-first'],
    acceptanceCriteria: ['ok']
  };
  const snapshot = {
    state: 'READY',
    activePhaseId: null,
    activeAttemptId: null,
    constitution: { ...base, hash: sha256(JSON.stringify(base)) },
    plan: {
      version: 2,
      phases: [{
        id: 'P1',
        title: 'build',
        objective: 'build',
        dependencies: [],
        requiredOutputs: ['src/x.ts'],
        allowedPaths: ['src'],
        forbiddenPaths: [],
        allowedTools: ['fs'],
        acceptanceCriteria: ['ok']
      }]
    },
    planHistory: [
      { version: 1, phases: [] },
      {
        version: 2,
        phases: [{
          id: 'P1',
          title: 'build',
          objective: 'build',
          dependencies: [],
          requiredOutputs: ['src/x.ts'],
          allowedPaths: ['src'],
          forbiddenPaths: [],
          allowedTools: ['fs'],
          acceptanceCriteria: ['ok']
        }]
      }
    ],
    phaseStates: { P1: 'COMMITTED' },
    attempts: [{
      id: 'attempt-1',
      missionId: 'm',
      phaseId: 'P1',
      attemptNo: 1,
      state: 'PASS',
      modelId: 'worker-a',
      request: { risk: 1 },
      result: { ok: true },
      startedAt: '2026-09-26T00:00:00.000Z',
      finishedAt: '2026-09-26T00:00:01.000Z',
      committedAt: '2026-09-26T00:00:02.000Z'
    }],
    artifacts: [{
      missionId: 'm',
      id: 'a1',
      path: 'src/x.ts',
      content: 'x',
      sha256: sha256('x'),
      version: 1,
      phaseId: 'P1',
      attemptId: 'attempt-1',
      committed: true
    }],
    gateResults: [{
      phaseId: 'P1',
      attemptId: 'attempt-1',
      gateId: 'outputs',
      status: 'PASS',
      reasons: [],
      evidence: ['a1']
    }],
    capsules: [{
      phaseId: 'P1',
      status: 'COMMITTED',
      artifactRefs: ['a1'],
      invariants: ['no-scope-expansion'],
      acceptance: ['ok'],
      architectureFacts: ['component-first'],
      interfaces: [],
      decisions: [],
      unresolved: []
    }],
    replans: [{
      id: 'r1',
      missionId: 'm',
      fromPlanVersion: 1,
      toPlanVersion: 2,
      reason: 'evidence',
      evidence: ['e1'],
      proposedPlan: { version: 2, phases: [] },
      accepted: true,
      createdAt: '2026-09-26T00:00:03.000Z'
    }]
  };

  await store.persist(snapshot, [{
    id: 'e1',
    type: 'PHASE_COMMITTED',
    missionId: 'm',
    phaseId: 'P1',
    attemptId: 'attempt-1',
    timestamp: '2026-09-26T00:00:02.000Z',
    data: { ok: true }
  }]);

  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_missions')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_plans')).length, 2);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_attempts')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_artifacts')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_gates')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_capsules')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_replans')).length, 1);
  assert.equal(calls.filter(c => c.sql.includes('insert into private.sheol_events')).length, 1);
  assert.equal(calls.some(c => c.params?.includes('attempt-1')), true);
});
