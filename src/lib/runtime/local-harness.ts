/**
 * GRIOT Local Workspace Execution Harness
 *
 * Provides real filesystem operations (read, write, tree, patch, delete)
 * directly on device storage without crashing or requiring heavy local Node.js.
 * For heavy terminal commands (npm install, node, build, test), coordinates
 * with Google Cloud Shell / GCP Runner and requests connection when needed.
 */

import type { GriotAction, GriotExecutionResult } from "./protocol";
import { executeInGriotSandbox } from "./sandbox-executor";
import { getUnifiedProjects } from "@/lib/project-service";
import { safeFetch } from "@/lib/connector-http";
import { isPluginConnected } from "@/lib/plugins-service";
import { applyUnifiedDiff, applySearchReplace, validateSyntaxBalance } from "./semantic-patcher";
import { runWorkspaceDiagnostics, formatDiagnosticReport } from "./code-diagnostician";
import {
  createWorkspaceSnapshot,
  rollbackToSnapshot,
  getWorkspaceSnapshots,
} from "./workspace-snapshots";
import { recallOpbMemory } from "@/lib/opb-memory";
import { findSymbol, getWorkspaceSymbolIndex, getCompactArchitectureMap } from "./symbol-indexer";

export interface WorkspaceFile {
  path: string;
  content: string;
  updatedAt: string;
  size: number;
}

export interface WorkspaceCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  files: string[];
}

const STORAGE_PREFIX = "griot_ws_";
const memoryStorageCache = new Map<string, string>();
const IDB_NAME = "griot_workspace_db";
const IDB_STORE = "workspace_store";

/** Abertura resiliente de IndexedDB para ultrapassar o limite de 5MB do localStorage */
function openWorkspaceDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function persistToIndexedDB(key: string, value: string): void {
  openWorkspaceDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
    } catch (e) {
      console.warn("[GRIOT Harness] Erro ao persistir em IndexedDB:", e);
    }
  });
}

// Hidratação assíncrona inicial de IndexedDB para a cache em memória
if (typeof window !== "undefined" && window.indexedDB) {
  openWorkspaceDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          if (!memoryStorageCache.has(cursor.key as string)) {
            memoryStorageCache.set(cursor.key as string, cursor.value as string);
          }
          cursor.continue();
        }
      };
    } catch {}
  });
}

function safeSetItem(key: string, value: string): void {
  memoryStorageCache.set(key, value);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota do localStorage ultrapassada; IndexedDB trata do armazenamento de alta capacidade
  }
  persistToIndexedDB(key, value);
}

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return memoryStorageCache.get(key) ?? localStorage.getItem(key);
}

function getStorageKey(workspaceId: string): string {
  const cleanId = (workspaceId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_PREFIX}${cleanId}_files`;
}

function getCommitStorageKey(workspaceId: string): string {
  const cleanId = (workspaceId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_PREFIX}${cleanId}_commits`;
}

/** Guarda um novo commit no histórico local do workspace */
export function saveWorkspaceCommit(commit: WorkspaceCommit, workspaceId = "default"): void {
  try {
    const raw = safeGetItem(getCommitStorageKey(workspaceId)) || "[]";
    const commits: WorkspaceCommit[] = JSON.parse(raw);
    commits.unshift(commit);
    safeSetItem(getCommitStorageKey(workspaceId), JSON.stringify(commits.slice(0, 50)));
  } catch {
    // Falha ao persistir commit; ignorado silenciosamente
  }
}

/** Obtém o histórico de commits do workspace local */
export function getWorkspaceCommits(workspaceId = "default"): WorkspaceCommit[] {
  try {
    return JSON.parse(safeGetItem(getCommitStorageKey(workspaceId)) || "[]");
  } catch {
    return [];
  }
}

/** Obtém a lista de ficheiros do workspace atual */
export function getWorkspaceFiles(workspaceId = "default"): WorkspaceFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeGetItem(getStorageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[GRIOT Harness] Falha ao carregar ficheiros do workspace:", err);
    return [];
  }
}

/** Guarda ou atualiza um ficheiro no workspace */
export function saveWorkspaceFile(
  path: string,
  content: string,
  workspaceId = "default",
): WorkspaceFile {
  const cleanPath = path.trim().replace(/^(\.\/|\/)/, "");
  const files = getWorkspaceFiles(workspaceId);
  const now = new Date().toISOString();
  const file: WorkspaceFile = {
    path: cleanPath,
    content,
    updatedAt: now,
    size: new Blob([content]).size,
  };

  const existingIndex = files.findIndex((f) => f.path === cleanPath);
  if (existingIndex >= 0) {
    files[existingIndex] = file;
  } else {
    files.push(file);
  }

  if (typeof window !== "undefined") {
    safeSetItem(getStorageKey(workspaceId), JSON.stringify(files));
    window.dispatchEvent(
      new CustomEvent("griot:workspace-files-updated", {
        detail: { workspaceId, path: cleanPath, fileCount: files.length },
      }),
    );
  }

  return file;
}

