/**
 * GRIOT ModelGPU RAL (Reasoning Abstraction Layer) Engine
 * Virtualizes the 8 native AppChats as a decentralized cognitive GPU cluster.
 * 100% Zero-API: executes workloads via App Intent / Observer UI Scraper.
 */

import {
  VirtualGpuCoreId,
  VirtualGpuCore,
  GpuComputeWorkload,
  ModelGpuRalState,
  GpuTaskAffinity,
} from "./types";
import { observerEngine } from "../observer";
import { nativeObserverBridge } from "../native-bridge";
import { loadPrefs } from "@/lib/settings";
import { getUserSavedApis } from "@/lib/user-apis";

const INITIAL_CORES: Record<VirtualGpuCoreId, VirtualGpuCore> = {
  core_0_chatgpt: {
    id: "core_0_chatgpt",
    appId: "chatgpt",
    name: "ChatGPT Core 0",
    vendor: "OpenAI",
    coreIndex: 0,
    androidPackage: "com.openai.chatgpt",
    urlScheme: "chatgpt://",
    webUrl: "https://chatgpt.com",
    status: "idle",
    enabled: true,
    vramMb: 128000,
    contextTokens: 128000,
    virtualClockMhz: 3450,
    affinities: ["deep_reasoning", "math_logic", "rapid_chat"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 420 },
  },
  core_1_claude: {
    id: "core_1_claude",
    appId: "claude",
    name: "Claude Core 1",
    vendor: "Anthropic",
    coreIndex: 1,
    androidPackage: "com.anthropic.claude",
    urlScheme: "claude://",
    webUrl: "https://claude.ai",
    status: "idle",
    enabled: true,
    vramMb: 200000,
    contextTokens: 200000,
    virtualClockMhz: 3800,
    affinities: ["code_generation", "architecture", "deep_reasoning"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 380 },
  },
  core_2_gemini: {
    id: "core_2_gemini",
    appId: "gemini",
    name: "Gemini Core 2",
    vendor: "Google",
    coreIndex: 2,
    androidPackage: "com.google.gemini",
    urlScheme: "googleapp://",
    webUrl: "https://gemini.google.com",
    status: "idle",
    enabled: true,
    vramMb: 1000000,
    contextTokens: 1000000,
    virtualClockMhz: 4100,
    affinities: [
      "rapid_chat",
      "multimodal_vision",
      "deep_research",
      "code_generation",
      "deep_reasoning",
      "math_logic",
      "architecture",
    ],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 310 },
  },
  core_3_deepseek: {
    id: "core_3_deepseek",
    appId: "deepseek",
    name: "DeepSeek Core 3",
    vendor: "DeepSeek",
    coreIndex: 3,
    androidPackage: "com.deepseek.chat",
    urlScheme: "deepseek://",
    webUrl: "https://chat.deepseek.com",
    status: "idle",
    enabled: true,
    vramMb: 64000,
    contextTokens: 64000,
    virtualClockMhz: 3600,
    affinities: ["deep_reasoning", "code_generation", "math_logic"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 460 },
  },
  core_4_kimi: {
    id: "core_4_kimi",
    appId: "kimi",
    name: "Kimi Core 4",
    vendor: "Moonshot AI",
    coreIndex: 4,
    androidPackage: "com.moonshot.kimi",
    urlScheme: "kimi://",
    webUrl: "https://kimi.moonshot.cn",
    status: "idle",
    enabled: true,
    vramMb: 256000,
    contextTokens: 256000,
    virtualClockMhz: 3200,
    affinities: ["rapid_chat", "deep_research"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 340 },
  },
  core_5_grok: {
    id: "core_5_grok",
    appId: "grok",
    name: "Grok Core 5",
    vendor: "xAI",
    coreIndex: 5,
    androidPackage: "ai.x.grok",
    urlScheme: "grok://",
    webUrl: "https://x.ai",
    status: "idle",
    enabled: true,
    vramMb: 128000,
    contextTokens: 128000,
    virtualClockMhz: 3900,
    affinities: ["deep_research", "rapid_chat", "math_logic"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 330 },
  },
  core_6_perplexity: {
    id: "core_6_perplexity",
    appId: "perplexity",
    name: "Perplexity Core 6",
    vendor: "Perplexity",
    coreIndex: 6,
    androidPackage: "ai.perplexity.app.android",
    urlScheme: "perplexity://",
    webUrl: "https://perplexity.ai",
    status: "idle",
    enabled: true,
    vramMb: 64000,
    contextTokens: 64000,
    virtualClockMhz: 3500,
    affinities: ["deep_research", "rapid_chat"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 290 },
  },
  core_7_mistral: {
    id: "core_7_mistral",
    appId: "mistral",
    name: "Mistral Core 7",
    vendor: "Mistral AI",
    coreIndex: 7,
    androidPackage: "ai.mistral.chat",
    urlScheme: "mistral://",
    webUrl: "https://chat.mistral.ai",
    status: "idle",
    enabled: true,
    vramMb: 128000,
    contextTokens: 128000,
    virtualClockMhz: 3700,
    affinities: ["code_generation", "architecture", "deep_reasoning"],
    metrics: { totalWorkloads: 0, tokensScraped: 0, actionsExecuted: 0, avgLatencyMs: 350 },
  },
};

