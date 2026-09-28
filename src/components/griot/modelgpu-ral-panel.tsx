/**
 * GRIOT ModelGPU RAL (Reasoning Abstraction Layer) Dashboard & Core Inspector
 * Visualizes the 8 AppChat Virtual GPU cores, live workload dispatching,
 * Zero-API intent routing, and real-time Observer tensor streams.
 */

import { useState, useEffect } from "react";
import {
  modelGpuRalEngine,
  ModelGpuRalState,
  VirtualGpuCore,
  GpuTaskAffinity,
  VirtualGpuCoreId,
} from "@/lib/runtime/modelgpu-ral";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Cpu,
  Zap,
  Activity,
  Send,
  Layers,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Radio,
  Clock,
  Terminal,
  RefreshCw,
  X,
} from "lucide-react";

interface ModelGpuRalDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ModelGpuRalDialog({ open, onClose }: ModelGpuRalDialogProps) {
  const t = useT();
  const [state, setState] = useState<ModelGpuRalState>(() => modelGpuRalEngine.getState());
  const [selectedCoreId, setSelectedCoreId] = useState<VirtualGpuCoreId>("core_1_claude");
  const [prompt, setPrompt] = useState("");
  const [affinity, setAffinity] = useState<GpuTaskAffinity>("code_generation");
  const [isDispatching, setIsDispatching] = useState(false);
  const [copiedEnvelope, setCopiedEnvelope] = useState(false);

  useEffect(() => {
    const unsub = modelGpuRalEngine.subscribe((next) => {
      setState(next);
    });
    return () => unsub();
  }, []);

  if (!open) return null;

  const currentCore: VirtualGpuCore = state.cores[selectedCoreId] || state.cores.core_1_claude;
  const coresList = Object.values(state.cores);