/** Remove um ficheiro do workspace */
export function deleteWorkspaceFile(path: string, workspaceId = "default"): boolean {
  const cleanPath = path.trim().replace(/^(\.\/|\/)/, "");
  const files = getWorkspaceFiles(workspaceId);
  const filtered = files.filter((f) => f.path !== cleanPath);
  if (filtered.length === files.length) return false;

  if (typeof window !== "undefined") {
    safeSetItem(getStorageKey(workspaceId), JSON.stringify(filtered));
    window.dispatchEvent(
      new CustomEvent("griot:workspace-files-updated", {
        detail: { workspaceId, path: cleanPath, fileCount: filtered.length },
      }),
    );
  }
  return true;
}

/** Verifica se a ligação ao Google Cloud Shell / GCP está ativa */
export function isCloudShellConnected(): boolean {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("griot_gcp_token");
  const runnerUrl = localStorage.getItem("griot_gcp_runner_url");
  const supabaseSession = localStorage.getItem("sb-dslccwkaitihiszetdlh-auth-token");
  return Boolean(
    (token && token.length > 10) ||
    (runnerUrl && runnerUrl.startsWith("http")) ||
    (supabaseSession && supabaseSession.includes("google")),
  );
}

/** Dispara o pedido de ligação ao Google Cloud Shell na interface do Chat */
export function requestCloudShellConnection(action: GriotAction) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("griot:cloudshell-required", {
        detail: { action, timestamp: new Date().toISOString() },
      }),
    );
  }
}