export class ModelGpuRalEngine {
  private state: ModelGpuRalState = {
    active: true,
    zeroApiMode: true,
    cores: { ...INITIAL_CORES },
    activeWorkload: null,
    workloadHistory: [],
    telemetry: {
      totalAllocatedGcu: 0,
      aggregatedThroughputTps: 48.5,
      activeCoresCount: 8,
      totalZeroApiDispatches: 0,
    },
  };

  private listeners: Set<(state: ModelGpuRalState) => void> = new Set();

  constructor() {
    this.initObserverHooks();
    this.refreshCoreStatuses();
  }

  private initObserverHooks() {
    // Intercetar eventos brutos do Observer para telemetria em tempo real
    observerEngine.subscribeEvents((event) => {
      if (event.content) {
        this.state.telemetry.lastScrapedChunk = event.content.slice(-120);
        // Atualizar métricas do core correspondente
        const core = Object.values(this.state.cores).find(
          (c) => c.appId === event.source.appId || c.androidPackage === event.source.appPackage,
        );
        if (core) {
          core.metrics.tokensScraped += Math.round(event.content.length / 4);
          core.metrics.lastActiveTimestamp = new Date().toISOString();
          core.status = "streaming";
          setTimeout(() => {
            if (core.status === "streaming") core.status = "idle";
            this.notify();
          }, 2000);
        }
      }
      this.notify();
    });

    observerEngine.subscribeActions((action, result) => {
      if (this.state.activeWorkload) {
        this.state.activeWorkload.actionsDetected.push(action);
        if (result) {
          this.state.activeWorkload.executionResults.push(result);
        }
      }
      this.notify();
    });
  }

  public refreshCoreStatuses() {
    const prefs = loadPrefs();
    let activeCount = 0;

    const APP_TO_PROVIDER: Record<string, string> = {
      chatgpt: "openai",
      claude: "claude",
      gemini: "gemini",
      deepseek: "deepseek",
      groq: "groq",
      perplexity: "perplexity",
      kimi: "kimi",
      mistral: "mistral",
    };

    let userApis: any[] = [];
    try {
      userApis = getUserSavedApis();
    } catch {}

    for (const core of Object.values(this.state.cores)) {
      const p = APP_TO_PROVIDER[core.appId] || core.appId;
      const hasLocalKey =
        typeof window !== "undefined" &&
        Boolean(
          localStorage.getItem(`griot_api_key_${p}`) ||
          localStorage.getItem(`griot_${p}_api_key`) ||
          (p === "claude" && localStorage.getItem("griot_api_key_anthropic")),
        );

      const hasSavedApi = userApis.some(
        (a) =>
          a.status === "active" &&
          (a.providerId === p ||
            (p === "claude" && a.providerId === "anthropic") ||
            (p === "anthropic" && a.providerId === "claude")),
      );

      const isConnected =
        hasSavedApi ||
        hasLocalKey ||
        prefs[`api:${p}`] === true ||
        prefs[p] === true ||
        p === "gemini";

      core.enabled = isConnected;
      if (isConnected) activeCount++;
    }

    this.state.telemetry.activeCoresCount = activeCount;
    this.notify();
  }

  public getState(): ModelGpuRalState {
    this.refreshCoreStatuses();
    return { ...this.state };
  }

