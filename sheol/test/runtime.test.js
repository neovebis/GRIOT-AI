import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SheolKernel,
  CapabilityRouter,
  StaticModelProvider,
  GateEngine,
  RequiredOutputsGate,
  ContinuityCapsuleCompiler,
  InMemoryArtifactStore,
  InMemoryEventStore,
  SheolRuntime,
  sha256
} from '../dist/src/index.js';

function mission() {
  const base = {
    missionId: 'runtime-1',
    objective: 'Build a button',
    hardInvariants: ['Do not expand scope'],
    scope: ['button'],
    forbiddenScope: ['marketplace'],
    globalConstraints: [],
    architecturalPrinciples: ['component-first'],
    acceptanceCriteria: ['button exists']
  };
  return { ...base, hash: sha256(JSON.stringify(base)) };
}

const plan = {
  version: 1,
  phases: [
    {
      id: 'P1',
      title: 'Build button',
      objective: 'Build button',
      dependencies: [],
      requiredOutputs: ['src/Button.tsx'],
      allowedPaths: ['src'],
      forbiddenPaths: [],
      allowedTools: ['fs'],
      acceptanceCriteria: ['button exists']
    },
    {
      id: 'P2',
      title: 'Verify button',
      objective: 'Verify button',
      dependencies: ['P1'],
      requiredOutputs: ['test/Button.test.tsx'],
      allowedPaths: ['test'],
      forbiddenPaths: [],
      allowedTools: ['fs'],
      acceptanceCriteria: ['test exists']
    }
  ]
};

const providers = [
  new StaticModelProvider(
    {
      modelId: 'worker-a',
      capabilities: { coding: 0.95 },
      costPer1kTokens: 0.02,
      latencyMsP50: 500,
      reliability: 0.99
    },
    async c => {
      if (c.phaseId === 'P2') {
        assert.equal(c.continuity?.phaseId, 'P1');
        assert.deepEqual(c.continuity?.architectureFacts, ['component-first', 'Button API returns void']);
        assert.deepEqual(c.continuity?.interfaces, ['ButtonProps']);
        assert.equal(c.inputs[0].content, undefined);
      }
      return {
        artifacts:
          c.phaseId === 'P1'
            ? [{ id: 'a1', path: 'src/Button.tsx', content: 'export const Button = () => null' }]
            : [{ id: 'a2', path: 'test/Button.test.tsx', content: 'test("button",()=>{})' }],
        declaredDecisions: c.phaseId === 'P1' ? ['Use a single Button component'] : [],
        unresolvedIssues: [],
        technicalHandoff: c.phaseId === 'P1'
          ? { architectureFacts: ['Button API returns void'], interfaces: ['ButtonProps'] }
          : undefined,
        claimedCompletion: true
      };
    }
  )
];

test('runtime executes phase, gates, commits, emits capsule and then executes dependent phase', async () => {
  const kernel = new SheolKernel(mission());
  const eventStore = new InMemoryEventStore();
  const artifactStore = new InMemoryArtifactStore();
  const runtime = new SheolRuntime(kernel, {
    eventStore,
    artifactStore,
    router: new CapabilityRouter(providers),
    gateEngine: new GateEngine([new RequiredOutputsGate('outputs')]),
    capsuleCompiler: new ContinuityCapsuleCompiler()
  });

  await runtime.compilePlan(plan);

  const first = await runtime.executeNextPhase({
    requiredCapabilities: ['coding'],
    risk: 0.8
  });
  assert.equal(first?.status, 'PASS');
  assert.equal(first?.capsule?.artifactRefs[0], 'a1');
  assert.equal(kernel.getContinuityCapsule('P1').artifactRefs[0], 'a1');

  const second = await runtime.executeNextPhase({
    requiredCapabilities: ['coding'],
    risk: 0.8
  });
  assert.equal(second?.status, 'PASS');
  assert.equal(kernel.state, 'COMPLETED');
  assert.equal((await eventStore.list('runtime-1')).length > 0, true);
  assert.equal((await artifactStore.get('a2'))?.committed, true);
});


test('runtime records execution-plane selection and outcome without storing raw command output', async () => {
  const kernel = new SheolKernel(mission());
  const eventStore = new InMemoryEventStore();
  const artifactStore = new InMemoryArtifactStore();
  const runtime = new SheolRuntime(kernel, {
    eventStore,
    artifactStore,
    router: new CapabilityRouter(providers),
    gateEngine: new GateEngine([new RequiredOutputsGate('outputs')]),
    capsuleCompiler: new ContinuityCapsuleCompiler(),
    executionRouter: {
      async select() {
        return {
          adapter: {
            descriptor: {
              id: 'test-plane',
              kind: 'custom',
              capabilities: ['command'],
              reliability: 1,
              latencyMsP50: 1,
              costPerExecution: 0,
            },
            async probe() { return { available: true }; },
            async run() {
              return { exitCode: 0, signal: null, stdout: 'SECRET_OUTPUT', stderr: '', durationMs: 2 };
            },
          },
          score: 0.99,
          probe: { available: true },
          rationale: ['test'],
        };
      },
    },
  });
  const execution = await runtime.executeCommand(
    { requiredCapabilities: ['command'], risk: 1 },
    { executable: 'echo', args: ['secret'], cwd: '/tmp' },
  );
  assert.equal(execution.planeId, 'test-plane');
  const events = await eventStore.list('runtime-1');
  const selected = events.find(e => e.type === 'EXECUTION_PLANE_SELECTED');
  const completed = events.find(e => e.type === 'EXECUTION_COMPLETED');
  assert.equal(Boolean(selected), true);
  assert.equal(Boolean(completed), true);
  assert.equal(JSON.stringify(completed).includes('SECRET_OUTPUT'), false);
  assert.equal(JSON.stringify(selected).includes('secret'), false);
});