/** Executa uma ação local no Harness de Workspace */
export async function executeLocalAction(
  action: GriotAction,
  workspaceId = "default",
): Promise<GriotExecutionResult> {
  const start = Date.now();
  const params = action.params || {};

  switch (action.type) {
    case "fs.write_file": {
      const path = String(params.path || "index.html");
      const content = String(params.content ?? "");
      const file = saveWorkspaceFile(path, content, workspaceId);

      const lines = content.split("\n").length;
      let syntaxWarning = "";
      if (
        path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".js") ||
        path.endsWith(".jsx")
      ) {
        const balance = validateSyntaxBalance(content);
        if (!balance.valid) {
          syntaxWarning = `⚠️ [Aviso de Sintaxe]: ${balance.error}`;
        }
      } else if (path.endsWith(".json")) {
        try {
          JSON.parse(content);
        } catch (jsonErr) {
          syntaxWarning = `⚠️ [Aviso JSON Inválido]: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`;
        }
      }

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Workspace] Ficheiro gravado com sucesso: ${file.path} (${file.size} bytes, ${lines} linhas).${syntaxWarning ? `\n${syntaxWarning}` : ""}`,
        stderr: syntaxWarning,
        durationMs: Date.now() - start,
        data: { path: file.path, size: file.size, lines, syntaxWarning: syntaxWarning || undefined },
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.read_file": {
      const path = String(params.path || "")
        .trim()
        .replace(/^(\.\/|\/)/, "");
      const files = getWorkspaceFiles(workspaceId);
      const found = files.find((f) => f.path === path);

      if (!found) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: Ficheiro '${path}' não encontrado no workspace.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const allLines = found.content.split("\n");
      const hasLineRange = params.start_line !== undefined || params.end_line !== undefined;
      let outputContent = found.content;

      if (hasLineRange) {
        const startLine = Math.max(1, Number(params.start_line) || 1);
        const endLine = Math.min(allLines.length, Number(params.end_line) || allLines.length);
        const sliced = allLines.slice(startLine - 1, endLine);
        outputContent = sliced.map((l, idx) => `${startLine + idx}: ${l}`).join("\n");
      }

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: outputContent,
        stderr: "",
        durationMs: Date.now() - start,
        data: {
          path: found.path,
          size: found.size,
          totalLines: allLines.length,
          startLine: params.start_line,
          endLine: params.end_line,
        },
        timestamp: new Date().toISOString(),
      };
    }

    case "search.code": {
      const query = String(params.query || "").trim();
      const ext = params.extension ? String(params.extension).toLowerCase().replace(/^\./, "") : "";
      if (!query) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: "Erro: Fornece um termo ou símbolo ('query') para pesquisar no código.",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const files = getWorkspaceFiles(workspaceId);
      const matches: string[] = [];
      const queryLower = query.toLowerCase();
      let totalMatches = 0;
      const MAX_MATCHES = 50;

      for (const file of files) {
        if (ext && !file.path.toLowerCase().endsWith(`.${ext}`)) continue;

        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            totalMatches++;
            if (matches.length < MAX_MATCHES) {
              matches.push(`${file.path}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        }
      }

      if (matches.length === 0) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "success",
          exitCode: 0,
          stdout: `Nenhuma ocorrência encontrada para '${query}'${ext ? ` em ficheiros *.${ext}` : ""}.`,
          stderr: "",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const out = [
        `[GRIOT Grep] Encontradas ${totalMatches} ocorrência(s) de '${query}':`,
        ...matches,
        totalMatches > MAX_MATCHES
          ? `... e mais ${totalMatches - MAX_MATCHES} ocorrências omitidas para poupar contexto.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: out,
        stderr: "",
        durationMs: Date.now() - start,
        data: { totalMatches, query },
        timestamp: new Date().toISOString(),
      };
    }

    case "search.files": {
      const pattern = String(params.pattern || params.query || "")
        .trim()
        .toLowerCase();
      const files = getWorkspaceFiles(workspaceId);

      if (!pattern) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: "Erro: Fornece um padrão ou nome de ficheiro ('pattern').",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const cleanPat = pattern.replace(/^\*+/, "").replace(/\*+$/, "");
      const matched = files.filter((f) => f.path.toLowerCase().includes(cleanPat));

      if (matched.length === 0) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "success",
          exitCode: 0,
          stdout: `Nenhum ficheiro encontrado com o padrão '${pattern}'.`,
          stderr: "",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const list = matched.map((f) => {
        const sizeFormatted = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`;
        return `├── ${f.path} (${sizeFormatted})`;
      });

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Find] Ficheiros encontrados (${matched.length}):\n${list.join("\n")}`,
        stderr: "",
        durationMs: Date.now() - start,
        data: { count: matched.length },
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.read_tree": {
      const files = getWorkspaceFiles(workspaceId);
      if (files.length === 0) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "success",
          exitCode: 0,
          stdout: ".\n(O workspace está vazio. Nenhum ficheiro criado ainda.)",
          stderr: "",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const treeLines = [`. (Workspace: ${workspaceId})`];
      for (const f of files) {
        const sizeFormatted = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`;
        treeLines.push(`├── ${f.path} (${sizeFormatted})`);
      }

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: treeLines.join("\n"),
        stderr: "",
        durationMs: Date.now() - start,
        data: { fileCount: files.length },
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.delete_file": {
      const path = String(params.path || "");
      const deleted = deleteWorkspaceFile(path, workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: deleted ? "success" : "failed",
        exitCode: deleted ? 0 : 1,
        stdout: deleted ? `[GRIOT Workspace] Ficheiro '${path}' removido.` : "",
        stderr: deleted ? "" : `Erro: Não foi possível remover o ficheiro '${path}'.`,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.patch": {
      const path = String(params.path || "")
        .trim()
        .replace(/^(\.\/|\/)/, "");
      const target = String(params.target || "");
      const replacement = String(params.replacement || "");
      const files = getWorkspaceFiles(workspaceId);
      const file = files.find((f) => f.path === path);

      if (!file) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: Ficheiro '${path}' não encontrado para aplicar patch.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      if (!target) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: O parâmetro 'target' (código original a substituir) não pode ser vazio.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      if (!file.content.includes(target)) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: O trecho 'target' não foi encontrado no ficheiro '${path}'. Certifica-te de que o código original coincide com exatidão (incluindo quebras de linha e indentação).`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const occurrences = file.content.split(target).length - 1;
      if (occurrences > 1) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: O trecho alvo aparece ${occurrences} vezes no ficheiro '${path}'. Inclui mais linhas circundantes de contexto no 'target' para garantir substituição unívoca.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const patchedContent = file.content.replace(target, replacement);
      saveWorkspaceFile(path, patchedContent, workspaceId);

      const targetLines = target.split("\n").length;
      const repLines = replacement.split("\n").length;
      let patchSyntaxWarning = "";
      if (
        path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".js") ||
        path.endsWith(".jsx")
      ) {
        const balance = validateSyntaxBalance(patchedContent);
        if (!balance.valid) {
          patchSyntaxWarning = `⚠️ [Aviso de Sintaxe Pós-Patch]: ${balance.error}`;
        }
      }

      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Workspace] Patch cirúrgico aplicado com sucesso a ${path} (-${targetLines} / +${repLines} linhas).${patchSyntaxWarning ? `\n${patchSyntaxWarning}` : ""}`,
        stderr: patchSyntaxWarning,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.apply_diff": {
      const path = String(params.path || "")
        .trim()
        .replace(/^(\.\/|\/)/, "");
      const diff = String(params.diff || params.patch || "");
      const files = getWorkspaceFiles(workspaceId);
      const file = files.find((f) => f.path === path);

      if (!file) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: Ficheiro '${path}' não encontrado no workspace para aplicar diff unificado.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const patchResult = applyUnifiedDiff(file.content, diff);
      if (!patchResult.success) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: patchResult.error || "Falha ao aplicar hunks de diff.",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      saveWorkspaceFile(path, patchResult.content, workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Unified Diff] ${patchResult.appliedHunks}/${patchResult.totalHunks} blocos de diff aplicados com sucesso em '${path}'.`,
        stderr: patchResult.error || "",
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "fs.search_replace": {
      const path = String(params.path || "")
        .trim()
        .replace(/^(\.\/|\/)/, "");
      const search = String(params.search || params.target || "");
      const replace = String(params.replace || params.replacement || "");
      const files = getWorkspaceFiles(workspaceId);
      const file = files.find((f) => f.path === path);

      if (!file) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro: Ficheiro '${path}' não encontrado para search/replace.`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const res = applySearchReplace(file.content, search, replace);
      if (!res.success) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: res.error || "Bloco de busca não encontrado.",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      saveWorkspaceFile(path, res.content, workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Search/Replace] Bloco substituído com sucesso em '${path}'.`,
        stderr: "",
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "workspace.snapshot": {
      const label = String(params.label || "Manual Snapshot");
      const snap = createWorkspaceSnapshot(label, workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Snapshot] Snapshot '${snap.label}' criado com sucesso (ID: ${snap.id}, ${snap.fileCount} ficheiros).`,
        stderr: "",
        data: { snapshotId: snap.id, fileCount: snap.fileCount },
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "workspace.rollback": {
      const snapshotId = String(params.snapshotId || params.id || "");
      if (!snapshotId) {
        const snaps = getWorkspaceSnapshots(workspaceId);
        if (snaps.length === 0) {
          return {
            actionId: action.id,
            actionType: action.type,
            status: "failed",
            exitCode: 1,
            stdout: "",
            stderr: "Nenhum snapshot disponível para rollback.",
            durationMs: Date.now() - start,
            timestamp: new Date().toISOString(),
          };
        }
        const lastSnap = snaps[0];
        const res = rollbackToSnapshot(lastSnap.id, workspaceId);
        return {
          actionId: action.id,
          actionType: action.type,
          status: res.success ? "success" : "failed",
          exitCode: res.success ? 0 : 1,
          stdout: res.message,
          stderr: res.success ? "" : res.message,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      const res = rollbackToSnapshot(snapshotId, workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: res.success ? "success" : "failed",
        exitCode: res.success ? 0 : 1,
        stdout: res.message,
        stderr: res.success ? "" : res.message,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "code.find_symbol": {
      const name = String(params.name || params.query || "");
      const syms = findSymbol(name, workspaceId);
      const out =
        syms.length > 0
          ? syms
              .map((s) => `[${s.kind}] ${s.name} -> ${s.filePath}:${s.line} (${s.signature})`)
              .join("\n")
          : `Nenhum símbolo encontrado correspondente a '${name}'.`;
      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: `[GRIOT Symbol Search] Encontrados ${syms.length} símbolos:\n${out}`,
        stderr: "",
        data: { count: syms.length, symbols: syms },
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "code.index_symbols": {
      const index = getWorkspaceSymbolIndex(workspaceId);
      const archMap = getCompactArchitectureMap(workspaceId);
      return {
        actionId: action.id,
        actionType: action.type,
        status: "success",
        exitCode: 0,
        stdout: archMap,
        stderr: "",
        data: { totalFiles: index.totalFiles, totalSymbols: index.totalSymbols },
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "code.diagnose": {
      const report = runWorkspaceDiagnostics(workspaceId);
      const formatted = formatDiagnosticReport(report);
      return {
        actionId: action.id,
        actionType: action.type,
        status: report.isClean ? "success" : "failed",
        exitCode: report.isClean ? 0 : 1,
        stdout: formatted,
        stderr: report.isClean ? "" : `Encontrado(s) ${report.errorCount} erro(s) estático(s) no workspace.`,
        data: {
          totalFilesScanned: report.totalFilesScanned,
          errorCount: report.errorCount,
          warningCount: report.warningCount,
          isClean: report.isClean,
        },
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    case "git.status":
    case "git.commit":
    case "git.log":
    case "git.diff":
    case "git.branch": {
      const sandboxRes = await executeInGriotSandbox(action, { workspaceId });
      if (action.type === "git.commit" && sandboxRes.status === "success") {
        const hashMatch = sandboxRes.stdout.match(/\[(?:[^\s\]]+)\s+([0-9a-fA-F]+)\]/);
        const commitHash = hashMatch ? hashMatch[1] : Date.now().toString(16);
        const files = getWorkspaceFiles(workspaceId);
        saveWorkspaceCommit(
          {
            hash: commitHash,
            message: String(params.message || "Commit do workspace"),
            author: "GRIOT Agent <agent@griot.local>",
            timestamp: new Date().toISOString(),
            files: files.map((f) => f.path),
          },
          workspaceId,
        );
      }
      return sandboxRes;
    }

    // Project Brain (OPB) — recuperação de contexto real
    case "opb.recall": {
      const query = String(params.query || params.q || "").trim();
      const limit = Math.max(1, Math.min(30, Number(params.limit) || 12));
      const res = await recallOpbMemory(query, limit);
      return {
        actionId: action.id,
        actionType: action.type,
        status: res.ok ? "success" : "failed",
        exitCode: res.ok ? 0 : 1,
        stdout: res.text,
        stderr: res.ok ? "" : res.text,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    // Gestão de Projetos (project.list / project.get)
    case "project.list":
    case "project.get": {
      try {
        const projects = await getUnifiedProjects();
        const filter = String(params.filter || "")
          .toLowerCase()
          .trim();
        const filtered = filter
          ? projects.filter(
              (p) =>
                p.name.toLowerCase().includes(filter) ||
                p.description?.toLowerCase().includes(filter),
            )
          : projects;

        const connectedServices: string[] = [];
        if (isPluginConnected("github"))
          connectedServices.push("GitHub (Repositórios disponíveis)");
        if (isPluginConnected("supabase"))
          connectedServices.push("Supabase (PostgreSQL / Edge Functions)");
        if (isPluginConnected("gitlab")) connectedServices.push("GitLab");
        if (isPluginConnected("cloudflare")) connectedServices.push("Cloudflare");

        if (filtered.length === 0) {
          const lines = [
            `[GRIOT Projetos] Nenhum projeto registado no momento.`,
            `Workspace Local Ativo: ${workspaceId}`,
            connectedServices.length > 0
              ? `Serviços Conectados Ativos: ${connectedServices.join(", ")}`
              : `Dica: Podes criar novos projetos ou conectar o conector do GitHub para listar repositórios.`,
          ];
          return {
            actionId: action.id,
            actionType: action.type,
            status: "success",
            exitCode: 0,
            stdout: lines.join("\n"),
            stderr: "",
            durationMs: Date.now() - start,
            timestamp: new Date().toISOString(),
          };
        }

        const lines = [
          `[GRIOT Inventário de Projetos]: ${filtered.length} projeto(s) encontrado(s):`,
          ...filtered.map((p, i) => {
            const dateStr = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "Recente";
            return `${i + 1}. **${p.name}**\n   - ID: \`${p.id}\`\n   - Progresso: ${p.progress}%\n   - Estado: ${p.status || "ativo"}\n   - Atualizado: ${dateStr}\n   - Descrição: ${p.description || "Projeto GRIOT"}`;
          }),
        ];

        if (connectedServices.length > 0) {
          lines.push(`\n[Serviços e Conectores Integrados]: ${connectedServices.join(", ")}`);
        }

        return {
          actionId: action.id,
          actionType: action.type,
          status: "success",
          exitCode: 0,
          stdout: lines.join("\n"),
          stderr: "",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `Erro ao listar projetos: ${err?.message || String(err)}`,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Comandos de Terminal / Shell, Compilação e Testes (Execução REAL no Sandbox gVisor)
    case "shell.exec":
    case "shell.install":
    case "shell.build":
    case "test.run":
    case "test.verify": {
      const cmd = String(params.command || params.cmd || "").trim();

      // Consulta semântica de projetos locais
      if (
        cmd === "projectlist" ||
        cmd === "projectList" ||
        cmd === "projects" ||
        cmd.startsWith("projects ") ||
        cmd === "list-projects"
      ) {
        return executeLocalAction({ ...action, type: "project.list" }, workspaceId);
      }

      // Execução REAL no Cloud Run gVisor Sandbox
      return executeInGriotSandbox(action, { workspaceId });
    }

    default:
      return executeInGriotSandbox(action, { workspaceId });
  }
}