  const handleDispatch = async () => {
    if (!prompt.trim()) {
      toast.error(t("Escreve uma instrução para despachar para o ModelGPU RAL."));
      return;
    }

    setIsDispatching(true);
    try {
      const workload = await modelGpuRalEngine.dispatchComputeWorkload({
        prompt,
        affinity,
        targetCoreId: selectedCoreId,
      });

      toast.success(
        `${currentCore.name}: ${t("Carga despachada via Zero-API Observer. Prompt pronto no clipboard!")}`,
      );
      setPrompt("");
    } catch {
      toast.error(t("Falha ao despachar carga para o ModelGPU RAL."));
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCopyPromptEnvelope = () => {
    const envelope = `[GRIOT ModelGPU RAL // Core: ${currentCore.name}]\n${prompt || "Instrução de teste de raciocínio..."}`;
    navigator.clipboard.writeText(envelope);
    setCopiedEnvelope(true);
    toast.success(t("Envelope ModelGPU RAL copiado para a área de transferência."));
    setTimeout(() => setCopiedEnvelope(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-hairline bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold tracking-tight leading-tight">
                  ModelGPU RAL · AppChat Cluster
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  100% Zero-API
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {t(
                  "Virtualização dos 8 AppChats como Cores Neurais via Observer de Acessibilidade.",
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-surface-elevated text-muted-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Global Cluster Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 bg-surface-elevated/40 border-b border-hairline text-[12px]">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary shrink-0" />
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                {t("Throughput Virtual")}
              </p>
              <p className="font-semibold">{state.telemetry.aggregatedThroughputTps} tok/s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                {t("Cores Ativos")}
              </p>
              <p className="font-semibold">
                {state.telemetry.activeCoresCount} / 8 {t("Cores")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                {t("Despachos Zero-API")}
              </p>
              <p className="font-semibold">
                {state.telemetry.totalZeroApiDispatches} {t("cargas")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-sky-500 shrink-0" />
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                {t("Compute GCU")}
              </p>
              <p className="font-semibold">{state.telemetry.totalAllocatedGcu.toFixed(2)} GCU</p>
            </div>
          </div>
        </div>

        {/* Main Content: Split Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-hairline">
          {/* Left Column: 8 Virtual Cores Matrix (5 cols) */}
          <div className="md:col-span-5 p-4 space-y-2.5 overflow-y-auto max-h-[55vh] md:max-h-none">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("Matriz de Cores Neurais")} (8 Cores)
              </span>
              <button
                onClick={() => {
                  modelGpuRalEngine.refreshCoreStatuses();
                  setState(modelGpuRalEngine.getState());
                }}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <RefreshCw className="size-3" />
                {t("Sincronizar")}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {coresList.map((core) => {
                const isSelected = core.id === selectedCoreId;
                const statusColor =
                  core.status === "streaming" || core.status === "computing"
                    ? "bg-emerald-500 text-emerald-500"
                    : core.status === "dispatched"
                      ? "bg-amber-500 text-amber-500"
                      : "bg-muted-foreground text-muted-foreground";

                return (
                  <button
                    key={core.id}
                    onClick={() => setSelectedCoreId(core.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-hairline hover:bg-surface-elevated/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="grid size-8 place-items-center rounded-xl bg-surface border border-hairline shrink-0">
                        <Cpu
                          className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium truncate">{core.name}</p>
                          <span className="text-[10px] text-muted-foreground/80 font-mono">
                            {core.vendor}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-mono">{core.virtualClockMhz} MHz</span>
                          <span>·</span>
                          <span>{(core.vramMb / 1000).toFixed(0)}k ctx</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                          core.status === "streaming" || core.status === "computing"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-surface-elevated text-muted-foreground border border-hairline"
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${statusColor.split(" ")[0]}`} />
                        {core.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {core.metrics.totalWorkloads} {t("runs")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Workload Dispatcher & Tensor Stream Inspector (7 cols) */}
          <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-6 overflow-y-auto">
            {/* Core Specs Card */}
            <div className="p-4 rounded-2xl border border-hairline bg-surface-elevated/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold">{currentCore.name}</h3>
                  <p className="text-[12px] text-muted-foreground font-mono">
                    Package: {currentCore.androidPackage}
                  </p>
                </div>
                <a
                  href={currentCore.webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium border border-hairline bg-surface hover:bg-surface-elevated transition-colors"
                >
                  <ExternalLink className="size-3" />
                  {t("Abrir App")}
                </a>
              </div>

              {/* Affinities Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {currentCore.affinities.map((aff) => (
                  <span
                    key={aff}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    #{aff.replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>

            {/* Zero-API Dispatch Form */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-foreground">
                  {t("Despachar Carga para o Core (Zero-API)")}
                </label>
                <button
                  type="button"
                  onClick={handleCopyPromptEnvelope}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {copiedEnvelope ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {t("Copiar Envelope")}
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t(
                  "Exemplo: Analisa o ficheiro de rotas e cria uma nova ação <griot_action type='fs.write_file'>...",
                )}
                rows={4}
                className="w-full rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-none"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{t("Afinidade:")}</span>
                  <select
                    value={affinity}
                    onChange={(e) => setAffinity(e.target.value as GpuTaskAffinity)}
                    className="rounded-xl border border-hairline bg-surface px-2.5 py-1 text-[11px] focus:outline-none"
                  >
                    <option value="code_generation">{t("Geração de Código")}</option>
                    <option value="deep_reasoning">{t("Raciocínio Profundo")}</option>
                    <option value="multimodal_vision">{t("Multimodal")}</option>
                    <option value="deep_research">{t("Pesquisa Web")}</option>
                    <option value="math_logic">{t("Matemática & Lógica")}</option>
                    <option value="architecture">{t("Arquitetura")}</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isDispatching || !prompt.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary text-primary-foreground font-medium text-[13px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
                >
                  <Send className="size-3.5" />
                  {isDispatching ? t("A despachar...") : t("Despachar Core")}
                </button>
              </div>
            </div>

            {/* Live Observer Tensor Stream preview */}
            <div className="p-3.5 rounded-2xl border border-hairline bg-surface-elevated/40 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-primary" />
                  {t("Observer Stream Tensor")}
                </span>
                <span className="font-mono text-muted-foreground/70">
                  {state.telemetry.lastScrapedChunk ? "LIVE" : "IDLE"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground/90 bg-surface/80 p-2.5 rounded-xl border border-hairline break-all line-clamp-3">
                {state.telemetry.lastScrapedChunk ||
                  t("A aguardar scraping de respostas do Observer de Acessibilidade...")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
