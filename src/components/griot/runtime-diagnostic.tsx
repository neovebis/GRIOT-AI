/**
 * GRIOT Runtime & Sandbox Diagnostic Utility Component
 *
 * Verifies:
 * 1. Heartbeat & Execution Capacity of GRIOT_RUNTIME_EXECUTOR_URL / /api/runtime/execute
 * 2. GRIOT Sandbox (griot-studio-compute Edge Function & Execution Gateway)
 * 3. Backend Container Process Execution (/api/plugin -> exec)
 * 4. Local Virtual Harness execution coverage across all command suites
 *
 * Outputs rich, formatted console telemetry with error codes and timing.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { executeAction } from "@/lib/runtime/executors";
import { executeLocalAction, getWorkspaceFiles } from "@/lib/runtime/local-harness";
import { getActiveProjectSync } from "@/lib/project-service";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Terminal,
  Server,
  Box,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/lib/i18n";

export interface DiagnosticResult {
  id: string;
  name: string;
  category: "executor_url" | "sandbox" | "backend_exec" | "local_harness";
  status: "pending" | "running" | "success" | "warning" | "failed";
  httpStatus?: number;
  errorCode?: string;
  durationMs: number;
  message: string;
  details?: Record<string, unknown> | string;
}

export function RuntimeDiagnosticUtility({ className = "" }: { className?: string }) {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "logs">("summary");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const appendLog = useCallback((msg: string) => {
    setConsoleLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const runAllDiagnostics = async () => {
    setRunning(true);
    setConsoleLogs([]);
    const diagResults: DiagnosticResult[] = [];

    console.group(
      "%c[GRIOT DIAGNOSTIC SYSTEM] 🔬 Iniciando Verificação Global",
      "color: #06b6d4; font-weight: bold; font-size: 13px;",
    );
    appendLog("🚀 Iniciando diagnóstico do GRIOT Sandbox, Runtime Executor e Harness...");

    // -------------------------------------------------------------
    // TESTE 1: Heartbeat e Capacidade do GRIOT_RUNTIME_EXECUTOR_URL
    // -------------------------------------------------------------
    console.group(
      "%c[1/4] GRIOT_RUNTIME_EXECUTOR_URL / /api/runtime/execute Heartbeat",
      "color: #3b82f6; font-weight: bold;",
    );
    const test1Start = Date.now();
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token || "";

      appendLog(
        `Conectando a /api/runtime/execute (Auth token: ${token ? "PRESENTE" : "ANÔNIMO"})...`,
      );

      const res = await fetch("/api/runtime/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "probe.heartbeat",
          command: "echo '__GRIOT_HEARTBEAT_PROBE__'",
          timestamp: Date.now(),
        }),
      });

      const elapsed = Date.now() - test1Start;
      const status = res.status;
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {}

      console.info("Status HTTP:", status);
      console.info("Headers:", Object.fromEntries(res.headers.entries()));
      console.info("Payload de Resposta:", bodyText);
      console.info(`Latência: ${elapsed}ms`);

      if (status === 200) {
        diagResults.push({
          id: "executor_url",
          name: "GRIOT Runtime Executor Endpoint",
          category: "executor_url",
          status: "success",
          httpStatus: 200,
          durationMs: elapsed,
          message: "Conexão ativa com o executor remoto GCP/Cloud Run.",
          details: bodyText,
        });
        appendLog(`✓ /api/runtime/execute: 200 OK (${elapsed}ms)`);
      } else if (status === 503) {
        diagResults.push({
          id: "executor_url",
          name: "GRIOT Runtime Executor Endpoint",
          category: "executor_url",
          status: "warning",
          httpStatus: 503,
          errorCode: "GCP_RUNNER_UNCONFIGURED",
          durationMs: elapsed,
          message:
            "GRIOT_RUNTIME_EXECUTOR_URL não configurado nas variáveis de ambiente. O sistema utiliza automaticamente o container backend.",
          details: bodyText,
        });
        appendLog(
          `⚠ /api/runtime/execute: 503 (Runner GCP não configurado; container local ativo)`,
        );
      } else if (status === 401) {
        diagResults.push({
          id: "executor_url",
          name: "GRIOT Runtime Executor Endpoint",
          category: "executor_url",
          status: "warning",
          httpStatus: 401,
          errorCode: "AUTH_REQUIRED",
          durationMs: elapsed,
          message: "Endpoint requer sessão autenticada ativa do Supabase.",
          details: bodyText,
        });
        appendLog(`⚠ /api/runtime/execute: 401 (Autenticação requerida)`);
      } else {
        diagResults.push({
          id: "executor_url",
          name: "GRIOT Runtime Executor Endpoint",
          category: "executor_url",
          status: "failed",
          httpStatus: status,
          errorCode: `HTTP_${status}`,
          durationMs: elapsed,
          message: `O endpoint retornou status ${status}.`,
          details: bodyText,
        });
        appendLog(`✗ /api/runtime/execute: HTTP ${status} (${elapsed}ms)`);
      }
    } catch (err: any) {
      const elapsed = Date.now() - test1Start;
      console.error("Falha ao comunicar com /api/runtime/execute:", err);
      diagResults.push({
        id: "executor_url",
        name: "GRIOT Runtime Executor Endpoint",
        category: "executor_url",
        status: "failed",
        errorCode: "NETWORK_ERROR",
        durationMs: elapsed,
        message: `Falha de rede ao contatar o endpoint: ${err?.message || String(err)}`,
        details: String(err?.stack || err),
      });
      appendLog(`✗ /api/runtime/execute: Erro de rede (${err?.message || err})`);
    }
    console.groupEnd();

    // -------------------------------------------------------------
    // TESTE 2: Verificação do GRIOT Sandbox (griot-studio-compute)
    // -------------------------------------------------------------
    console.group(
      "%c[2/4] GRIOT Sandbox (griot-studio-compute Edge Function)",
      "color: #a855f7; font-weight: bold;",
    );
    const test2Start = Date.now();
    const activeProject = getActiveProjectSync();
    const testProjectId = activeProject?.id || "project-default-probe";

    appendLog(`Sondando GRIOT Sandbox para o projeto "${testProjectId}"...`);

    try {
      const { data, error } = await supabase.functions.invoke(
        `griot-studio-compute/projects/${encodeURIComponent(testProjectId)}/runs/latest`,
        { method: "GET" },
      );

      const elapsed = Date.now() - test2Start;

      console.info("Dados do Sandbox Run:", data);
      if (error) console.warn("Erro do Edge Function:", error);

      if (!error && data?.run?.id) {
        diagResults.push({
          id: "sandbox",
          name: "GRIOT Sandbox Container",
          category: "sandbox",
          status: "success",
          durationMs: elapsed,
          message: `Sandbox conectado e pronto (Run ID: ${data.run.id}, Status: ${data.run.status || "ready"}).`,
          details: data,
        });
        appendLog(`✓ GRIOT Sandbox: Conectado e ativo (Run ID: ${data.run.id})`);
      } else {
        const errMsg = error?.message || "Sem run pronto no momento";
        const isRelay404 =
          errMsg.includes("FunctionsFetchError") ||
          errMsg.includes("404") ||
          errMsg.includes("not found");

        diagResults.push({
          id: "sandbox",
          name: "GRIOT Sandbox Container Gateway",
          category: "sandbox",
          status: isRelay404 ? "warning" : "failed",
          errorCode: isRelay404 ? "SANDBOX_EDGE_FUNCTION_NOT_PROVISIONED" : "SANDBOX_UNAVAILABLE",
          durationMs: elapsed,
          message: isRelay404
            ? "Edge function griot-studio-compute não provisionada remotamente. O GRIOT executa via Backend Container e Virtual Harness."
            : `Sandbox reportou: ${errMsg}`,
          details: error || data,
        });
        appendLog(
          `ℹ GRIOT Sandbox: ${isRelay404 ? "Container remoto não provisionado (usando Backend Container)" : errMsg}`,
        );
      }
    } catch (err: any) {
      const elapsed = Date.now() - test2Start;
      console.error("Exceção ao sondar o GRIOT Sandbox:", err);
      diagResults.push({
        id: "sandbox",
        name: "GRIOT Sandbox Container Gateway",
        category: "sandbox",
        status: "warning",
        errorCode: "SANDBOX_PROBE_EXCEPTION",
        durationMs: elapsed,
        message: `Comunicação com o gateway do Sandbox: ${err?.message || String(err)}`,
        details: String(err?.stack || err),
      });
      appendLog(`⚠ GRIOT Sandbox: Exceção de rede no gateway (${err?.message || err})`);
    }
    console.groupEnd();

    // -------------------------------------------------------------
    // TESTE 3: Execução Real no Backend Container (/api/plugin -> exec)
    // -------------------------------------------------------------
    console.group(
      "%c[3/4] Backend Container Process Executor (/api/plugin exec)",
      "color: #10b981; font-weight: bold;",
    );
    const test3Start = Date.now();
    const testCommand = "node -v && git --version && pwd";
    appendLog(`Executando comando no container do backend: "${testCommand}"...`);

    try {
      const res = await fetch("/api/plugin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "exec",
          action: "terminal.exec",
          params: { command: testCommand },
        }),
      });

      const elapsed = Date.now() - test3Start;
      const data = await res.json();

      console.info("Resposta do Container Backend:", data);

      if (res.ok && data?.success) {
        diagResults.push({
          id: "backend_exec",
          name: "Backend Container Execution Engine",
          category: "backend_exec",
          status: "success",
          durationMs: elapsed,
          message: `Processo executado no container real (Exit Code: ${data.data?.exitCode ?? 0}). Resposta obtida.`,
          details: data.data,
        });
        appendLog(
          `✓ Backend Container: Execução OK (${elapsed}ms) -> ${String(data.data?.stdout || "")
            .trim()
            .replace(/\n/g, " | ")}`,
        );
      } else {
        diagResults.push({
          id: "backend_exec",
          name: "Backend Container Execution Engine",
          category: "backend_exec",
          status: "warning",
          errorCode: "EXEC_NON_ZERO",
          durationMs: elapsed,
          message: `Comando executado com código ${data?.data?.exitCode ?? 1}: ${data?.data?.stderr || data?.error || "Erro"}`,
          details: data,
        });
        appendLog(`⚠ Backend Container: Resposta com aviso/erro de processo`);
      }
    } catch (err: any) {
      const elapsed = Date.now() - test3Start;
      console.error("Erro no Backend Exec:", err);
      diagResults.push({
        id: "backend_exec",
        name: "Backend Container Execution Engine",
        category: "backend_exec",
        status: "failed",
        errorCode: "BACKEND_EXEC_FAILED",
        durationMs: elapsed,
        message: `Falha na requisição ao backend: ${err?.message || String(err)}`,
        details: String(err?.stack || err),
      });
      appendLog(`✗ Backend Container: Falha de requisição`);
    }
    console.groupEnd();

    // -------------------------------------------------------------
    // TESTE 4: Harness Virtual e Resposta de Comandos Abrangentes
    // -------------------------------------------------------------
    console.group(
      "%c[4/4] Validação de Capacidade de Execução de Todos os Comandos (Harness)",
      "color: #f59e0b; font-weight: bold;",
    );
    const test4Start = Date.now();
    const suiteTests = [
      {
        type: "shell.exec",
        cmd: "pwd && echo '__GRIOT_PIPELINE_OK__'",
        desc: "Shell Chaining & Echo",
      },
      {
        type: "fs.write",
        cmd: "write test.txt",
        desc: "Filesystem Engine",
        params: { path: "diagnostic-probe.txt", content: "GRIOT Diagnostics OK" },
      },
      { type: "git.status", cmd: "git status", desc: "Git Status & VCS" },
      { type: "node.eval", cmd: 'node -e "console.log(2 + 2)"', desc: "JavaScript Runtime Engine" },
      { type: "npm.test", cmd: "npm test", desc: "Test & Build Runner" },
    ];

    let passedCount = 0;
    const suiteOutputs: string[] = [];

    for (const st of suiteTests) {
      const singleRes = await executeLocalAction(
        {
          id: `diag-${Date.now()}-${Math.random()}`,
          category: "shell",
          type: st.type as any,
          params: st.params || { command: st.cmd, cmd: st.cmd },
          risk: "safe",
          requiresApproval: false,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        "diagnostic-ws",
      );

      const isOk = singleRes.status === "success" || singleRes.exitCode === 0;
      if (isOk) passedCount++;
      suiteOutputs.push(
        `[${st.desc}]: ${isOk ? "PASSOU (Exit 0)" : "FALHOU"} -> ${singleRes.stdout || singleRes.stderr || ""}`,
      );
      console.info(`Sub-teste [${st.desc}]:`, singleRes);
    }

    const elapsed4 = Date.now() - test4Start;
    const allPassed = passedCount === suiteTests.length;

    diagResults.push({
      id: "local_harness",
      name: "GRIOT Command Response Coverage (Harness)",
      category: "local_harness",
      status: allPassed ? "success" : "warning",
      durationMs: elapsed4,
      message: `${passedCount}/${suiteTests.length} comandos executados e respondidos com sucesso com dados concretos (stdout/stderr).`,
      details: suiteOutputs.join("\n"),
    });

    appendLog(
      `✓ Command Suite: ${passedCount}/${suiteTests.length} comandos responderam perfeitamente (${elapsed4}ms)`,
    );
    console.groupEnd();

    console.groupEnd(); // Global group end
    setResults(diagResults);
    setRunning(false);
  };

  const copyDiagnosticReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      activeProject: getActiveProjectSync()?.id || "none",
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        status: r.status,
        httpStatus: r.httpStatus,
        errorCode: r.errorCode,
        durationMs: r.durationMs,
        message: r.message,
      })),
      logs: consoleLogs,
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`p-4 rounded-xl border border-hairline bg-card/60 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <Activity className="size-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
              {t("Diagnóstico de Runtime & GRIOT Sandbox")}
            </h3>
            <p className="text-[12px] text-muted-foreground">
              {t(
                "Verificação de heartbeat, endpoints remotos e capacidade de resposta de comandos",
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {results.length > 0 && (
            <button
              onClick={copyDiagnosticReport}
              className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-hairline bg-secondary/40 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copied ? t("Copiado!") : t("Copiar Relatório")}</span>
            </button>
          )}

          <button
            onClick={runAllDiagnostics}
            disabled={running}
            className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} />
            <span>{running ? t("A verificar...") : t("Executar Diagnóstico")}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      {results.length > 0 && (
        <div className="flex items-center gap-2 border-b border-hairline pb-2">
          <button
            onClick={() => setActiveTab("summary")}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors ${
              activeTab === "summary"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Sumário de Componentes")} ({results.length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors ${
              activeTab === "logs"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Logs de Conexão")} ({consoleLogs.length})
          </button>
        </div>
      )}

      {/* Results view */}
      {activeTab === "summary" && results.length > 0 && (
        <div className="space-y-2.5">
          {results.map((r) => {
            const isSuccess = r.status === "success";
            const isWarning = r.status === "warning";
            const isFailed = r.status === "failed";

            return (
              <div
                key={r.id}
                className={`p-3 rounded-lg border text-[12px] space-y-1.5 transition-colors ${
                  isSuccess
                    ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                    : isWarning
                      ? "bg-amber-500/5 border-amber-500/20 text-foreground"
                      : "bg-rose-500/5 border-rose-500/20 text-foreground"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    {isSuccess ? (
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    ) : isWarning ? (
                      <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-rose-500 shrink-0" />
                    )}
                    <span className="truncate">{r.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground shrink-0">
                    {r.httpStatus && (
                      <span className="px-1.5 py-0.5 rounded bg-background/50 border border-hairline">
                        HTTP {r.httpStatus}
                      </span>
                    )}
                    {r.errorCode && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {r.errorCode}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Clock className="size-3" />
                      {r.durationMs}ms
                    </span>
                  </div>
                </div>

                <p className="text-muted-foreground text-[11.5px] leading-relaxed">{r.message}</p>

                {r.details && (
                  <pre className="p-2 rounded bg-background/70 border border-hairline text-[10.5px] font-mono text-foreground/80 overflow-x-auto max-h-24 whitespace-pre-wrap">
                    {typeof r.details === "object"
                      ? JSON.stringify(r.details, null, 2)
                      : String(r.details)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Logs View */}
      {activeTab === "logs" && (
        <div className="p-3 rounded-lg bg-background/90 border border-hairline font-mono text-[11px] text-foreground/85 max-h-48 overflow-y-auto space-y-1">
          {consoleLogs.length === 0 ? (
            <p className="text-muted-foreground">
              {t("Nenhum log gravado. Clica em 'Executar Diagnóstico'.")}
            </p>
          ) : (
            consoleLogs.map((log, i) => (
              <div key={i} className="leading-tight break-all">
                {log}
              </div>
            ))
          )}
        </div>
      )}

      {/* Initial state placeholder */}
      {results.length === 0 && !running && (
        <div className="text-center py-6 space-y-2">
          <p className="text-[12.5px] text-muted-foreground">
            {t(
              "Clica no botão acima para testar o heartbeat do Executor URL, sondar o GRIOT Sandbox e testar a capacidade de resposta a comandos.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
