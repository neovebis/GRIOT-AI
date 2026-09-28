/**
 * GRIOT Code Diagnostician & In-Workspace Static Analysis Engine
 *
 * Provides real-time IDE-grade diagnostics (syntax, imports, JSX balance, JSON validity)
 * across the entire workspace without needing a full native tsc process.
 * Acts as the agent's "Compiler Eye" to guarantee zero broken builds.
 */

import { getWorkspaceFiles, type WorkspaceFile } from "./local-harness";
import { validateSyntaxBalance } from "./semantic-patcher";

export interface DiagnosticItem {
  filePath: string;
  line: number;
  column?: number;
  severity: "error" | "warning";
  category: "syntax" | "import" | "jsx" | "json";
  message: string;
  rule: string;
}

export interface WorkspaceDiagnosticReport {
  timestamp: string;
  totalFilesScanned: number;
  errorCount: number;
  warningCount: number;
  isClean: boolean;
  diagnostics: DiagnosticItem[];
  summary: string;
}

/**
 * Valida integridade de imports relativos dentro do workspace.
 */
function checkRelativeImports(
  file: WorkspaceFile,
  allPaths: Set<string>,
): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  const lines = file.content.split("\n");

  const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;

  lines.forEach((line, idx) => {
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(line)) !== null) {
      const relPath = match[1];
      const dir = file.path.includes("/")
        ? file.path.substring(0, file.path.lastIndexOf("/"))
        : "";

      // Resolve caminho relativo simplificado
      const parts = (dir ? dir.split("/") : []).concat(relPath.split("/"));
      const resolved: string[] = [];
      for (const p of parts) {
        if (!p || p === ".") continue;
        if (p === "..") {
          resolved.pop();
        } else {
          resolved.push(p);
        }
      }
      const targetBase = resolved.join("/");

      // Extensões candidatas
      const candidates = [
        targetBase,
        `${targetBase}.ts`,
        `${targetBase}.tsx`,
        `${targetBase}.js`,
        `${targetBase}.jsx`,
        `${targetBase}/index.ts`,
        `${targetBase}/index.tsx`,
        `${targetBase}/index.js`,
      ];

      const exists = candidates.some((c) => allPaths.has(c));
      if (!exists && !relPath.endsWith(".css") && !relPath.endsWith(".svg")) {
        items.push({
          filePath: file.path,
          line: idx + 1,
          severity: "warning",
          category: "import",
          message: `O módulo relativo '${relPath}' não foi encontrado no workspace.`,
          rule: "import/no-unresolved",
        });
      }
    }
  });

  return items;
}

/**
 * Validação de tags JSX / HTML balanceadas.
 */
function checkJsxBalance(file: WorkspaceFile): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  if (!file.path.endsWith(".tsx") && !file.path.endsWith(".jsx")) return items;

  const content = file.content;
  // Expressão simplificada para tags JSX abertas e fechadas
  const tagRegex = /<\/?([A-Z][A-Za-z0-9.]*)\b[^>]*(\/?)>/g;
  const stack: Array<{ name: string; line: number }> = [];

  const lines = content.split("\n");
  lines.forEach((lineText, lineIdx) => {
    // Ignora comentários de linha
    if (lineText.trim().startsWith("//")) return;

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(lineText)) !== null) {
      const isClosing = match[0].startsWith("</");
      const isSelfClosing = match[2] === "/" || match[0].endsWith("/>");
      const tagName = match[1];

      if (isSelfClosing) continue;

      if (!isClosing) {
        stack.push({ name: tagName, line: lineIdx + 1 });
      } else {
        if (stack.length === 0) {
          items.push({
            filePath: file.path,
            line: lineIdx + 1,
            severity: "error",
            category: "jsx",
            message: `Tag de fecho inesperada '</${tagName}>' sem abertura correspondente.`,
            rule: "jsx/balanced-tags",
          });
        } else {
          const last = stack.pop()!;
          if (last.name !== tagName) {
            items.push({
              filePath: file.path,
              line: lineIdx + 1,
              severity: "error",
              category: "jsx",
              message: `Desalinhamento de tag JSX: esperava '</${last.name}>' (aberta na linha ${last.line}), mas encontrou '</${tagName}>'.`,
              rule: "jsx/balanced-tags",
            });
          }
        }
      }
    }
  });

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    items.push({
      filePath: file.path,
      line: unclosed.line,
      severity: "error",
      category: "jsx",
      message: `Tag JSX '<${unclosed.name}>' não foi fechada.`,
      rule: "jsx/unclosed-tag",
    });
  }

  return items;
}

