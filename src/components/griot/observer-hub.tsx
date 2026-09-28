/**
 * GRIOT Observer Hub Modal & Detail Sheet
 * Provides comprehensive inspection, connection toggles, capabilities breakdown,
 * and test action triggers for each of the 8 supported AI Chat Apps.
 */

import { useState } from "react";
import { AI_OBSERVER_APPS, AiChatAppConfig } from "@/lib/runtime/apps";
import { observerEngine } from "@/lib/runtime/observer";
import { ObserverSource } from "@/lib/runtime/protocol";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  Layers,
  Zap,
  Terminal,
  FileCode,
  GitBranch,
  ShieldCheck,
  Check,
  Power,
  ExternalLink,
  ChevronRight,
  Send,
} from "lucide-react";

interface ObserverHubProps {
  open: boolean;
  onClose: () => void;
}

export function ObserverHubDialog({ open, onClose }: ObserverHubProps) {
  const t = useT();
  const [selectedAppId, setSelectedAppId] = useState<string>("chatgpt");
  const [state, setState] = useState(() => observerEngine.getState());
  const [simulatedCmd, setSimulatedCmd] = useState<string>("fs.read_tree");
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const currentApp: AiChatAppConfig = AI_OBSERVER_APPS[selectedAppId] || AI_OBSERVER_APPS.chatgpt;
  const connectedInfo = state.connectedApps.find(
    (a) => a.appId === selectedAppId || a.provider === selectedAppId,
  );
  const isConnected = Boolean(connectedInfo?.connected);

  const handleToggle = () => {
    const next = !isConnected;
    observerEngine.setAppConnected(selectedAppId, next);
    setState(observerEngine.getState());
    toast.success(
      next
        ? `${currentApp.name}: ${t("Observer ligado com sucesso.")}`
        : `${currentApp.name}: ${t("Observer desligado.")}`,
    );
  };

  const handleRunSampleAction = async () => {
    setTesting(true);
    let sampleContent = "";
    if (simulatedCmd === "fs.read_tree") {
      sampleContent = `Vou verificar a árvore de ficheiros do projeto atual.\n<griot_action type="fs.read_tree"></griot_action>`;
    } else if (simulatedCmd === "shell.install") {
      sampleContent = `A instalar dependências necessárias para o projeto.\n<griot_action type="shell.install">\n<command>npm install @tanstack/react-query</command>\n</griot_action>`;
    } else if (simulatedCmd === "git.status") {
      sampleContent = `A verificar o estado do repositório Git.\n<griot_action type="git.status"></griot_action>`;
    } else if (simulatedCmd === "test.run") {
      sampleContent = `A executar a suite de testes vitest.\n<griot_action type="test.run">\n<command>npm test</command>\n</griot_action>`;
    }

    try {
      const res = await observerEngine.simulateAppMessage(selectedAppId, sampleContent, "hub_test");
      setState(observerEngine.getState());
      if (res.actionsDetected.length > 0) {
        toast.success(
          `${currentApp.name}: ${res.actionsDetected.length} ${t("ação detetada e processada pelo Observer.")}`,
        );
      } else {
        toast.info(t("Nenhuma ação no comando simulado."));
      }
    } catch {
      toast.error(t("Falha ao simular evento do Observer."));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-hairline bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
              <Zap className="size-4" />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight leading-tight">
                {t("GRIOT Observer Hub")}
              </h2>
              <p className="text-[12px] text-muted-foreground">
                {t("Ponte ReAct ativa para 8 Apps de Chat de IA")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Fechar")}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-95 transition-all"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content Body: Sidebar 8 Apps + Detail */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* App List (Left) */}
          <div className="w-full md:w-56 border-r border-hairline p-2 overflow-y-auto space-y-1 bg-background/30 shrink-0">
            <p className="px-3 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {t("8 Apps Suportadas")}
            </p>
            {Object.values(AI_OBSERVER_APPS).map((app) => {
              const appConnected = state.connectedApps.find((a) => a.appId === app.id)?.connected;
              const isSelected = selectedAppId === app.id;
              return (
                <button
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "hover:bg-secondary/70 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`grid size-6 place-items-center rounded-md text-[10px] font-bold ${
                        isSelected ? "bg-primary-foreground/20" : "bg-secondary"
                      }`}
                    >
                      {app.short}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] truncate leading-none">{app.name}</p>
                      <p
                        className={`text-[10px] truncate mt-0.5 ${
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {app.vendor}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      appConnected
                        ? isSelected
                          ? "bg-primary-foreground"
                          : "bg-emerald-500"
                        : isSelected
                          ? "bg-primary-foreground/30"
                          : "bg-muted-foreground/30"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* App Detail (Right) */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {/* Header of selected app */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-hairline">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[18px] font-semibold">{currentApp.name}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary font-mono text-muted-foreground">
                    {currentApp.vendor}
                  </span>
                </div>
                <p className="text-[12px] font-mono text-muted-foreground truncate mt-0.5">
                  Package: {currentApp.androidPackage}
                </p>
              </div>

              <button
                onClick={handleToggle}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  isConnected
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                    : "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
                }`}
              >
                <Power className="size-3.5" />
                {isConnected ? t("Desligar Observer") : t("Ligar Observer")}
              </button>
            </div>

            {/* Capabilities grid */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {t("Capacidades Integradas")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <Terminal className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium">{t("ReAct Tools")}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium">{t("FS Virtual")}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium">{t("Git Triggers")}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium">{t("Policy Guard")}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <Layers className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium">
                    {currentApp.capabilities.streaming ? "Streaming" : "Polling"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-hairline bg-background/50 flex items-center gap-2">
                  <Sparkles className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium truncate">
                    {currentApp.defaultModel}
                  </span>
                </div>
              </div>
            </div>

            {/* Test Action Simulation */}
            <div className="p-3.5 rounded-2xl border border-hairline bg-surface/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium tracking-tight">
                  {t("Testar Interoperabilidade com")} {currentApp.name}
                </p>
                <span className="text-[10.5px] font-mono text-muted-foreground">ReAct Cycle</span>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {[
                  { id: "fs.read_tree", label: "fs.read_tree" },
                  { id: "shell.install", label: "shell.install" },
                  { id: "git.status", label: "git.status" },
                  { id: "test.run", label: "test.run" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSimulatedCmd(item.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono transition-all ${
                      simulatedCmd === item.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleRunSampleAction}
                disabled={testing}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-secondary hover:bg-secondary/80 active:scale-[0.99] text-[13px] font-medium transition-all"
              >
                <Send className="size-3.5" />
                {testing ? t("A processar no Observer…") : t("Disparar Ação de Teste")}
              </button>
            </div>

            {/* Runtime Instruction Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {t("Protocolo Injetado")}
              </p>
              <pre className="p-3 rounded-xl bg-background/80 border border-hairline text-[11px] font-mono text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                {currentApp.runtimeInstruction}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-hairline px-6 py-3 bg-background/40">
          <span className="text-[12px] text-muted-foreground">
            {state.connectedApps.filter((a) => a.connected).length} / 8 {t("apps ativas")}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90"
          >
            {t("Concluído")}
          </button>
        </div>
      </div>
    </div>
  );
}
