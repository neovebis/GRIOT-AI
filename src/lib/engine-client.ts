import { supabase } from "@/integrations/supabase/client";
import { GRIOT_SUPABASE_ANON_KEY, GRIOT_SUPABASE_URL, getPrimaryWorkspaceId } from "@/lib/griot-api";
import { findApiByIdOrProvider } from "@/lib/user-apis";

export type GriotEngineId = "orchestrator" | "sheol";
export type VerificationState =
  | "working"
  | "waiting_for_approval"
  | "verification_required"
  | "verification_passed"
  | "verification_failed"
  | "unverified";

export type OrchestratorToolReceipt = {
  step?: number;
  tool?: string;
  status?: number;
  ok?: boolean;
  approvalRequired?: boolean;
  executionId?: string | null;
  executionState?: string | null;
  exitCode?: number | null;
  resultSha256?: string;
};

export type OrchestratorEngineResult = {
  text: string;
  conversationId: string | null;
  requestId: string | null;
  verificationState: VerificationState;
  verification: Record<string, unknown>;
  toolTrace: OrchestratorToolReceipt[];
  raw: any;
};

export type SheolGateStatus = "PASS" | "FAIL" | "UNCERTAIN";
export type SheolManagedRequest = {
  projectId: string;
  mission: {
    missionId: string;
    objective: string;
    hardInvariants?: string[];
    scope?: string[];
    forbiddenScope?: string[];
    globalConstraints?: string[];
    architecturalPrinciples?: string[];
    acceptanceCriteria?: string[];
  };
  plan: {
    version: number;
    phases: Array<{
      id: string;
      title: string;
      objective?: string;
      dependencies?: string[];
      requiredOutputs?: string[];
      allowedPaths?: string[];
      forbiddenPaths?: string[];
      allowedTools?: string[];
      acceptanceCriteria?: string[];
    }>;
  };
  phaseExecutions: Array<{
    phaseId: string;
    modelId?: string;
    actions?: Array<{ tool: string; input?: Record<string, unknown> }>;
    verifiers: Array<{ id?: string; tool: "test.run" | "build.run"; input?: Record<string, unknown> }>;
    artifacts?: Array<{ id?: string; path: string; content?: string }>;
  }>;
  maxPhases?: number;
};

export type SheolManagedResult = {
  ok: boolean;
  missionId: string;
  projectId: string;
  state: string;
  activePhaseId: string | null;
  phaseStates: Record<string, string>;
  phaseReceipts: Array<{
    phaseId: string;
    status: SheolGateStatus;
    attempts: number;
    hasMutation: boolean;
    receipts: Array<{
      tool: string;
      ok: boolean;
      approvalRequired: boolean;
      status: number;
      state: string | null;
      exitCode: number | null;
      executionId: string | null;
      resultSha256: string;
    }>;
    gates: Array<{
      gateId: string;
      status: SheolGateStatus;
      reasons: string[];
      evidence: string[];
    }>;
  }>;
  raw: any;
};

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authHeaders(userId: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão GRIOT expirada. Inicia sessão novamente.");
  const workspaceId = await getPrimaryWorkspaceId(userId);
  if (!workspaceId) throw new Error("Nenhum workspace GRIOT autorizado foi encontrado.");
  return {
    token,
    workspaceId,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: GRIOT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-griot-workspace-id": workspaceId,
    },
  };
}

export function resolveOrchestratorSelection(modelId: string) {
  const saved = findApiByIdOrProvider(modelId);
  if (!saved) throw new Error("A API selecionada não está configurada.");
  const providerRaw = String(saved.providerId || "").toLowerCase();
  const provider = providerRaw === "claude" ? "anthropic" : providerRaw;
  const supported = new Set(["gemini", "openai", "anthropic", "groq", "openrouter"]);
  if (!supported.has(provider)) {
    throw new Error(
      `O Orchestrator v6 ainda não tem adapter auditado para ${saved.providerId}. Não vou fazer fallback silencioso para Gemini.`,
    );
  }
  if (!saved.remoteId || !isUuid(saved.remoteId)) {
    throw new Error(
      `A credencial ${saved.label} ainda não está sincronizada/validada no backend. Volta a ligar a API para criar uma credencial server-side segura.`,
    );
  }
  const model = String(saved.model || "").trim();
  if (!model) {
    throw new Error(
      `A credencial ${saved.label} não tem um modelo server-side configurado. Define o modelo da API antes de usar o Orchestrator.`,
    );
  }
  return { provider, model, credentialId: saved.remoteId, label: saved.label };
}

