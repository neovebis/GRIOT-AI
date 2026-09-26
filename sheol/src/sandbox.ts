import { spawn } from 'node:child_process';
import type { ExecutionAdapter, ExecutionCommand, ExecutionResult } from './execution.js';

/** Backwards-compatible aliases. The canonical SHEOL contract lives in execution.ts. */
export type SandboxCommand = ExecutionCommand;
export type SandboxResult = ExecutionResult;
export interface SandboxExecutor {
  run(command: SandboxCommand): Promise<SandboxResult>;
}

export class LocalSandboxExecutor implements SandboxExecutor, ExecutionAdapter {
  public readonly descriptor = {
    id: 'local',
    kind: 'local' as const,
    capabilities: ['command', 'workspace', 'filesystem', 'process'] as const,
    reliability: 0.9,
    latencyMsP50: 20,
    costPerExecution: 0,
    priority: 0,
    isolation: 'none',
    networkAccess: 'internet',
    maxTimeoutMs: 300_000,
    maxOutputBytes: 2_000_000,
  };

  public async probe(): Promise<{ available: true }> {
    return { available: true };
  }

  public async run(command: SandboxCommand): Promise<SandboxResult> {
    const started = Date.now();
    return await new Promise((resolve, reject) => {
      const child = spawn(command.executable, [...command.args], {
        cwd: command.cwd,
        shell: false,
        env: { PATH: process.env.PATH ?? '', ...command.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const maxOutput = 2_000_000;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: unknown) => { if (stdout.length < maxOutput) stdout += String(chunk).slice(0, maxOutput - stdout.length); });
      child.stderr.on('data', (chunk: unknown) => { if (stderr.length < maxOutput) stderr += String(chunk).slice(0, maxOutput - stderr.length); });
      const timeoutMs = command.timeoutMs ?? this.descriptor.maxTimeoutMs;
      let timer: NodeJS.Timeout | undefined;
      if (timeoutMs) timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.on('error', reject);
      child.on('close', (exitCode, signal) => {
        if (timer) clearTimeout(timer);
        resolve({ exitCode, signal, stdout, stderr, durationMs: Date.now() - started });
      });
    });
  }
}

export type LocalExecutionAdapter = LocalSandboxExecutor;
