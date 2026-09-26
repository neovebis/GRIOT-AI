import type { ModelProfile, ModelProvider } from './model.js';
import type { WorkerContract, WorkerResult } from './worker.js';

export class StaticModelProvider implements ModelProvider {
  public constructor(
    public readonly profile: ModelProfile,
    private readonly handler: (contract: WorkerContract) => Promise<WorkerResult> | WorkerResult,
  ) {}
  execute(contract: WorkerContract): Promise<WorkerResult> { return Promise.resolve(this.handler(contract)); }
}

export interface OpenAICompatibleConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly profile: ModelProfile;
  readonly timeoutMs?: number;
}

export class OpenAICompatibleProvider implements ModelProvider {
  public readonly profile: ModelProfile;
  public constructor(private readonly config: OpenAICompatibleConfig) { this.profile = config.profile; }

  async execute(contract: WorkerContract): Promise<WorkerResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 120_000);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          messages: [
            { role: 'system', content: 'You are a SHEOL worker. Follow the supplied contract exactly. Do not expand scope. Return strict JSON.' },
            { role: 'user', content: JSON.stringify(contract) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Model provider HTTP ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const output = payload.choices?.[0]?.message?.content;
      if (!output) throw new Error('Provider returned no content');
      return JSON.parse(output) as WorkerResult;
    } finally {
      clearTimeout(timer);
    }
  }
}