export async function runOrchestratorEngine(input: {
  userId: string;
  conversationId?: string | null;
  projectId?: string | null;
  modelId: string;
  prompt: string;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<OrchestratorEngineResult> {
  const { headers } = await authHeaders(input.userId);
  const selection = resolveOrchestratorSelection(input.modelId);
  const maxAgentSteps = input.effort === "high" ? 8 : input.effort === "low" ? 3 : 6;
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch(`${GRIOT_SUPABASE_URL}/functions/v1/griot-orchestrator/ask`, {
    method: "POST",
    headers: { ...headers, "x-griot-idempotency-key": idempotencyKey },
    body: JSON.stringify({
      prompt: input.prompt,
      provider: selection.provider,
      model: selection.model,
      credentialId: selection.credentialId,
      ...(isUuid(input.conversationId) ? { conversationId: input.conversationId } : {}),
      ...(isUuid(input.projectId) ? { projectId: input.projectId } : {}),
      engine: "provider",
      maxAgentSteps,
    }),
    signal: input.signal,
  });

  const rawText = await response.text();
  let payload: any = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Orchestrator devolveu payload inválido (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(String(payload?.error || payload?.message || `Orchestrator HTTP ${response.status}`));
  }

  const verification = payload?.context?.verification || payload?.message?.metadata?.verification || {};
  const toolTrace = (payload?.context?.studioToolTrace || payload?.message?.metadata?.studioToolTrace || []) as OrchestratorToolReceipt[];
  const hasApproval = toolTrace.some((x) => x?.approvalRequired === true);
  const failedVerification = toolTrace.some(
    (x) => (x?.tool === "test.run" || x?.tool === "build.run") && x?.ok === false && !x?.approvalRequired,
  );
  let verificationState: VerificationState = "unverified";
  if (hasApproval) verificationState = "waiting_for_approval";
  else if (verification?.pending === true) verificationState = "verification_required";
  else if (failedVerification) verificationState = "verification_failed";
  else if (verification?.passed === true) verificationState = "verification_passed";
  else if (toolTrace.length) verificationState = "working";

  return {
    text: String(payload?.result?.content || payload?.message?.content || "").trim(),
    conversationId: isUuid(payload?.conversationId) ? payload.conversationId : null,
    requestId: isUuid(payload?.requestId) ? payload.requestId : null,
    verificationState,
    verification,
    toolTrace,
    raw: payload,
  };
}

export async function runSheolEngine(
  userId: string,
  request: SheolManagedRequest,
  signal?: AbortSignal,
): Promise<SheolManagedResult> {
  const { headers } = await authHeaders(userId);
  const response = await fetch(`${GRIOT_SUPABASE_URL}/functions/v1/griot-sheol`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal,
  });
  const rawText = await response.text();
  let payload: any = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`SHEOL devolveu payload inválido (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(String(payload?.error || `SHEOL HTTP ${response.status}`));
  if (payload?.clientSuppliedGatesAccepted !== false) {
    throw new Error("SHEOL respondeu sem confirmar autoridade server-side dos gates.");
  }
  return {
    ok: payload?.ok === true,
    missionId: String(payload?.missionId || request.mission.missionId),
    projectId: String(payload?.projectId || request.projectId),
    state: String(payload?.state || "UNKNOWN"),
    activePhaseId: payload?.activePhaseId ? String(payload.activePhaseId) : null,
    phaseStates: payload?.phaseStates && typeof payload.phaseStates === "object" ? payload.phaseStates : {},
    phaseReceipts: Array.isArray(payload?.phaseReceipts) ? payload.phaseReceipts : [],
    raw: payload,
  };
}
