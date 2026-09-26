import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type BenchmarkFamily = 'software' | 'architecture' | 'research' | 'data' | 'design' | 'planning';
export type BenchmarkTarget = 'single-model' | 'sheol';

export interface BenchmarkTask {
  readonly id: string;
  readonly version: string;
  readonly family: BenchmarkFamily;
  readonly difficulty: number;
  readonly mission: string;
  readonly hardRequirements: readonly string[];
  readonly evaluation: {
    readonly evaluator: string;
    readonly requiredEvidence: readonly string[];
  };
}

export interface BenchmarkRun {
  readonly runId: string;
  readonly taskId: string;
  readonly target: BenchmarkTarget;
  readonly success: boolean;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly criticalFailure: boolean;
  readonly requirementsSatisfied: number;
  readonly requirementsTotal: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface BenchmarkExecutor {
  run(task: BenchmarkTask, target: BenchmarkTarget): Promise<BenchmarkRun>;
}

export interface BenchmarkSummary {
  readonly target: BenchmarkTarget;
  readonly runs: number;
  readonly successful: number;
  readonly ertS: number;
  readonly criticalFailures: number;
  readonly meanCostUsd: number;
  readonly meanLatencyMs: number;
  readonly requirementCoverage: number;
}

export interface BenchmarkReport {
  readonly schemaVersion: '1.0';
  readonly generatedAt: string;
  readonly suiteVersion: string;
  readonly tasks: number;
  readonly runs: readonly BenchmarkRun[];
  readonly summaries: readonly BenchmarkSummary[];
  readonly relativeLift?: number;
}

export function summarize(target: BenchmarkTarget, runs: readonly BenchmarkRun[]): BenchmarkSummary {
  const selected = runs.filter(run => run.target === target);
  const successful = selected.filter(run => run.success).length;
  const requirements = selected.reduce((sum, run) => sum + run.requirementsSatisfied, 0);
  const requirementsTotal = selected.reduce((sum, run) => sum + run.requirementsTotal, 0);
  return {
    target,
    runs: selected.length,
    successful,
    ertS: selected.length ? successful / selected.length : 0,
    criticalFailures: selected.filter(run => run.criticalFailure).length,
    meanCostUsd: selected.length ? selected.reduce((s, run) => s + run.costUsd, 0) / selected.length : 0,
    meanLatencyMs: selected.length ? selected.reduce((s, run) => s + run.latencyMs, 0) / selected.length : 0,
    requirementCoverage: requirementsTotal ? requirements / requirementsTotal : 0,
  };
}

export function buildReport(suiteVersion: string, tasks: readonly BenchmarkTask[], runs: readonly BenchmarkRun[]): BenchmarkReport {
  const summaries = [summarize('single-model', runs), summarize('sheol', runs)];
  const baseline = summaries.find(summary => summary.target === 'single-model');
  const sheol = summaries.find(summary => summary.target === 'sheol');
  const relativeLift = baseline && sheol && baseline.ertS > 0 && sheol.runs > 0 ? sheol.ertS / baseline.ertS : undefined;
  return {
    schemaVersion: '1.0', generatedAt: new Date().toISOString(), suiteVersion,
    tasks: tasks.length, runs: [...runs], summaries, ...(relativeLift === undefined ? {} : { relativeLift }),
  };
}

export async function executeSuite(
  suiteVersion: string,
  tasks: readonly BenchmarkTask[],
  executor: BenchmarkExecutor,
  repetitions = 1,
): Promise<BenchmarkReport> {
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('repetitions must be a positive integer');
  if (tasks.length === 0) throw new Error('benchmark suite must contain at least one task');
  for (const task of tasks) validateTask(task);

  const runs: BenchmarkRun[] = [];
  for (const task of tasks) {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      for (const target of ['single-model', 'sheol'] as const) {
        const result = await executor.run(task, target);
        if (result.taskId !== task.id || result.target !== target) throw new Error(`executor returned mismatched identity for ${task.id}/${target}`);
        runs.push({ ...result, runId: result.runId || randomUUID() });
      }
    }
  }
  return buildReport(suiteVersion, tasks, runs);
}

export async function writeReport(path: string, report: BenchmarkReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

export function validateTask(task: BenchmarkTask): void {
  if (!task.id.trim() || !task.version.trim()) throw new Error('task id/version are required');
  if (!task.mission.trim()) throw new Error(`task ${task.id}: mission is required`);
  if (!Number.isInteger(task.difficulty) || task.difficulty < 1 || task.difficulty > 10) throw new Error(`task ${task.id}: difficulty must be 1..10`);
  if (task.hardRequirements.length === 0) throw new Error(`task ${task.id}: at least one hard requirement is required`);
  if (!task.evaluation.evaluator.trim()) throw new Error(`task ${task.id}: evaluator is required`);
  if (task.evaluation.requiredEvidence.length === 0) throw new Error(`task ${task.id}: required evidence is required`);
}