  public subscribe(listener: (state: ModelGpuRalState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const currentState = { ...this.state };
    this.listeners.forEach((l) => l(currentState));
  }

  /**
   * Analisa semântica e intenção para classificar a afinidade computacional da tarefa
   */
  public detectAffinity(prompt: string, context?: string): GpuTaskAffinity {
    const text = ((prompt || "") + " " + (context || "")).toLowerCase();

    if (
      text.includes("código") ||
      text.includes("codigo") ||
      text.includes("function") ||
      text.includes("função") ||
      text.includes("classe") ||
      text.includes("class") ||
      text.includes("debug") ||
      text.includes("script") ||
      text.includes("react") ||
      text.includes("typescript") ||
      text.includes("javascript") ||
      text.includes("python") ||
      text.includes("html") ||
      text.includes("css") ||
      text.includes("erro") ||
      text.includes("bug")
    ) {
      return "code_generation";
    }

    if (
      text.includes("arquitetura") ||
      text.includes("sistema") ||
      text.includes("estrutura") ||
      text.includes("diagrama") ||
      text.includes("banco de dados") ||
      text.includes("database") ||
      text.includes("schema") ||
      text.includes("backend")
    ) {
      return "architecture";
    }

    if (
      text.includes("calcula") ||
      text.includes("matemática") ||
      text.includes("math") ||
      text.includes("equação") ||
      text.includes("probabilidade") ||
      text.includes("estatística") ||
      text.includes("lógica") ||
      text.includes("algoritmo")
    ) {
      return "math_logic";
    }

    if (
      text.includes("porquê") ||
      text.includes("porque") ||
      text.includes("explica detalhadamente") ||
      text.includes("raciocina") ||
      text.includes("analisa") ||
      text.includes("análise") ||
      text.includes("profundo") ||
      text.includes("comparativo") ||
      text.includes("vantagens e desvantagens")
    ) {
      return "deep_reasoning";
    }

    if (
      text.includes("pesquisa") ||
      text.includes("busca") ||
      text.includes("notícias") ||
      text.includes("história") ||
      text.includes("referências") ||
      text.includes("artigos")
    ) {
      return "deep_research";
    }

    if (
      text.includes("imagem") ||
      text.includes("foto") ||
      text.includes("screenshot") ||
      text.includes("olha para isto") ||
      text.includes("vê isto")
    ) {
      return "multimodal_vision";
    }

    return "rapid_chat";
  }

  /**
   * Aloca um núcleo no cluster ModelGPU RAL especificamente para o ModelOS
   * e resolve o modelo / rota de inferência real.
   */
  public allocateCoreForModelOS(params: { prompt: string; context?: string; title?: string }): {
    core: VirtualGpuCore;
    workload: GpuComputeWorkload;
    targetModelId: string;
    affinity: GpuTaskAffinity;
  } {
    this.refreshCoreStatuses();
    const affinity = this.detectAffinity(params.prompt, params.context);
    const coreId = this.selectOptimalCore(affinity);
    const core = this.state.cores[coreId];

    const workloadId = "gpu_wl_" + Math.random().toString(36).substring(2, 9);
    const workload: GpuComputeWorkload = {
      id: workloadId,
      title: params.title || `ModelOS Workload #${this.state.workloadHistory.length + 1}`,
      prompt: params.prompt,
      affinity,
      targetCoreId: coreId,
      status: "dispatched_to_app",
      rawOutput: "",
      actionsDetected: [],
      executionResults: [],
      startedAt: new Date().toISOString(),
      estimatedGcu: 0.15,
    };

    this.state.activeWorkload = workload;
    this.state.telemetry.totalZeroApiDispatches += 1;
    this.state.telemetry.totalAllocatedGcu += workload.estimatedGcu;

    core.status = "computing";
    core.metrics.totalWorkloads += 1;
    this.notify();

    const targetModelId = this.resolveModelForCore(core);

    return { core, workload, targetModelId, affinity };
  }

  /**
   * Resolve o identificador do modelo de IA a executar correspondente ao Core selecionado
   */
  public resolveModelForCore(core: VirtualGpuCore): string {
    const APP_TO_PROVIDER: Record<string, string> = {
      chatgpt: "openai",
      claude: "claude",
      gemini: "gemini",
      deepseek: "deepseek",
      groq: "groq",
      perplexity: "perplexity",
      kimi: "kimi",
      mistral: "mistral",
    };

    let userApis: any[] = [];
    try {
      userApis = getUserSavedApis();
    } catch {}

    const p = APP_TO_PROVIDER[core.appId] || core.appId;

    // Procura chave específica do utilizador para este core
    const match = userApis.find(
      (a) =>
        a.status === "active" &&
        (a.providerId === p ||
          (p === "claude" && a.providerId === "anthropic") ||
          (p === "anthropic" && a.providerId === "claude")),
    );
    if (match) return match.id;

    // Se o core for Gemini, usa o modelo Gemini direto
    if (p === "gemini") return "gemini-2.5-flash";

    // Se o utilizador tiver qualquer outra chave ativa, usa-a
    const anyActive = userApis.find((a) => a.status === "active");
    if (anyActive) return anyActive.id;

    // Fallback padrão do sistema
    return "gemini-2.5-flash";
  }

  /**
   * Atualiza a recepção progressiva de tokens no ModelGPU RAL durante o streaming
   */
  public updateWorkloadStreaming(workloadId: string, chunk: string) {
    if (this.state.activeWorkload?.id === workloadId) {
      this.state.activeWorkload.rawOutput += chunk;
      this.state.activeWorkload.status = "observing_stream";
      const core = this.state.cores[this.state.activeWorkload.targetCoreId];
      if (core && core.status !== "streaming") {
        core.status = "streaming";
      }
      this.notify();
    }
  }

  /**
   * Marca uma carga de trabalho como falhada caso ocorra interrupção de rede
   */
  public failWorkload(workloadId: string, errorMsg?: string) {
    if (this.state.activeWorkload?.id === workloadId) {
      const finished: GpuComputeWorkload = {
        ...this.state.activeWorkload,
        rawOutput: errorMsg || "Erro na execução do workload no cluster",
        status: "failed",
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(this.state.activeWorkload.startedAt).getTime(),
      };
      const core = this.state.cores[finished.targetCoreId];
      if (core) {
        core.status = "cooling";
        setTimeout(() => {
          core.status = "idle";
          this.notify();
        }, 1200);
      }
      this.state.workloadHistory.unshift(finished);
      this.state.activeWorkload = null;
      this.notify();
    }
  }

  /**
   * Encaminha uma carga de trabalho cognitiva para o Virtual Core mais adequado (ou core explícito).
   */
  public async dispatchComputeWorkload(params: {
    prompt: string;
    title?: string;
    affinity?: GpuTaskAffinity;
    targetCoreId?: VirtualGpuCoreId;
  }): Promise<GpuComputeWorkload> {
    const affinity = params.affinity || "code_generation";
    const coreId = params.targetCoreId || this.selectOptimalCore(affinity);
    const core = this.state.cores[coreId];

    const workloadId = "gpu_wl_" + Math.random().toString(36).substring(2, 9);
    const workload: GpuComputeWorkload = {
      id: workloadId,
      title: params.title || `Cognitive Workload #${this.state.workloadHistory.length + 1}`,
      prompt: params.prompt,
      affinity,
      targetCoreId: coreId,
      status: "dispatched_to_app",
      rawOutput: "",
      actionsDetected: [],
      executionResults: [],
      startedAt: new Date().toISOString(),
      estimatedGcu: 0.15,
    };

    this.state.activeWorkload = workload;
    this.state.telemetry.totalZeroApiDispatches += 1;
    this.state.telemetry.totalAllocatedGcu += workload.estimatedGcu;

    // Atualiza status do Core
    core.status = "dispatched";
    core.metrics.totalWorkloads += 1;
    this.notify();

    return workload;
  }

  /**
   * Regista a conclusão da carga de trabalho recebida pelo Observer ou inferência direta
   */
  public completeWorkload(workloadId: string, output: string) {
    if (this.state.activeWorkload?.id === workloadId) {
      const durationMs = Date.now() - new Date(this.state.activeWorkload.startedAt).getTime();
      const tokensEstimated = Math.max(1, Math.round(output.length / 4));

      const finished: GpuComputeWorkload = {
        ...this.state.activeWorkload,
        rawOutput: output,
        status: "completed",
        completedAt: new Date().toISOString(),
        durationMs,
      };

      const core = this.state.cores[finished.targetCoreId];
      if (core) {
        core.status = "cooling";
        core.metrics.tokensScraped += tokensEstimated;
        core.metrics.lastActiveTimestamp = new Date().toISOString();
        if (durationMs > 0) {
          core.metrics.avgLatencyMs = Math.round(
            core.metrics.avgLatencyMs * 0.7 + durationMs * 0.3,
          );
        }
        setTimeout(() => {
          core.status = "idle";
          this.notify();
        }, 1500);
      }

      this.state.workloadHistory.unshift(finished);
      this.state.activeWorkload = null;
      this.notify();
    }
  }

  /**
   * Seleciona o Virtual Core ótimo para a afinidade pretendida
   */
  public selectOptimalCore(affinity: GpuTaskAffinity): VirtualGpuCoreId {
    // 1. Procurar cores com afinidade prioritária que estejam ativos e configurados
    const candidates = Object.values(this.state.cores).filter(
      (c) => c.enabled && c.affinities.includes(affinity),
    );

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.metrics.totalWorkloads - b.metrics.totalWorkloads);
      return candidates[0].id;
    }

    // 2. Se nenhum core com a afinidade exata estiver ativo, selecionar QUALQUER core ativo configurado
    const anyEnabled = Object.values(this.state.cores).filter((c) => c.enabled);
    if (anyEnabled.length > 0) {
      anyEnabled.sort((a, b) => a.metrics.totalWorkloads - b.metrics.totalWorkloads);
      return anyEnabled[0].id;
    }

    // 3. Fallbacks padrão se nenhum core estiver configurado
    switch (affinity) {
      case "code_generation":
      case "architecture":
        return "core_1_claude";
      case "deep_reasoning":
      case "math_logic":
        return "core_3_deepseek";
      case "multimodal_vision":
        return "core_2_gemini";
      case "deep_research":
        return "core_6_perplexity";
      default:
        return "core_2_gemini";
    }
  }
}

export const modelGpuRalEngine = new ModelGpuRalEngine();
