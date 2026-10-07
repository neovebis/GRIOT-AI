import { supabase } from "@/integrations/supabase/client";
import { GRIOT_SUPABASE_ANON_KEY, GRIOT_SUPABASE_URL, getPrimaryWorkspaceId } from "@/lib/griot-api";
import {
  executeStrictNativeCommand,
  getNativeSystemInfo,
  getRuntimeMode,
  isNativeAndroidPlatform,
} from "@/lib/runtime/native-terminal-bridge";

type NativeJob = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  run_id: string;
};

export type NativeStudioWorkerState =
  | "inactive"
  | "attaching"
  | "ready"
  | "working"
  | "unavailable"
  | "error";

export type NativeStudioWorkerStatus = {
  state: NativeStudioWorkerState;
  detail?: string;
  lastExecutionId?: string | null;
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function safeRelativePath(value: unknown): string {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!raw || raw.startsWith("/") || raw.includes("\0")) throw new Error("Native workspace path is invalid");
  const parts = raw.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) throw new Error("Native workspace path escapes project scope");
  return parts.join("/");
}

function commandFromArgv(program: unknown, args: unknown): string {
  const p = String(program || "").trim();
  if (!p || p.length > 1000 || /[\r\n\0]/.test(p)) throw new Error("Native command program is invalid");
  const list = Array.isArray(args) ? args.map(String) : [];
  if (list.length > 500 || list.some((x) => x.length > 20000 || x.includes("\0"))) {
    throw new Error("Native command arguments are invalid");
  }
  return [p, ...list].map(shellQuote).join(" ");
}

function requiresApproval(program: string, args: string[]) {
  const p = program.toLowerCase();
  const dangerous = new Set(["rm", "dd", "mkfs", "reboot", "shutdown", "poweroff", "su", "sudo"]);
  if (dangerous.has(p)) return true;
  if (["curl", "wget", "ssh", "scp", "rsync"].includes(p)) return true;
  if (p === "git" && args.some((x) => ["push", "reset", "clean"].includes(x.toLowerCase()))) return true;
  if ((p === "npm" || p === "pnpm" || p === "yarn" || p === "pip" || p === "pip3") &&
      args.some((x) => ["install", "add", "publish"].includes(x.toLowerCase()))) return true;
  return false;
}

async function sessionHeaders(userId: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Native Studio worker requires an authenticated GRIOT session");
  const workspaceId = await getPrimaryWorkspaceId(userId);
  if (!workspaceId) throw new Error("Native Studio worker could not resolve a workspace");
  return {
    Authorization: `Bearer ${token}`,
    apikey: GRIOT_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    "x-griot-workspace-id": workspaceId,
  };
}

