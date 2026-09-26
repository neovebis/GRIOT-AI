import type { WorkerContract, WorkerResult } from './worker.js';

export interface ModelProfile {
  readonly modelId: string;
  readonly capabilities: Readonly<Record<string, number>>;
  readonly costPer1kTokens: number;
  readonly latencyMsP50: number;
  readonly reliability: number;
}

export interface ModelProvider {
  readonly profile: ModelProfile;
  execute(contract: WorkerContract): Promise<WorkerResult>;
}

export class CapabilityRouter {
  public constructor(private readonly providers: readonly ModelProvider[]) {}

  public select(contract: WorkerContract, policy: { requiredCapabilities: readonly string[]; risk: number }): ModelProvider {
    if (this.providers.length === 0) throw new Error('No model providers available');
    const scored = this.providers.map(provider => {
      const capability = policy.requiredCapabilities.reduce((sum, key) => sum + (provider.profile.capabilities[key] ?? 0), 0)
        / Math.max(1, policy.requiredCapabilities.length);
      const riskBonus = provider.profile.reliability * policy.risk;
      const costPenalty = provider.profile.costPer1kTokens * 0.05;
      const latencyPenalty = provider.profile.latencyMsP50 / 60_000 * 0.02;
      return { provider, score: capability + riskBonus - costPenalty - latencyPenalty };
    }).sort((a, b) => b.score - a.score);
    const selected = scored[0];
    if (!selected) throw new Error('No provider selected');
    return selected.provider;
  }
}
