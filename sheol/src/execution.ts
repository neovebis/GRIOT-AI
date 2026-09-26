export type ExecutionPlaneKind = 'local' | 'griot-sandbox' | 'remote' | 'custom';

export type ExecutionIsolation = 'none' | 'process' | 'container' | 'vm' | 'remote';
export type ExecutionNetworkAccess = 'none' | 'restricted' | 'internet';

export interface ExecutionCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export interface ExecutionResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface ExecutionPlaneDescriptor {
  readonly id: string;
  readonly kind: ExecutionPlaneKind;
  readonly capabilities: readonly string[];
  readonly reliability: number;
  readonly latencyMsP50: number;
  readonly costPerExecution: number;
  readonly priority?: number;
  readonly isolation?: ExecutionIsolation;
  readonly networkAccess?: ExecutionNetworkAccess;
  readonly maxTimeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export interface ExecutionProbeResult {
  readonly available: boolean;
  readonly reason?: string;
}

export interface ExecutionAdapter {
  readonly descriptor: ExecutionPlaneDescriptor;
  probe(): Promise<ExecutionProbeResult>;
  run(command: ExecutionCommand): Promise<ExecutionResult>;
}

export interface ExecutionSelectionPolicy {
  readonly requiredCapabilities: readonly string[];
  /** 0 = low-risk work, 1 = mission-critical/high-risk work. */
  readonly risk: number;
  readonly preferredPlaneIds?: readonly string[];
  readonly forbiddenPlaneIds?: readonly string[];
  readonly minReliability?: number;
  readonly maxCostPerExecution?: number;
  readonly maxLatencyMsP50?: number;
  readonly requiredIsolation?: ExecutionIsolation;
  readonly requiredNetworkAccess?: ExecutionNetworkAccess;
}

export interface ExecutionSelection {
  readonly adapter: ExecutionAdapter;
  readonly score: number;
  readonly probe: ExecutionProbeResult;
  readonly rationale: readonly string[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validateDescriptor(descriptor: ExecutionPlaneDescriptor): void {
  if (!descriptor.id.trim()) throw new Error('Execution plane id is required');
  if (!Number.isFinite(descriptor.reliability) || descriptor.reliability < 0 || descriptor.reliability > 1) {
    throw new Error(`Execution plane ${descriptor.id} has invalid reliability`);
  }
  if (!Number.isFinite(descriptor.latencyMsP50) || descriptor.latencyMsP50 < 0) {
    throw new Error(`Execution plane ${descriptor.id} has invalid latency`);
  }
  if (!Number.isFinite(descriptor.costPerExecution) || descriptor.costPerExecution < 0) {
    throw new Error(`Execution plane ${descriptor.id} has invalid cost`);
  }
  if (descriptor.maxTimeoutMs !== undefined && (!Number.isFinite(descriptor.maxTimeoutMs) || descriptor.maxTimeoutMs <= 0)) {
    throw new Error(`Execution plane ${descriptor.id} has invalid maxTimeoutMs`);
  }
  if (descriptor.maxOutputBytes !== undefined && (!Number.isInteger(descriptor.maxOutputBytes) || descriptor.maxOutputBytes <= 0)) {
    throw new Error(`Execution plane ${descriptor.id} has invalid maxOutputBytes`);
  }
}

export class ExecutionPlaneRouter {
  public constructor(private readonly adapters: readonly ExecutionAdapter[]) {
    const ids = new Set<string>();
    for (const adapter of adapters) {
      validateDescriptor(adapter.descriptor);
      if (ids.has(adapter.descriptor.id)) throw new Error(`Duplicate execution plane id: ${adapter.descriptor.id}`);
      ids.add(adapter.descriptor.id);
    }
  }

  public adaptersSnapshot(): readonly ExecutionAdapter[] {
    return [...this.adapters];
  }

  public async select(policy: ExecutionSelectionPolicy): Promise<ExecutionSelection> {
    if (!Number.isFinite(policy.risk) || policy.risk < 0 || policy.risk > 1) {
      throw new Error('Execution selection risk must be between 0 and 1');
    }
    if (policy.minReliability !== undefined && (policy.minReliability < 0 || policy.minReliability > 1)) {
      throw new Error('Execution selection minReliability must be between 0 and 1');
    }

    const forbidden = new Set(policy.forbiddenPlaneIds ?? []);
    const preferred = new Set(policy.preferredPlaneIds ?? []);
    const probeResults = await Promise.all(
      this.adapters.map(async adapter => {
        try {
          return { adapter, probe: await adapter.probe() };
        } catch (error) {
          return {
            adapter,
            probe: { available: false, reason: error instanceof Error ? error.message : String(error) },
          };
        }
      }),
    );

    const candidates: ExecutionSelection[] = [];

    for (const { adapter, probe } of probeResults) {
      const descriptor = adapter.descriptor;
      if (forbidden.has(descriptor.id) || !probe.available) continue;

      const missing = policy.requiredCapabilities.filter(
        capability => !descriptor.capabilities.includes(capability),
      );
      if (missing.length) continue;
      if (policy.minReliability !== undefined && descriptor.reliability < policy.minReliability) continue;
      if (policy.maxCostPerExecution !== undefined && descriptor.costPerExecution > policy.maxCostPerExecution) continue;
      if (policy.maxLatencyMsP50 !== undefined && descriptor.latencyMsP50 > policy.maxLatencyMsP50) continue;
      if (policy.requiredIsolation !== undefined && descriptor.isolation !== policy.requiredIsolation) continue;
      if (policy.requiredNetworkAccess !== undefined && descriptor.networkAccess !== policy.requiredNetworkAccess) continue;

      const risk = clamp01(policy.risk);
      const reliabilityWeight = 0.45 + 0.4 * risk;
      const speedWeight = 0.18 - 0.08 * risk;
      const costWeight = 0.12 - 0.06 * risk;
      const priorityWeight = 0.08;

      const reliabilityScore = descriptor.reliability * reliabilityWeight;
      const latencyScore = (1 / (1 + descriptor.latencyMsP50 / 1000)) * speedWeight;
      const costScore = (1 / (1 + descriptor.costPerExecution)) * costWeight;
      const priorityScore = clamp01((descriptor.priority ?? 0) / 100) * priorityWeight;
      const preferenceScore = preferred.has(descriptor.id) ? 0.2 : 0;

      const score = reliabilityScore + latencyScore + costScore + priorityScore + preferenceScore;
      const rationale = [
        `reliability=${descriptor.reliability.toFixed(3)}`,
        `latencyP50Ms=${descriptor.latencyMsP50}`,
        `cost=${descriptor.costPerExecution}`,
        `risk=${risk.toFixed(2)}`,
        preferred.has(descriptor.id) ? 'preferred=true' : 'preferred=false',
      ];

      candidates.push({ adapter, score, probe, rationale });
    }

    candidates.sort((a, b) =>
      b.score - a.score ||
      b.adapter.descriptor.reliability - a.adapter.descriptor.reliability ||
      a.adapter.descriptor.latencyMsP50 - b.adapter.descriptor.latencyMsP50 ||
      a.adapter.descriptor.costPerExecution - b.adapter.descriptor.costPerExecution ||
      a.adapter.descriptor.id.localeCompare(b.adapter.descriptor.id),
    );

    const selected = candidates[0];
    if (!selected) throw new Error('No available execution plane satisfies SHEOL execution policy');
    return selected;
  }
}

export interface HttpExecutionAdapterOptions {
  readonly id: string;
  readonly kind?: ExecutionPlaneKind;
  readonly endpoint: string;
  readonly capabilities: readonly string[];
  readonly reliability?: number;
  readonly latencyMsP50?: number;
  readonly costPerExecution?: number;
  readonly priority?: number;
  readonly isolation?: ExecutionIsolation;
  readonly networkAccess?: ExecutionNetworkAccess;
  readonly maxTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly probePath?: string;
  readonly executePath?: string;
  readonly requestTimeoutMs?: number;
}

export class HttpExecutionAdapter implements ExecutionAdapter {
  public readonly descriptor: ExecutionPlaneDescriptor;
  private readonly endpoint: URL;
  private readonly headers: Readonly<Record<string, string>>;
  private readonly probePath: string;
  private readonly executePath: string;
  private readonly requestTimeoutMs: number;

  public constructor(private readonly options: HttpExecutionAdapterOptions) {
    this.endpoint = new URL(options.endpoint);
    if (this.endpoint.protocol !== 'http:' && this.endpoint.protocol !== 'https:') {
      throw new Error('Execution adapter endpoint must use http or https');
    }
    this.headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
    this.probePath = options.probePath ?? '/health';
    this.executePath = options.executePath ?? '/execute';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error('Execution adapter requestTimeoutMs must be positive');
    }
    this.descriptor = {
      id: options.id,
      kind: options.kind ?? 'remote',
      capabilities: options.capabilities,
      reliability: options.reliability ?? 0.95,
      latencyMsP50: options.latencyMsP50 ?? 1000,
      costPerExecution: options.costPerExecution ?? 0,
      ...(options.priority === undefined ? {} : { priority: options.priority }),
      isolation: options.isolation ?? 'remote',
      networkAccess: options.networkAccess ?? 'restricted',
      ...(options.maxTimeoutMs === undefined ? {} : { maxTimeoutMs: options.maxTimeoutMs }),
      ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
    };
    validateDescriptor(this.descriptor);
  }

  public async probe(): Promise<ExecutionProbeResult> {
    try {
      const response = await this.send('GET', this.probePath);
      return response.statusCode >= 200 && response.statusCode < 300
        ? { available: true }
        : { available: false, reason: `health endpoint returned ${response.statusCode}` };
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  public async run(command: ExecutionCommand): Promise<ExecutionResult> {
    this.validateCommand(command);
    const started = Date.now();
    const requestTimeoutMs = Math.max(
      this.requestTimeoutMs,
      (command.timeoutMs ?? this.descriptor.maxTimeoutMs ?? 120_000) + 5_000,
    );
    const response = await this.send('POST', this.executePath, JSON.stringify({ command }), requestTimeoutMs);
    const body = response.body;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`execution adapter ${this.descriptor.id} returned HTTP ${response.statusCode}: ${body.slice(0, 2000)}`);
    }

    let parsed: Partial<ExecutionResult>;
    try {
      parsed = JSON.parse(body) as Partial<ExecutionResult>;
    } catch {
      throw new Error(`execution adapter ${this.descriptor.id} returned non-JSON output`);
    }

    if (typeof parsed.exitCode !== 'number' && parsed.exitCode !== null) {
      throw new Error('Execution adapter returned invalid exitCode');
    }
    if (typeof parsed.stdout !== 'string' || typeof parsed.stderr !== 'string') {
      throw new Error('Execution adapter returned invalid output');
    }
    const outputBytes = Buffer.byteLength(parsed.stdout, 'utf8') + Buffer.byteLength(parsed.stderr, 'utf8');
    if (this.descriptor.maxOutputBytes !== undefined && outputBytes > this.descriptor.maxOutputBytes) {
      throw new Error(`Execution adapter ${this.descriptor.id} exceeded output limit of ${this.descriptor.maxOutputBytes} bytes`);
    }
    if (parsed.durationMs !== undefined && (!Number.isFinite(parsed.durationMs) || parsed.durationMs < 0)) {
      throw new Error('Execution adapter returned invalid durationMs');
    }

    return {
      exitCode: parsed.exitCode ?? null,
      signal: parsed.signal ?? null,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
      durationMs: parsed.durationMs ?? Date.now() - started,
    };
  }

  private validateCommand(command: ExecutionCommand): void {
    if (!command.executable.trim()) throw new Error('Execution command executable is required');
    if (!command.cwd.trim()) throw new Error('Execution command cwd is required');
    if (command.timeoutMs !== undefined) {
      if (!Number.isFinite(command.timeoutMs) || command.timeoutMs <= 0) throw new Error('Execution command timeoutMs must be positive');
      if (this.descriptor.maxTimeoutMs !== undefined && command.timeoutMs > this.descriptor.maxTimeoutMs) {
        throw new Error(`Execution command timeout exceeds plane limit of ${this.descriptor.maxTimeoutMs}ms`);
      }
    }
  }

  private async send(method: 'GET' | 'POST', path: string, body?: string, timeoutMs = this.requestTimeoutMs): Promise<{ statusCode: number; body: string }> {
    const url = new URL(path, this.endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers: this.headers,
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      };
      const response = await fetch(url.toString(), init);
      return { statusCode: response.status, body: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function discoverConfiguredExecutionPlanes(local?: ExecutionAdapter): readonly ExecutionAdapter[] {
  const adapters: ExecutionAdapter[] = [];
  if (local) adapters.push(local);

  const griotSandboxUrl = process.env.SHEOL_GRIOT_SANDBOX_URL;
  if (griotSandboxUrl) {
    const headers = process.env.SHEOL_GRIOT_SANDBOX_KEY
      ? { authorization: `Bearer ${process.env.SHEOL_GRIOT_SANDBOX_KEY}` }
      : undefined;
    adapters.push(new HttpExecutionAdapter({
      id: 'griot-sandbox',
      kind: 'griot-sandbox',
      endpoint: griotSandboxUrl,
      capabilities: (process.env.SHEOL_GRIOT_SANDBOX_CAPABILITIES ?? 'command,workspace,filesystem,process')
        .split(',').map(value => value.trim()).filter(Boolean),
      priority: 20,
      probePath: process.env.SHEOL_GRIOT_SANDBOX_HEALTH_PATH ?? '/health',
      executePath: process.env.SHEOL_GRIOT_SANDBOX_EXECUTE_PATH ?? '/execute',
      ...(headers ? { headers } : {}),
    }));
  }

  const remoteUrl = process.env.SHEOL_REMOTE_EXECUTOR_URL;
  if (remoteUrl) {
    const headers = process.env.SHEOL_REMOTE_EXECUTOR_KEY
      ? { authorization: `Bearer ${process.env.SHEOL_REMOTE_EXECUTOR_KEY}` }
      : undefined;
    adapters.push(new HttpExecutionAdapter({
      id: 'remote-executor',
      kind: 'remote',
      endpoint: remoteUrl,
      capabilities: (process.env.SHEOL_REMOTE_EXECUTOR_CAPABILITIES ?? 'command,workspace,filesystem,process')
        .split(',').map(value => value.trim()).filter(Boolean),
      probePath: process.env.SHEOL_REMOTE_EXECUTOR_HEALTH_PATH ?? '/health',
      executePath: process.env.SHEOL_REMOTE_EXECUTOR_EXECUTE_PATH ?? '/execute',
      ...(headers ? { headers } : {}),
    }));
  }

  return adapters;
}

export function createDefaultExecutionPlaneRouter(local?: ExecutionAdapter): ExecutionPlaneRouter {
  return new ExecutionPlaneRouter(discoverConfiguredExecutionPlanes(local));
}