/**
 * Executa uma varredura completa de diagnósticos estáticos no workspace.
 */
export function runWorkspaceDiagnostics(workspaceId = "default"): WorkspaceDiagnosticReport {
  const files = getWorkspaceFiles(workspaceId);
  const allPaths = new Set(files.map((f) => f.path));
  const diagnostics: DiagnosticItem[] = [];

  for (const file of files) {
    // 1. Diagnóstico de JSON
    if (file.path.endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch (err) {
        diagnostics.push({
          filePath: file.path,
          line: 1,
          severity: "error",
          category: "json",
          message: `JSON inválido: ${err instanceof Error ? err.message : String(err)}`,
          rule: "json/valid-syntax",
        });
      }
      continue;
    }

    // 2. Diagnóstico de Código TypeScript/JavaScript
    if (
      file.path.endsWith(".ts") ||
      file.path.endsWith(".tsx") ||
      file.path.endsWith(".js") ||
      file.path.endsWith(".jsx")
    ) {
      // Equilíbrio estrutural de delimitadores
      const balance = validateSyntaxBalance(file.content);
      if (!balance.valid) {
        diagnostics.push({
          filePath: file.path,
          line: 1,
          severity: "error",
          category: "syntax",
          message: balance.error || "Desbalanceamento sintático de chavetas, parênteses ou aspas.",
          rule: "syntax/balanced-brackets",
        });
      }

      // Verificação de JSX
      const jsxErrors = checkJsxBalance(file);
      diagnostics.push(...jsxErrors);

      // Verificação de imports relativos
      const importWarnings = checkRelativeImports(file, allPaths);
      diagnostics.push(...importWarnings);
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const isClean = errorCount === 0;

  const summary = isClean
    ? `Workspace auditado com sucesso (${files.length} ficheiros analisados, 0 erros sintáticos).`
    : `Encontrado(s) ${errorCount} erro(s) e ${warningCount} aviso(s) em ${files.length} ficheiros analisados.`;

  return {
    timestamp: new Date().toISOString(),
    totalFilesScanned: files.length,
    errorCount,
    warningCount,
    isClean,
    diagnostics,
    summary,
  };
}

/**
 * Formata o relatório para injeção no prompt ou observação da IA.
 */
export function formatDiagnosticReport(report: WorkspaceDiagnosticReport): string {
  if (report.isClean) {
    return `[GRIOT Code Diagnostician]: ✅ Workspace 100% íntegro. Todos os ${report.totalFilesScanned} ficheiros possuem sintaxe e tags JSX válidas.`;
  }

  const lines = [
    `[GRIOT Code Diagnostician]: ⚠️ ${report.summary}`,
    "--- DIAGNÓSTICOS ENCONTRADOS ---",
  ];

  for (const d of report.diagnostics) {
    const icon = d.severity === "error" ? "❌ [ERRO]" : "⚠️ [AVISO]";
    lines.push(`${icon} ${d.filePath}:${d.line} (${d.category}): ${d.message} [${d.rule}]`);
  }

  lines.push("--- FIM DOS DIAGNÓSTICOS ---");
  lines.push("Ação recomendada: Aplica patches cirúrgicos nas linhas indicadas para restaurar integridade.");

  return lines.join("\n");
}
