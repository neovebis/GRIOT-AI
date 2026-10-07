import { useMemo, useState } from "react";
import { ShieldCheck, Loader2, Play, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { runSheolEngine, type SheolManagedResult } from "@/lib/engine-client";

type Props = {
  userId: string;
  projectId: string | null;
  initialObjective?: string;
  onResult?: (result: SheolManagedResult) => void;
};

function lines(value: string) {
  return value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function parseObject(value: string, label: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} deve ser um objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

export function SheolMissionPanel({ userId, projectId, initialObjective = "", onResult }: Props) {
  const [objective, setObjective] = useState(initialObjective);
  const [hardInvariants, setHardInvariants] = useState("Não inventar sucesso\nNão sair do scope definido");
  const [scope, setScope] = useState("Projeto ativo");
  const [forbiddenScope, setForbiddenScope] = useState("");
  const [actionTool, setActionTool] = useState("workspace.read");
  const [actionInput, setActionInput] = useState('{"path":"package.json"}');
  const [verifierTool, setVerifierTool] = useState<"test.run" | "build.run">("test.run");
  const [verifierInput, setVerifierInput] = useState('{"program":"npm","args":["test","--","--runInBand"]}');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SheolManagedResult | null>(null);

  const finalGate = useMemo(() => {
    const receipts = result?.phaseReceipts || [];
    return receipts.length ? receipts[receipts.length - 1]?.status : null;
  }, [result]);

  async function run() {
    setError("");
    if (!projectId) {
      setError("SHEOL exige um projeto ativo ligado a um runtime real.");
      return;
    }
    const missionObjective = objective.trim();
    if (!missionObjective) {
      setError("Define a missão antes de iniciar o SHEOL.");
      return;
    }

    setRunning(true);
    try {
      const phaseId = crypto.randomUUID();
      const missionId = crypto.randomUUID();
      const action = {
        tool: actionTool,
        input: parseObject(actionInput, "Action input"),
      };
      const verifier = {
        id: crypto.randomUUID(),
        tool: verifierTool,
        input: parseObject(verifierInput, "Verifier input"),
      };
      const allowedPaths =
        actionTool.startsWith("workspace.") && typeof action.input.path === "string"
          ? [String(action.input.path)]
          : [];

      const next = await runSheolEngine(userId, {
        projectId,
        mission: {
          missionId,
          objective: missionObjective,
          hardInvariants: lines(hardInvariants),
          scope: lines(scope),
          forbiddenScope: lines(forbiddenScope),
          acceptanceCriteria: ["A ação deve produzir receipt real", "O verifier deve produzir receipt real com sucesso"],
        },
        plan: {
          version: 1,
          phases: [
            {
              id: phaseId,
              title: "Executar e verificar missão",
              objective: missionObjective,
              dependencies: [],
              requiredOutputs: ["execution receipt", "verification gate"],
              allowedPaths,
              forbiddenPaths: [],
              allowedTools: Array.from(new Set([actionTool, verifierTool])),
              acceptanceCriteria: ["Verifier test.run/build.run deve passar com evidência real"],
            },
          ],
        },
        phaseExecutions: [
          {
            phaseId,
            modelId: "sheol-managed-worker",
            actions: [action],
            verifiers: [verifier],
          },
        ],
        maxPhases: 1,
      });
      setResult(next);
      onResult?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-[22px] border border-hairline bg-surface/90 p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-secondary">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold">SHEOL Mission Engine</p>
          <p className="text-[11px] text-muted-foreground">Constitution → phase → receipts → gate</p>
        </div>
        {finalGate ? (
          <span className="ml-auto rounded-full bg-secondary px-2 py-1 text-[10.5px] font-semibold">
            {finalGate}
          </span>
        ) : null}
      </div>

      <label className="mt-3 block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Mission</label>
      <textarea
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        rows={3}
        placeholder="Objetivo rígido da missão..."
        className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 text-[12.5px] outline-none"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground">Action</label>
          <select value={actionTool} onChange={(e) => setActionTool(e.target.value)} className="mt-1 w-full rounded-xl border border-hairline bg-background px-2 py-2 text-[11.5px]">
            <option value="workspace.read">workspace.read</option>
            <option value="workspace.write">workspace.write</option>
            <option value="workspace.delete">workspace.delete</option>
            <option value="workspace.rename">workspace.rename</option>
            <option value="command.execute">command.execute</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground">Verifier</label>
          <select value={verifierTool} onChange={(e) => setVerifierTool(e.target.value as "test.run" | "build.run")} className="mt-1 w-full rounded-xl border border-hairline bg-background px-2 py-2 text-[11.5px]">
            <option value="test.run">test.run</option>
            <option value="build.run">build.run</option>
          </select>
        </div>
      </div>

      <label className="mt-2 block text-[10px] text-muted-foreground">Action input JSON</label>
      <textarea value={actionInput} onChange={(e) => setActionInput(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 font-mono text-[10.5px] outline-none" />
      <label className="mt-2 block text-[10px] text-muted-foreground">Verifier input JSON</label>
      <textarea value={verifierInput} onChange={(e) => setVerifierInput(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 font-mono text-[10.5px] outline-none" />

      <details className="mt-2">
        <summary className="cursor-pointer text-[10.5px] text-muted-foreground">Constitution / scope</summary>
        <label className="mt-2 block text-[10px] text-muted-foreground">Hard invariants (1 por linha)</label>
        <textarea value={hardInvariants} onChange={(e) => setHardInvariants(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 text-[11px] outline-none" />
        <label className="mt-2 block text-[10px] text-muted-foreground">Scope (1 por linha)</label>
        <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 text-[11px] outline-none" />
        <label className="mt-2 block text-[10px] text-muted-foreground">Forbidden scope</label>
        <textarea value={forbiddenScope} onChange={(e) => setForbiddenScope(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-hairline bg-background px-3 py-2 text-[11px] outline-none" />
      </details>

      {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}

      {result ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px]">
            {finalGate === "PASS" ? <CheckCircle2 className="size-4" /> : finalGate === "FAIL" ? <XCircle className="size-4" /> : <AlertTriangle className="size-4" />}
            <span>State: <b>{result.state}</b></span>
            <span>Gate: <b>{finalGate || "—"}</b></span>
          </div>
          {result.phaseReceipts.flatMap((phase) => phase.receipts.map((r, i) => (
            <div key={`${phase.phaseId}-${i}`} className="rounded-xl bg-secondary/60 px-3 py-2 font-mono text-[10px]">
              {r.tool} · HTTP {r.status} · state={r.state || "none"} · exit={String(r.exitCode)} · approval={String(r.approvalRequired)}<br />
              executionId={r.executionId || "none"}<br />
              sha256={r.resultSha256}
            </div>
          )))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void run()}
        disabled={running || !projectId}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {running ? "SHEOL em execução..." : "Iniciar missão"}
      </button>
    </div>
  );
}
