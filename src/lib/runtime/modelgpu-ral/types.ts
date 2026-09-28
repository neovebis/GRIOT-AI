/**
 * GRIOT ModelGPU RAL (Reasoning Abstraction Layer) Types
 * Maps the 8 native AI Chat Applications as Virtual GPU / NPU Execution Cores
 * for 100% Zero-API cognitive compute.
 */

import { GriotAction, GriotExecutionResult } from "../protocol";

export type VirtualGpuCoreId =
  | "core_0_chatgpt"
  | "core_1_claude"
  | "core_2_gemini"
  | "core_3_deepseek"
  | "core_4_kimi"
  | "core_5_grok"
  | "core_6_perplexity"
  | "core_7_mistral";

export type GpuCoreStatus =
  "idle" | "allocating" | "dispatched" | "computing" | "streaming" | "cooling" | "offline";

export type GpuTaskAffinity =
  | "deep_reasoning"
  | "code_generation"
  | "multimodal_vision"
  | "deep_research"
  | "rapid_chat"
  | "math_logic"
  | "architecture";

export interface VirtualGpuCore {
  id: VirtualGpuCoreId;
  appId: string;
  name: string;
  vendor: string;
  coreIndex: number;
  androidPackage: string;
  urlScheme: string;
  webUrl: string;
  status: GpuCoreStatus;
  enabled: boolean;
  vramMb: number;
  contextTokens: number;
  virtualClockMhz: number;
  affinities: GpuTaskAffinity[];
  metrics: {
    totalWorkloads: number;
    tokensScraped: number;
    actionsExecuted: number;
    avgLatencyMs: number;
    lastActiveTimestamp?: string;
  };
}

export interface GpuComputeWorkload {
  id: string;
  title: string;
  prompt: string;
  affinity: GpuTaskAffinity;
  targetCoreId: VirtualGpuCoreId;
  status: "queued" | "dispatched_to_app" | "observing_stream" | "completed" | "failed";
  rawOutput: string;
  actionsDetected: GriotAction[];
  executionResults: GriotExecutionResult[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  estimatedGcu: number;
}

export interface ModelGpuRalState {
  active: boolean;
  zeroApiMode: boolean; // Always true in Observer architecture
  cores: Record<VirtualGpuCoreId, VirtualGpuCore>;
  activeWorkload: GpuComputeWorkload | null;
  workloadHistory: GpuComputeWorkload[];
  telemetry: {
    totalAllocatedGcu: number;
    aggregatedThroughputTps: number;
    activeCoresCount: number;
    totalZeroApiDispatches: number;
    lastScrapedChunk?: string;
  };
}
