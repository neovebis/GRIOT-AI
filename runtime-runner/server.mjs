import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = process.env.GRIOT_RUNTIME_SHARED_SECRET || "";
const WORKSPACE_ROOT = path.resolve(process.env.GRIOT_WORKSPACE_ROOT || "/workspace");
const MAX_BODY_BYTES = 256_000;
const MAX_STDOUT_BYTES = 1_000_000;
const REQUEST_SKEW_MS = 5 * 60_000;
const COMMAND_TIMEOUT_MS = 120_000;
const BLOCKED = [
  /rm\s+-rf\s+(\/|~)/i,
  /mkfs(?:\.|\s)/i,
  /(^|[;&|])\s*dd\s+if=/i,
  /git\s+push\s+--force/i,
  /git\s+reset\s+--hard/i,
  /chmod\s+-R\s+777\s+\//i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  />\s*\/dev\/sd[a-z]/i,
];

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/v1/actions/execute")
      return send(res, 404, { error: "Not found" });
    if (!SHARED_SECRET) return send(res, 503, { error: "Runner secret is not configured." });

    const raw = await readBody(req, MAX_BODY_BYTES);
    if (!verifySignature(req, raw)) return send(res, 401, { error: "Invalid runtime signature." });

    const input = JSON.parse(raw);
    const action = input?.action;
    if (!action?.id || !action?.type || !action?.params)
      return send(res, 400, { error: "Invalid action." });
    if (action.approved !== true && action.requiresApproval === true) {
      return send(res, 403, { error: "Sensitive action requires explicit approval." });
    }

    const workspaceId = sanitizeId(String(input.workspaceId || "default"));
    const workspace = path.join(WORKSPACE_ROOT, workspaceId);
    await fs.mkdir(workspace, { recursive: true });

    const result = await executeAction(action, workspace);
    return send(res, result.status === "success" ? 200 : 422, { result });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`GRIOT runtime runner listening on :${PORT}`));

function verifySignature(req, raw) {
  const timestamp = req.headers["x-griot-timestamp"];
  const signature = req.headers["x-griot-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string") return false;
  const time = Number(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > REQUEST_SKEW_MS) return false;
  const expected = crypto
    .createHmac("sha256", SHARED_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  const bufExpected = Buffer.from(expected);
  const bufSignature = Buffer.from(signature);
  if (bufExpected.length !== bufSignature.length) return false;
  return crypto.timingSafeEqual(bufExpected, bufSignature);
}

async function executeAction(action, workspace) {
  const started = Date.now();
  try {
    const p = action.params || {};
    if (action.risk === "dangerous")
      return result(
        action,
        started,
        "rejected",
        126,
        "",
        "Dangerous actions are blocked by the runner.",
      );

    switch (action.type) {
      case "fs.read_tree": {
        const files = await walk(workspace);
        return result(action, started, "success", 0, files.join("\n"), "", { files });
      }
      case "fs.read_file": {
        const file = safePath(workspace, String(p.path || ""));
        const content = await fs.readFile(file, "utf8");
        return result(action, started, "success", 0, content, "", {
          path: relative(workspace, file),
          content,
        });
      }
      case "fs.write_file": {
        const file = safePath(workspace, String(p.path || ""));
        await fs.mkdir(path.dirname(file), { recursive: true });
        const content = String(p.content || "");
        await fs.writeFile(file, content, "utf8");
        return result(
          action,
          started,
          "success",
          0,
          `Wrote ${content.split("\n").length} lines to ${relative(workspace, file)}.`,
          "",
          { path: relative(workspace, file) },
        );
      }
      case "fs.patch": {
        const file = safePath(workspace, String(p.path || ""));
        const before = await fs.readFile(file, "utf8");
        const search = String(p.search || "");
        const replacement = String(p.replace || "");
        if (!search)
          return result(action, started, "failed", 2, "", "Patch search cannot be empty.");
        if (!before.includes(search))
          return result(action, started, "failed", 1, "", "Patch target not found.");
        await fs.writeFile(file, before.replace(search, replacement), "utf8");
        return result(action, started, "success", 0, `Patched ${relative(workspace, file)}.`, "", {
          path: relative(workspace, file),
        });
      }
      case "fs.delete_file": {
        const file = safePath(workspace, String(p.path || ""));
        await fs.rm(file, { force: true });
        return result(action, started, "success", 0, `Deleted ${relative(workspace, file)}.`, "");
      }
      case "git.status":
      case "git.diff":
      case "git.checkout":
      case "git.commit":
      case "git.push":
      case "git.log":
      case "shell.exec":
      case "shell.install":
      case "shell.build":
      case "shell.status":
      case "test.run":
      case "test.verify":
      case "test.coverage": {
        const command = commandFor(action);
        if (BLOCKED.some((re) => re.test(command)))
          return result(action, started, "rejected", 126, "", "Command blocked by runtime policy.");
        return await runCommand(action, command, workspace, started);
      }
      default:
        return result(action, started, "failed", 2, "", `Unsupported action type: ${action.type}`);
    }
  } catch (error) {
    return result(
      action,
      started,
      "failed",
      1,
      "",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function commandFor(action) {
  const p = action.params || {};
  switch (action.type) {
    case "git.status":
      return "git status --short --branch";
    case "git.diff":
      return "git diff --";
    case "git.checkout":
      return `git checkout -- ${quoteArg(String(p.path || ""))}`;
    case "git.commit":
      return `git add --all && git commit -m ${quoteArg(String(p.message || "GRIOT update"))}`;
    case "git.push":
      return `git push origin ${quoteArg(String(p.branch || "main"))}`;
    case "git.log":
      return "git log -20 --oneline --decorate";
    case "shell.install":
      return `npm install ${String(p.package || "").trim()}`.trim();
    case "shell.build":
      return String(p.command || "npm run build");
    case "shell.status":
      return String(p.command || "git status --short --branch");
    case "test.run":
    case "test.verify":
    case "test.coverage":
      return String(p.command || "npm test");
    case "shell.exec":
      return String(p.command || "true");
    default:
      return "true";
  }
}

function runCommand(action, command, cwd, started) {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd,
      env: safeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const collect = (current, chunk) => (current + chunk.toString()).slice(-MAX_STDOUT_BYTES);
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, COMMAND_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve(
        result(
          action,
          started,
          code === 0 ? "success" : "failed",
          code ?? 1,
          stdout,
          signal ? `${stderr}\nSignal: ${signal}` : stderr,
        ),
      );
    });
  });
}

function result(action, started, status, exitCode, stdout, stderr, data) {
  return {
    actionId: action.id,
    actionType: action.type,
    status,
    exitCode,
    stdout,
    stderr,
    durationMs: Math.max(0, Date.now() - started),
    ...(data ? { data } : {}),
    timestamp: new Date().toISOString(),
  };
}

async function walk(root) {
  const out = [];
  async function visit(dir, prefix = "") {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const rel = path.posix.join(prefix, entry.name);
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full, rel);
      else out.push(rel);
    }
  }
  await visit(root);
  return out.sort().slice(0, 20_000);
}

function safePath(root, candidate) {
  const normalized = candidate.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.startsWith("~") ||
    normalized.includes("..")
  )
    throw new Error("Path escapes workspace.");
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new Error("Path escapes workspace.");
  return resolved;
}

function relative(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
function sanitizeId(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "default";
}
function quoteArg(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function safeEnv() {
  return {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME || "/tmp",
    CI: "1",
    NODE_ENV: "production",
  };
}
async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Payload too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}
