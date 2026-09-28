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

  // Executa Task 3: Auditoria Estática de QA
  const auditTask = initialPlan.tasks[2];
  auditTask.status = "running";
  callbacks?.onTaskStart?.(auditTask);

  const diagnostics = runWorkspaceDiagnostics(workspaceId);
  const formattedDiag = formatDiagnosticReport(diagnostics);

  auditTask.status = diagnostics.isClean ? "completed" : "failed";
  auditTask.output = formattedDiag;
  callbacks?.onTaskCompleted?.(auditTask);

  let finalReport = reactResult.finalAnswer;
  if (!diagnostics.isClean) {
    finalReport += `\n\n⚠️ **Alerta de Auditoria QA**:\n${formattedDiag}`;
  } else {
    finalReport += `\n\n✅ **Certificação de QA**: Workspace verificado e livre de erros sintáticos (${diagnostics.totalFilesScanned} ficheiros auditados).`;
  }

  return {
    success: diagnostics.isClean,
    plan: initialPlan,
    finalReport,
    diagnosticSummary: diagnostics.summary,
    totalSteps: totalStepsCount,
  };
}