async function api(userId: string, path: string, body: unknown) {
  const response = await fetch(`${GRIOT_SUPABASE_URL}/functions/v1/griot-studio-compute${path}`, {
    method: "POST",
    headers: await sessionHeaders(userId),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(String(payload?.error || `Studio Compute HTTP ${response.status}`));
  return payload;
}

async function gitEvidence(workspacePath: string) {
  const commit = await executeStrictNativeCommand(
    `git -C ${shellQuote(workspacePath)} rev-parse HEAD`,
    { timeoutMs: 15000 },
  );
  const tree = await executeStrictNativeCommand(
    `git -C ${shellQuote(workspacePath)} rev-parse 'HEAD^{tree}'`,
    { timeoutMs: 15000 },
  );
  const commitSha = commit.stdout.trim().toLowerCase();
  const treeSha = tree.stdout.trim().toLowerCase();
  if (commit.exitCode !== 0 || tree.exitCode !== 0 || !/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{40}$/.test(treeSha)) {
    throw new Error("Native workspace is not a real git checkout with commit/tree evidence");
  }
  return { sourceCommitSha: commitSha, sourceTreeSha: treeSha };
}

async function executeJob(job: NativeJob, workspacePath: string) {
  const input = job.input || {};
  const tool = job.tool;

  if (tool === "workspace.list") {
    const r = await executeStrictNativeCommand("find . -type f -not -path './.git/*' -print | sort | head -5000", { cwd: workspacePath, timeoutMs: 30000 });
    return { state: r.exitCode === 0 ? "completed" : "failed", exitCode: r.exitCode, result: { files: r.stdout.split(/\r?\n/).filter(Boolean), stderr: r.stderr } };
  }
  if (tool === "workspace.read") {
    const path = safeRelativePath(input.path);
    const r = await executeStrictNativeCommand(`cat -- ${shellQuote(path)}`, { cwd: workspacePath, timeoutMs: 30000 });
    return { state: r.exitCode === 0 ? "completed" : "failed", exitCode: r.exitCode, result: { path, content: r.stdout, stderr: r.stderr } };
  }
  if (tool === "workspace.write") {
    const files = Array.isArray(input.files)
      ? input.files
      : [{ path: input.path, content: input.content }];
    const written: string[] = [];
    for (const raw of files) {
      if (!raw || typeof raw !== "object") throw new Error("Invalid native file write");
      const path = safeRelativePath((raw as any).path);
      const content = String((raw as any).content ?? "");
      const b64 = btoa(unescape(encodeURIComponent(content)));
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
      const cmd = `mkdir -p -- ${shellQuote(dir)} && printf %s ${shellQuote(b64)} | base64 -d > ${shellQuote(path)}`;
      const r = await executeStrictNativeCommand(cmd, { cwd: workspacePath, timeoutMs: 60000 });
      if (r.exitCode !== 0) return { state: "failed", exitCode: r.exitCode, result: { path, stderr: r.stderr } };
      written.push(path);
    }
    return { state: "completed", exitCode: 0, result: { written } };
  }
  if (tool === "workspace.delete") {
    const path = safeRelativePath(input.path);
    const r = await executeStrictNativeCommand(`rm -rf -- ${shellQuote(path)}`, { cwd: workspacePath, timeoutMs: 60000 });
    return { state: r.exitCode === 0 ? "completed" : "failed", exitCode: r.exitCode, result: { path, stderr: r.stderr } };
  }
  if (tool === "workspace.rename") {
    const from = safeRelativePath(input.from);
    const to = safeRelativePath(input.to);
    const dir = to.includes("/") ? to.slice(0, to.lastIndexOf("/")) : ".";
    const r = await executeStrictNativeCommand(
      `mkdir -p -- ${shellQuote(dir)} && mv -- ${shellQuote(from)} ${shellQuote(to)}`,
      { cwd: workspacePath, timeoutMs: 60000 },
    );
    return { state: r.exitCode === 0 ? "completed" : "failed", exitCode: r.exitCode, result: { from, to, stderr: r.stderr } };
  }
  if (tool === "archive.extract") {
    // Native archive extraction stays unavailable until the same traversal/link/size guards
    // used by the cloud gateway are implemented locally. Never downgrade safety silently.
    return { state: "failed", exitCode: 2, result: { error: "archive.extract is not yet safety-equivalent on Native runtime" } };
  }
  if (tool === "command.execute" || tool === "test.run" || tool === "build.run") {
    const program = String(input.program || "").trim();
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    if (tool === "command.execute" && requiresApproval(program, args)) {
      return {
        state: "approval_required",
        approvalRequired: true,
        exitCode: null,
        result: { program, args, reason: "Native policy requires explicit approval for this command" },
      };
    }
    const command = commandFromArgv(program, args);
    const timeoutMs = Math.max(1000, Math.min(24 * 60 * 60_000, Number(input.hardTimeoutMs) || 180000));
    const r = await executeStrictNativeCommand(command, { cwd: workspacePath, timeoutMs });
    return {
      state: r.exitCode === 0 ? "completed" : "failed",
      exitCode: r.exitCode,
      result: { stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs, program, args },
    };
  }
  return { state: "failed", exitCode: 2, result: { error: `Unsupported native tool: ${tool}` } };
}

export function startNativeStudioWorker(input: {
  userId: string;
  projectId: string;
  onStatus?: (status: NativeStudioWorkerStatus) => void;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const emit = (state: NativeStudioWorkerState, detail?: string, lastExecutionId?: string | null) =>
    input.onStatus?.({ state, detail, lastExecutionId });

  const loop = async () => {
    if (stopped) return;
    try {
      if (!isNativeAndroidPlatform() || getRuntimeMode() !== "native") {
        emit("inactive", "Native runtime is not selected");
        timer = setTimeout(loop, 2500);
        return;
      }
      emit("attaching", "Attaching Android workspace to Studio Compute");
      const info = await getNativeSystemInfo();
      const evidence = await gitEvidence(info.workspacePath);
      await api(input.userId, `/projects/${input.projectId}/native/attach`, evidence);
      emit("ready", "Native Studio Compute worker is ready");

      while (!stopped && isNativeAndroidPlatform() && getRuntimeMode() === "native") {
        const next = await api(input.userId, `/projects/${input.projectId}/native/jobs/next`, {});
        const job = next?.job as NativeJob | null;
        if (!job) {
          await new Promise((resolve) => setTimeout(resolve, 850));
          continue;
        }
        emit("working", `Executing ${job.tool}`, job.id);
        let receipt: any;
        try {
          receipt = await executeJob(job, info.workspacePath);
        } catch (error) {
          receipt = {
            state: "failed",
            exitCode: 1,
            result: { error: error instanceof Error ? error.message : String(error) },
          };
        }
        await api(input.userId, `/projects/${input.projectId}/native/jobs/${job.id}/complete`, receipt);
        emit("ready", `${job.tool}: ${receipt.state}`, job.id);
      }
    } catch (error) {
      emit("unavailable", error instanceof Error ? error.message : String(error));
      timer = setTimeout(loop, 3000);
    }
  };

  void loop();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
