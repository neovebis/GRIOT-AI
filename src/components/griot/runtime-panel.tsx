/**
 * GRIOT Runtime & Observer Panel
 * Displays active external AI observers, real-time command execution events (fs, git, shell, test)
 * and sensitive action approval cards in strict accordance with the GRIOT monochrome design system.
 */

import { useState, useEffect } from "react";
import { observerEngine } from "@/lib/runtime/observer";
import { GriotAction, GriotExecutionResult, ObserverState } from "@/lib/runtime/protocol";
import { Panel } from "./screen";
import { ObserverHubDialog } from "./observer-hub";
import { ModelGpuRalDialog } from "./modelgpu-ral-panel";
import {
  Terminal,
  FileCode,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  Play,
  XCircle,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  Radio,
  ExternalLink,
  Cpu,
  Activity,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { RuntimeDiagnosticUtility } from "./runtime-diagnostic";

export function RuntimeObserverCard() {
  const t = useT();
  const [state, setState] = useState<ObserverState>(() => observerEngine.getState());
  const [expanded, setExpanded] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [modelGpuOpen, setModelGpuOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<GriotExecutionResult | null>(null);

  useEffect(() => {
    const unsubEvents = observerEngine.subscribeEvents(() => {
      setState(observerEngine.getState());
    });
    const unsubActions = observerEngine.subscribeActions(() => {
      setState(observerEngine.getState());
    });
    return () => {
      unsubEvents();
      unsubActions();
    };
  }, []);

  const pendingCount = state.pendingActions.length;
  const historyCount = state.executionHistory.length;
  const connectedAppsList = state.connectedApps.filter((a) => a.connected);

  const handleApprove = async (actionId: string) => {
    await observerEngine.approveAndExecute(actionId);
  };

  const handleReject = async (actionId: string) => {
    await observerEngine.rejectAction(actionId);
  };

  const getActionIcon = (category: string) => {
    switch (category) {
      case "fs":
        return <FileCode className="size-4 text-foreground/80" />;
      case "git":
        return <GitBranch className="size-4 text-foreground/80" />;
      case "test":
        return <CheckCircle2 className="size-4 text-foreground/80" />;
      default:
        return <Terminal className="size-4 text-foreground/80" />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Observer Bar */}
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold tracking-tight truncate">
                  {t("GRIOT Observer")}
                </p>
                <span className="text-[11px] text-muted-foreground/70">
                  {connectedAppsList.length}/8 {t("ativas")}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                {connectedAppsList.length > 0
                  ? connectedAppsList.map((a) => a.sessionTitle || a.provider).join(" · ")
                  : t("Nenhuma app ligada · Toca para gerir")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
            >
              <span className="tabular-nums">
                {pendingCount > 0 ? `${pendingCount} ${t("pendente(s)")}` : `${historyCount} logs`}
              </span>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        </div>

        {/* 8-App Badges Strip */}
        <div className="mt-3 pt-2.5 border-t border-hairline flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {state.connectedApps.map((app) => (
            <button
              key={app.appId || app.provider}
              onClick={() => setHubOpen(true)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium shrink-0 transition-colors border ${
                app.connected
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "bg-secondary/40 border-hairline text-muted-foreground opacity-60"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${app.connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
              />
              <span>{app.sessionTitle}</span>
            </button>
          ))}
        </div>

        {/* Pending Approvals */}
        {pendingCount > 0 && (
          <div className="mt-4 pt-3 border-t border-hairline space-y-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-400">
              <ShieldAlert className="size-3.5" />
              <span>{t("Ação Requer Autorização")}</span>
            </div>

            {state.pendingActions.map((action) => (
              <div
                key={action.id}
                className="rounded-lg bg-surface/50 border border-hairline p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {getActionIcon(action.category)}
                    <span className="text-[13px] font-mono font-medium truncate">
                      {action.type}
                    </span>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                    {action.risk}
                  </span>
                </div>

                <div className="text-[12px] font-mono text-muted-foreground bg-background/60 p-2 rounded border border-hairline overflow-x-auto">
                  {typeof action.params.command === "string"
                    ? action.params.command
                    : typeof action.params.path === "string"
                      ? action.params.path
                      : JSON.stringify(action.params)}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleReject(action.id)}
                    className="px-2.5 py-1 text-[12px] rounded border border-hairline text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                  >
                    {t("Rejeitar")}
                  </button>
                  <button
                    onClick={() => handleApprove(action.id)}
                    className="flex items-center gap-1 px-3 py-1 text-[12px] rounded bg-primary text-primary-foreground font-medium hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Play className="size-3" />
                    {t("Autorizar & Executar")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Expanded History */}
        {expanded && (
          <div className="mt-4 pt-3 border-t border-hairline space-y-2">
            <p className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-medium">
              {t("Histórico de Execuções Recentes")}
            </p>

            {historyCount === 0 ? (
              <p className="text-[12.5px] text-muted-foreground py-2 italic">
                {t("Nenhum comando executado na sessão atual.")}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {state.executionHistory.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedResult(selectedResult === item ? null : item)}
                    className="flex items-center justify-between p-2 rounded bg-surface/30 hover:bg-surface/60 border border-hairline text-[12px] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === "success" ? (
                        <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="size-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono truncate">{item.actionType}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0 text-[11px] font-mono">
                      <span>{item.durationMs}ms</span>
                      <span>code {item.exitCode}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedResult && (
              <div className="mt-3 p-3 rounded-lg bg-background/80 border border-hairline space-y-1 text-[11.5px] font-mono">
                <p className="text-muted-foreground">{t("Saída detalhada:")}</p>
                <pre className="text-foreground/90 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {selectedResult.stdout || selectedResult.stderr || t("(sem saída)")}
                </pre>
              </div>
            )}

            {/* Diagnostic Utility Toggle */}
            <div className="pt-2 border-t border-hairline flex items-center justify-between">
              <button
                onClick={() => setDiagnosticOpen(!diagnosticOpen)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline py-1"
              >
                <Activity className="size-3.5" />
                <span>
                  {diagnosticOpen
                    ? t("Ocultar Diagnóstico de Runtime")
                    : t("Diagnóstico de Runtime & Sandbox")}
                </span>
              </button>
            </div>

            {diagnosticOpen && (
              <div className="mt-2 pt-2">
                <RuntimeDiagnosticUtility />
              </div>
            )}
          </div>
        )}
      </Panel>

      <ObserverHubDialog open={hubOpen} onClose={() => setHubOpen(false)} />
      <ModelGpuRalDialog open={modelGpuOpen} onClose={() => setModelGpuOpen(false)} />
    </div>
  );
}
