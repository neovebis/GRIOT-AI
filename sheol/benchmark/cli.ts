import { readFile } from 'node:fs/promises';
import { executeSuite, writeReport, type BenchmarkExecutor, type BenchmarkRun, type BenchmarkTarget, type BenchmarkTask } from './runner.js';

const args = new Set(process.argv.slice(2));
const validateOnly = args.has('--validate-only');
const taskPath = process.argv.find(value => value.startsWith('--tasks='))?.slice('--tasks='.length) ?? 'benchmark/tasks.example.json';

const tasks = JSON.parse(await readFile(taskPath, 'utf8')) as BenchmarkTask[];

class RealExecutor implements BenchmarkExecutor {
  async run(task: BenchmarkTask, target: BenchmarkTarget): Promise<BenchmarkRun> {
    if (!process.env.SHEOL_BENCHMARK_EXECUTOR) {
      throw new Error('SHEOL_BENCHMARK_EXECUTOR is not configured. Refusing to fabricate benchmark results.');
    }
    throw new Error(`Executor adapter '${process.env.SHEOL_BENCHMARK_EXECUTOR}' is not installed in this package yet (${task.id}/${target})`);
  }
}

if (validateOnly) {
  for (const task of tasks) {
    if (!task.id || !task.mission || !task.hardRequirements.length || !task.evaluation.evaluator) throw new Error(`invalid task ${task.id || '<unknown>'}`);
  }
  process.stdout.write(`Validated ${tasks.length} benchmark task definitions. No model runs executed.\n`);
} else {
  const report = await executeSuite('sheol-benchmark-v0.1', tasks, new RealExecutor(), 1);
  const path = process.env.SHEOL_BENCHMARK_OUTPUT ?? 'benchmark/out/report.json';
  await writeReport(path, report);
  process.stdout.write(`Wrote ${path}\n`);
}
