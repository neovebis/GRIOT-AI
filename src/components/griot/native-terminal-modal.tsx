import React, { useState, useRef, useEffect } from "react";
import { Terminal, X, Play, Trash2, ShieldCheck, Cpu } from "lucide-react";
import { executeNativeCommand, getNativeSystemInfo, type NativeSystemInfo } from "@/lib/runtime/native-terminal-bridge";
import { useT } from "@/lib/i18n";

interface NativeTerminalModalProps {
  open: boolean;
  onClose: () => void;
}

interface LogEntry {
  id: string;
  type: "command" | "stdout" | "stderr" | "system";
  text: string;
  timestamp: string;
}

const QUICK_COMMANDS = [
  "uname -a",
  "node -v",
  "python3 --version",
  "git --version",
  "free -m",
  "ls -la",
];

export function NativeTerminalModal({ open, onClose }: NativeTerminalModalProps) {
  const t = useT();
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [sysInfo, setSysInfo] = useState<NativeSystemInfo | null>(null);
  const [history, setHistory] = useState<LogEntry[]>([
    {
      id: "init-1",
      type: "system",
      text: "GRIOT Runtime Terminal — A estabelecer ligação ao ambiente...",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      void getNativeSystemInfo().then((info) => {
        setSysInfo(info);
        setHistory((prev) => [
          ...prev.filter((entry) => entry.id !== "init-1"),
          {
            id: `env-${Date.now()}`,
            type: "system",
            text: info.isArm64
              ? `[GRIOT Nativo]: ${info.os} (${info.abi}) | Rootfs: ${info.rootfsPath}`
              : `[GRIOT Cloud Run Sandbox]: ${info.os} (${info.abi}) | Workspace: ${info.workspacePath}`,
            timestamp: new Date().toLocaleTimeString(),
          },
          {
            id: `mem-${Date.now()}`,
            type: "system",
            text: `Memória: ${info.availMemMb}MB livres de ${info.totalMemMb}MB | Proteção de Processos: ${info.phantomProcessGuard ? "ATIVA" : "INATIVA"}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  if (!open) return null;

  const handleRun = async (cmdToRun: string) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed || running) return;

    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setCommand("");

    const cmdEntry: LogEntry = {
      id: `cmd-${Date.now()}`,
      type: "command",
      text: trimmed,
      timestamp: new Date().toLocaleTimeString(),
    };
    setHistory((prev) => [...prev, cmdEntry]);
    setRunning(true);

    try {
      const res = await executeNativeCommand(trimmed);
      const outputEntries: LogEntry[] = [];

      if (res.stdout) {
        outputEntries.push({
          id: `out-${Date.now()}`,
          type: "stdout",
          text: res.stdout,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      if (res.stderr) {
        outputEntries.push({
          id: `err-${Date.now()}`,
          type: "stderr",
          text: res.stderr,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      if (!res.stdout && !res.stderr) {
        outputEntries.push({
          id: `done-${Date.now()}`,
          type: "system",
          text: `[Process exited with code ${res.exitCode} in ${res.durationMs}ms]`,
          timestamp: new Date().toLocaleTimeString(),
        });
      }

      setHistory((prev) => [...prev, ...outputEntries]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: "stderr",
          text: err?.message || String(err),
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleRun(command);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCommand(commandHistory[nextIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= commandHistory.length) {
        setHistoryIndex(-1);
        setCommand("");
      } else {
        setHistoryIndex(nextIdx);
        setCommand(commandHistory[nextIdx] || "");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] bg-surface/90">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid size-8 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Terminal className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[14.5px] font-semibold text-foreground truncate">
                {t("Terminal Nativo ARM64")}
              </h2>
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PRoot
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground truncate">
              {sysInfo?.abi || "aarch64"} · {sysInfo?.availMemMb ? `${sysInfo.availMemMb}MB RAM livre` : "Heap 1024MB Bounded"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHistory([])}
            title={t("Limpar")}
            className="rounded-xl border border-hairline bg-secondary/50 p-2 text-muted-foreground hover:text-foreground active:scale-95"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-hairline bg-secondary/50 p-2 text-muted-foreground hover:text-foreground active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Quick commands bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-hairline/60 bg-surface/40 px-3 py-1.5 scrollbar-none">
        {QUICK_COMMANDS.map((qCmd) => (
          <button
            key={qCmd}
            type="button"
            onClick={() => void handleRun(qCmd)}
            disabled={running}
            className="shrink-0 rounded-lg border border-hairline/80 bg-surface px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-all"
          >
            {qCmd}
          </button>
        ))}
      </div>

      {/* Output Console */}
      <div className="flex-1 overflow-y-auto p-3.5 font-mono text-[12.5px] leading-relaxed bg-[#0a0b0d] text-zinc-200">
        <div className="space-y-1.5">
          {history.map((entry) => {
            if (entry.type === "command") {
              return (
                <div key={entry.id} className="flex items-start gap-1.5 pt-1.5">
                  <span className="text-emerald-400 font-semibold select-none">griot@arm64:~$</span>
                  <span className="text-white font-medium break-all">{entry.text}</span>
                </div>
              );
            }
            if (entry.type === "system") {
              return (
                <div key={entry.id} className="text-zinc-500 text-[11px] italic">
                  # {entry.text}
                </div>
              );
            }
            if (entry.type === "stderr") {
              return (
                <div key={entry.id} className="text-rose-400 whitespace-pre-wrap break-all pl-2 border-l border-rose-500/30">
                  {entry.text}
                </div>
              );
            }
            return (
              <div key={entry.id} className="text-zinc-300 whitespace-pre-wrap break-all pl-2 border-l border-zinc-700/40">
                {entry.text}
              </div>
            );
          })}
          {running && (
            <div className="flex items-center gap-2 text-zinc-400 text-[11.5px] italic animate-pulse">
              <span className="size-2 rounded-full bg-primary animate-ping" />
              A executar processo no ARM64...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-hairline bg-surface/90 p-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
        <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-background px-3 py-1.5 shadow-inner">
          <span className="text-emerald-400 font-mono text-[12px] font-bold select-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            placeholder={t("Executa comando (ex: git status, node -v)...")}
            className="flex-1 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
          <button
            type="button"
            onClick={() => void handleRun(command)}
            disabled={running || !command.trim()}
            className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Play className="size-3.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
}
