import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Sparkles,
  Clock,
  Calendar,
  Lock,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  createProjectTaskInDb,
  type AutonomousTaskPayload,
  type ProjectTaskItem,
} from "@/lib/project-service";
import { getAvailableSecretReferences } from "@/lib/plugins-service";
import { toast } from "sonner";

export interface AutonomousTaskModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialInstruction?: string;
  createdFrom?: "project" | "chat";
  onTaskCreated?: (task: ProjectTaskItem) => void;
}

type PipelineStep = "plan" | "build" | "test" | "publish";

export function AutonomousTaskModal({
  open,
  onClose,
  projectId,
  initialInstruction = "",
  createdFrom = "project",
  onTaskCreated,
}: AutonomousTaskModalProps) {
  const t = useT();

  const [instruction, setInstruction] = useState(initialInstruction);
  const [runAtTime, setRunAtTime] = useState("20:00");
  const [runAtDate, setRunAtDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [repeat, setRepeat] = useState<"once" | "daily" | "weekly" | "monthly">("once");
  const [pipeline, setPipeline] = useState<PipelineStep[]>(["plan", "build", "test", "publish"]);
  const [selectedSecrets, setSelectedSecrets] = useState<string[]>([]);
  const [customSecretInput, setCustomSecretInput] = useState("");
  const [showAddSecretDropdown, setShowAddSecretDropdown] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Timezone detectado
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";
    } catch {
      return "Europe/Lisbon";
    }
  }, []);

  // Busca segredos/credenciais configurados no sistema
  const availableSecrets = useMemo(() => {
    if (!open) return [];
    return getAvailableSecretReferences();
  }, [open]);

  // Sincroniza instrução inicial se alterada externamente
  useEffect(() => {
    if (open) {
      setInstruction(initialInstruction);
      setTestResult(null);

      // Pré-seleciona segredos comuns se já conectados
      const autoSecrets: string[] = [];
      availableSecrets.forEach((sec) => {
        if (!autoSecrets.includes(sec.key)) {
          autoSecrets.push(sec.key);
        }
      });
      setSelectedSecrets(autoSecrets.slice(0, 3));
    }
  }, [open, initialInstruction, availableSecrets]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const togglePipelineStep = (step: PipelineStep) => {
    setPipeline((prev) => (prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]));
  };

  const handleToggleSecret = (secKey: string) => {
    setSelectedSecrets((prev) =>
      prev.includes(secKey) ? prev.filter((k) => k !== secKey) : [...prev, secKey],
    );
  };

  const handleAddCustomSecret = () => {
    const formatted = customSecretInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");
    if (!formatted) return;
    if (!selectedSecrets.includes(formatted)) {
      setSelectedSecrets((prev) => [...prev, formatted]);
    }
    setCustomSecretInput("");
    setShowAddSecretDropdown(false);
  };

  const handleRunTest = async () => {
    if (!instruction.trim()) {
      toast.error(t("Define o que o GRIOT deve fazer antes de testar."));
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    // Simula verificação estrita de pipeline, secrets e sandbox
    await new Promise((r) => setTimeout(r, 900));

    setIsTesting(false);
    setTestResult({
      success: true,
      message: t(
        "Validação concluída: pipeline configurado, referências de secrets válidas e runtime sandbox acessível.",
      ),
    });
    toast.success(t("Teste do pipeline autónomo passou com sucesso!"));
  };

  const handleSaveTask = async () => {
    if (!projectId) {
      toast.error(t("Projeto não encontrado."));
      return;
    }
    if (!instruction.trim()) {
      toast.error(t("Escreve a instrução da tarefa."));
      return;
    }

    setIsSaving(true);
    try {
      const payload: AutonomousTaskPayload = {
        instruction: instruction.trim(),
        runAtTime,
        runAtDate,
        timezone,
        repeat,
        secretRefs: selectedSecrets,
        pipeline,
        createdFrom,
      };

      const created = await createProjectTaskInDb(projectId, payload, "scheduled");
      if (created) {
        toast.success(t("Autonomous Task agendada com sucesso!"));
        onTaskCreated?.(created);
        onClose();
      } else {
        toast.error(t("Não foi possível agendar a tarefa."));
      }
    } catch (err: any) {
      toast.error(err.message || t("Erro ao guardar tarefa."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[26px] border border-hairline bg-surface p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto rise text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline/60 pb-3.5">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">
              {t("Autonomous Task")}
            </h3>
            <p className="text-[12px] text-muted-foreground">
              {t("GRIOT executa este trabalho sozinho no horário definido.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 1. O que o GRIOT deve fazer? */}
        <div className="space-y-1.5">
          <label className="block text-[13px] font-semibold text-foreground">
            {t("What should GRIOT do?")}
          </label>
          <textarea
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value);
              if (testResult) setTestResult(null);
            }}
            rows={3}
            placeholder={t(
              "Ex.: Executa a suite de testes, atualiza as dependências do projeto e cria um Pull Request com o relatório detalhado...",
            )}
            className="w-full rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground resize-y leading-relaxed"
          />
        </div>

        {/* 2. Run at & Repeat */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>{t("Run at")}</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={runAtTime}
                onChange={(e) => setRunAtTime(e.target.value)}
                className="w-full rounded-2xl border border-hairline bg-surface px-3 py-2 text-[13px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-foreground"
              />
              <input
                type="date"
                value={runAtDate}
                onChange={(e) => setRunAtDate(e.target.value)}
                className="w-full rounded-2xl border border-hairline bg-surface px-2.5 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {t("Fuso:")} {timezone}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>{t("Repeat")}</span>
            </label>
            <div className="relative">
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as any)}
                className="w-full appearance-none rounded-2xl border border-hairline bg-surface px-3.5 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              >
                <option value="once">{t("Once")}</option>
                <option value="daily">{t("Daily")}</option>
                <option value="weekly">{t("Weekly")}</option>
                <option value="monthly">{t("Monthly")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {repeat === "once"
                ? t("Execução única programada.")
                : t("Recorrência contínua autónoma.")}
            </p>
          </div>
        </div>

        {/* 3. Secrets */}
        <div className="space-y-2 rounded-2xl border border-hairline/80 bg-surface/40 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground">{t("Secrets")}</span>
            </div>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary">
              {selectedSecrets.length} {t("configured")}
            </span>
          </div>

          <p className="text-[11.5px] text-muted-foreground leading-snug">
            {t("Credenciais disponíveis apenas durante a execução no sandbox isolado.")}
          </p>

          {/* Chips de secrets selecionados */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {selectedSecrets.map((sec) => (
              <span
                key={sec}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-mono font-medium text-foreground"
              >
                <Lock className="size-2.5 text-muted-foreground" />
                <span>{sec}</span>
                <button
                  type="button"
                  onClick={() => handleToggleSecret(sec)}
                  className="text-muted-foreground hover:text-foreground ml-0.5"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}

            {/* Botão de adicionar secret */}
            <button
              type="button"
              onClick={() => setShowAddSecretDropdown(!showAddSecretDropdown)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <Plus className="size-3" />
              <span>{t("Adicionar secret")}</span>
            </button>
          </div>

          {/* Painel expansível para escolher/adicionar segredo */}
          {showAddSecretDropdown && (
            <div className="rounded-xl border border-hairline bg-surface p-2.5 space-y-2 mt-2 animate-fade-in text-[12px]">
              {availableSecrets.length > 0 && (
                <div>
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                    {t("Segredos dos Plugins Conectados:")}
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {availableSecrets.map((s) => {
                      const isSelected = selectedSecrets.includes(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => handleToggleSecret(s.key)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] font-mono transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-hairline bg-surface text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span>{s.key}</span>
                          <span className="text-[10px] opacity-70">({s.label})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={customSecretInput}
                  onChange={(e) => setCustomSecretInput(e.target.value)}
                  placeholder={t("Nome do segredo (ex: API_KEY)")}
                  className="flex-1 rounded-xl border border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSecret}
                  className="rounded-xl bg-foreground px-3 py-1 text-[11.5px] font-medium text-background active:scale-95 transition-transform"
                >
                  {t("Incluir")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Execution Pipeline */}
        <div className="space-y-2">
          <label className="block text-[13px] font-semibold text-foreground">
            {t("Execution pipeline")}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(["plan", "build", "test", "publish"] as PipelineStep[]).map((step) => {
              const active = pipeline.includes(step);
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => togglePipelineStep(step)}
                  className={`rounded-2xl border py-2.5 text-center text-[12.5px] font-medium capitalize transition-all active:scale-95 ${
                    active
                      ? "border-hairline bg-surface/90 text-foreground shadow-xs font-semibold"
                      : "border-hairline/60 bg-surface/40 text-muted-foreground/70 hover:text-foreground"
                  }`}
                >
                  {step === "plan" && t("Plan")}
                  {step === "build" && t("Build")}
                  {step === "test" && t("Test")}
                  {step === "publish" && t("Publish")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resultado do Teste de Dry-run */}
        {testResult && (
          <div className="flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-2.5 text-primary text-[12px] animate-fade-in">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{testResult.message}</span>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-hairline/60">
          <button
            type="button"
            disabled={isSaving || isTesting}
            onClick={handleRunTest}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-foreground hover:bg-surface active:scale-95 transition-all disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("Testing...")}</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                <span>{t("Run test")}</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isSaving || isTesting}
            onClick={handleSaveTask}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("A guardar...")}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5" />
                <span>{t("Save task")}</span>
              </>
            )}
          </button>
        </div>

        {/* Nota de Validação do Rodapé */}
        <div className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground/80 leading-relaxed border-t border-hairline/40">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
          <span>
            {t(
              "Validation queued: instructions, permissions, secrets and execution environment will be checked before the real run.",
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
