import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionPlaneRouter } from '../dist/src/execution.js';

function adapter(id, available, capabilities, reliability=0.9) {
  return {
    descriptor: { id, kind: 'custom', capabilities, reliability, latencyMsP50: 100, costPerExecution: 0 },
    async probe() { return available ? { available: true } : { available: false, reason: 'offline' }; },
    async run() { throw new Error('not used'); },
  };
}

test('execution plane router uses any available compatible plane, not a sandbox-specific default', async () => {
  const router = new ExecutionPlaneRouter([
    adapter('local', true, ['command', 'workspace'], 0.7),
    adapter('griot-sandbox', true, ['command', 'workspace'], 0.99),
  ]);
  const selected = await router.select({ requiredCapabilities: ['command', 'workspace'], risk: 1 });
  assert.equal(selected.adapter.descriptor.id, 'griot-sandbox');
});

test('execution plane router skips unavailable planes and fail-closes when none fit', async () => {
  const router = new ExecutionPlaneRouter([adapter('remote', false, ['command'], 1)]);
  await assert.rejects(() => router.select({ requiredCapabilities: ['command'], risk: 1 }), /No available execution plane/);
});

test('routed command gates execute on the selected available plane', async () => {
  let calls = 0;
  const make = (id, available) => ({
    descriptor: { id, kind: 'custom', capabilities: ['command'], reliability: id === 'remote' ? 0.99 : 0.5, latencyMsP50: 10, costPerExecution: 0 },
    async probe() { return { available }; },
    async run() { calls++; return { exitCode: 0, signal: null, stdout: id, stderr: '', durationMs: 1 }; },
  });
  const router = new ExecutionPlaneRouter([make('local', true), make('remote', true)]);
  const selection = await router.select({ requiredCapabilities: ['command'], risk: 1 });
  assert.equal(selection.adapter.descriptor.id, 'remote');
  assert.equal(calls, 0);
});


test('execution plane policy can require explicit isolation and reliability', async () => {
  const router = new ExecutionPlaneRouter([
    {
      descriptor: { id: 'host', kind: 'local', capabilities: ['command'], reliability: 0.99, latencyMsP50: 10, costPerExecution: 0, isolation: 'none', networkAccess: 'internet' },
      async probe() { return { available: true }; },
      async run() { throw new Error('not used'); },
    },
    {
      descriptor: { id: 'container', kind: 'custom', capabilities: ['command'], reliability: 0.96, latencyMsP50: 40, costPerExecution: 0.01, isolation: 'container', networkAccess: 'restricted' },
      async probe() { return { available: true }; },
      async run() { throw new Error('not used'); },
    },
  ]);
  const selected = await router.select({
    requiredCapabilities: ['command'],
    risk: 1,
    requiredIsolation: 'container',
    requiredNetworkAccess: 'restricted',
    minReliability: 0.95,
  });
  assert.equal(selected.adapter.descriptor.id, 'container');
});

test('execution plane router treats probe exceptions as unavailable', async () => {
  const router = new ExecutionPlaneRouter([
    {
      descriptor: { id: 'broken', kind: 'remote', capabilities: ['command'], reliability: 1, latencyMsP50: 1, costPerExecution: 0 },
      async probe() { throw new Error('connection refused'); },
      async run() { throw new Error('must not execute'); },
    },
  ]);
  await assert.rejects(() => router.select({ requiredCapabilities: ['command'], risk: 1 }), /No available execution plane/);
});


test('HTTP execution adapter enforces the declared output limit', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({
      exitCode: 0,
      signal: null,
      stdout: '123456',
      stderr: '',
      durationMs: 1
    })
  });
  try {
    const { HttpExecutionAdapter } = await import('../dist/src/execution.js');
    const adapter = new HttpExecutionAdapter({
      id: 'limited-remote',
      kind: 'remote',
      endpoint: 'http://127.0.0.1:9',
      capabilities: ['command'],
      maxOutputBytes: 5
    });
    await assert.rejects(
      () => adapter.run({ executable: 'echo', args: ['x'], cwd: '/tmp' }),
      /output limit/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
