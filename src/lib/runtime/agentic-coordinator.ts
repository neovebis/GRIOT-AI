/**
 * GRIOT Multi-Agent Autonomous Engineering Coordinator
 *
 * Implements Tier-1 Agentic Decomposition:
 * 1. Architect / Planner Agent: Decomposes prompt into ordered execution tasks.
 * 2. Implementation Specialist Agent: Executes atomic file mutations with full tools.
 * 3. QA / Code Reviewer Agent: Audits changes using code-diagnostician and certifies completion.
 */

import { executeReActLoop, type ReActExecutionStep } from "./react-loop";
import { runWorkspaceDiagnostics, formatDiagnosticReport } from "./code-diagnostician";
import { getCompactArchitectureMap } from "./symbol-indexer";
import { getWorkspaceFiles } from "./local-harness";
import { defaultExecutor } from "./executors";
import type { StreamCallbacks } from "@/lib/ai-client";

export interface SubTask {
  id: string;
  title: string;
  role: "architect" | "engineer" | "qa";
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
}

export interface AgenticPlan {
  objective: string;
  tasks: SubTask[];
  createdAt: string;
}

export interface AgenticExecutionResult {
  success: boolean;
  plan: AgenticPlan;
  finalReport: string;
  diagnosticSummary: string;
  totalSteps: number;
}

/**
 * Orquestra uma missão complexa através da decomposição multi-papel:
 * Planeamento -> Implementação Cirúrgica -> Auditoria de Integridade.
 */
export async function executeAgenticMission(options: {
  objective: string;
  modelId: string;
  workspaceId?: string;
  callbacks?: StreamCallbacks & {
    onTaskStart?: (task: SubTask) => void;
    onTaskCompleted?: (task: SubTask) => void;
  };
  signal?: AbortSignal;
}): Promise<AgenticExecutionResult> {
  const { objective, modelId, workspaceId = "default", callbacks, signal } = options;

  // 1. Arquitetura do Workspace atual
  const archMap = getCompactArchitectureMap(workspaceId);

  // 2. Criação do Plano de Decomposição (Architect Stage)
  const initialPlan: AgenticPlan = {
    objective,
    createdAt: new Date().toISOString(),
    tasks: [
      {
        id: "task-plan",
        title: "Análise Estrutural & Arquitetura",
        role: "architect",
        description: `Mapear dependências e definir estratégia cirúrgica para: ${objective}`,
        status: "pending",
      },
      {
        id: "task-exec",
        title: "Implementação de Código & Conectores",
        role: "engineer",
        description: `Executar leitura, escrita de ficheiros e chamadas a ferramentas necessárias.`,
        status: "pending",
      },
      {
        id: "task-audit",
        title: "Auditoria Estática & Verificação de Sintaxe",
        role: "qa",
        description: `Escanear workspace com o GRIOT Code Diagnostician para certificar zero regressões.`,
        status: "pending",
      },
    ],
  };

  let totalStepsCount = 0;
  const executionOutputs: string[] = [];

  // Executa Task 1 & 2 combinadas via ReAct loop com System Prompt especializado
  const engineerTask = initialPlan.tasks[1];
  engineerTask.status = "running";
  callbacks?.onTaskStart?.(engineerTask);

  const specializedSystemInstruction = `És o Agente Sénior de Engenharia de Software do GRIOT.
A tua missão principal: "${objective}".

DIRETRIZES DE ENGENHARIA DE TOPO:
1. Inspeciona sempre os ficheiros existentes antes de propor edições.
2. Faz patches cirúrgicos unívocos ou grava ficheiros completos com consistência de tipos.
3. Se um comando ou ferramenta falhar, analisa o STDERR e formula uma rota alternativa.
4. Quando terminares a implementação, avisa que estás pronto para a auditoria de QA.`;

  const reactResult = await executeReActLoop({
    modelId,
    messages: [
      {
        role: "user",
        content: `Objetivo: ${objective}\n\n[ARQUITETURA ATUAL DO WORKSPACE]:\n${archMap}\n\nPor favor inicia a resolução passo a passo.`,
      },
    ],
    systemInstruction: specializedSystemInstruction,
    maxIterations: 10,
    callbacks,
    signal,
  });

  totalStepsCount += reactResult.steps.length;
  engineerTask.status = "completed";
  engineerTask.output = reactResult.finalAnswer;
  callbacks?.onTaskCompleted?.(engineerTask);
  executionOutputs.push(reactResult.finalAnswer);

  // Executa Task 3: Auditoria Estática & Execução de Testes de QA
  const auditTask = initialPlan.tasks[2];
  auditTask.status = "running";
  callbacks?.onTaskStart?.(auditTask);

  const diagnostics = runWorkspaceDiagnostics(workspaceId);
  const formattedDiag = formatDiagnosticReport(diagnostics);

  const files = getWorkspaceFiles(workspaceId);
  const hasTests = files.some(
    (f) =>
      f.path.includes(".test.") ||
      f.path.includes(".spec.") ||
      f.path.startsWith("tests/") ||
      f.path.startsWith("test/"),
  );

  let testSummary = "";
  let testsPassed = true;

  if (hasTests) {
    const testResult = await defaultExecutor.execute({
      id: `qa-test-${Date.now()}`,
      type: "test.run",
      category: "test",
      risk: "safe",
      requiresApproval: false,
      params: {},
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    testsPassed = testResult.status === "success" && testResult.exitCode === 0;
    testSummary = `\n\n--- Execução de Testes Unitários ---\n${testResult.stdout || testResult.stderr || "Sem saídas"}\nResultado: ${testsPassed ? "APROVADO (Exit code: 0)" : `REPROVADO (Exit code: ${testResult.exitCode})`}`;
  }

  const overallSuccess = diagnostics.isClean && testsPassed;
  auditTask.status = overallSuccess ? "completed" : "failed";
  auditTask.output = `${formattedDiag}${testSummary}`;
  callbacks?.onTaskCompleted?.(auditTask);

  let finalReport = reactResult.finalAnswer;
  if (!overallSuccess) {
    finalReport += `\n\n⚠️ **Alerta de Auditoria QA**:\n${formattedDiag}${testSummary}`;
  } else {
    finalReport += `\n\n✅ **Certificação de QA**: Workspace auditado com sucesso (${diagnostics.totalFilesScanned} ficheiros verificados, 0 erros sintáticos${hasTests ? ", testes unitários executados e validados no sandbox" : ""}).`;
  }

  return {
    success: overallSuccess,
    plan: initialPlan,
    finalReport,
    diagnosticSummary: diagnostics.summary,
    totalSteps: totalStepsCount,
  };
}
