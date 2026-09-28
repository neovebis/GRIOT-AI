/**
 * GRIOT Code Symbol Indexer & Hierarchical Context Compression
 *
 * Scans the workspace files and generates lightweight AST-like symbol tables
 * (interfaces, types, functions, classes, exports) to provide Tier-1 code navigation
 * and allow the AI to understand thousands of files without blowing up the context window.
 */

import { getWorkspaceFiles, type WorkspaceFile } from "./local-harness";

export interface CodeSymbol {
  name: string;
  kind: "interface" | "type" | "function" | "class" | "const" | "enum" | "export";
  filePath: string;
  line: number;
  signature: string;
}

export interface WorkspaceSymbolIndex {
  workspaceId: string;
  totalFiles: number;
  totalSymbols: number;
  symbols: CodeSymbol[];
  summaryMap: Record<string, string[]>;
}

const indexCache = new Map<string, { timestamp: number; index: WorkspaceSymbolIndex }>();

/**
 * Extrai símbolos estruturados de um ficheiro de código TypeScript/JavaScript.
 */
export function extractSymbolsFromCode(filePath: string, content: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNum = idx + 1;

    // Interfaces
    const ifaceMatch = trimmed.match(/^export\s+(?:default\s+)?interface\s+([A-Za-z0-9_]+)/);
    if (ifaceMatch) {
      symbols.push({
        name: ifaceMatch[1],
        kind: "interface",
        filePath,
        line: lineNum,
        signature: trimmed.replace(/\{.*$/, "").trim(),
      });
      return;
    }

    // Types
    const typeMatch = trimmed.match(/^export\s+(?:default\s+)?type\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: "type",
        filePath,
        line: lineNum,
        signature: trimmed.slice(0, 100),
      });
      return;
    }

    // Enums
    const enumMatch = trimmed.match(/^export\s+enum\s+([A-Za-z0-9_]+)/);
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        kind: "enum",
        filePath,
        line: lineNum,
        signature: trimmed.replace(/\{.*$/, "").trim(),
      });
      return;
    }

    // Functions
    const fnMatch = trimmed.match(
      /^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/,
    );
    if (fnMatch) {
      symbols.push({
        name: fnMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        signature: `function ${fnMatch[1]}(${fnMatch[2].trim()})`,
      });
      return;
    }

    // Arrow function exports
    const arrowMatch = trimmed.match(
      /^export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/,
    );
    if (arrowMatch) {
      symbols.push({
        name: arrowMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        signature: `const ${arrowMatch[1]} = (${arrowMatch[2].trim()}) =>`,
      });
      return;
    }

    // Classes
    const classMatch = trimmed.match(/^export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        signature: trimmed.replace(/\{.*$/, "").trim(),
      });
      return;
    }

    // Const exports
    const constMatch = trimmed.match(/^export\s+const\s+([A-Za-z0-9_]+)/);
    if (constMatch && !arrowMatch) {
      symbols.push({
        name: constMatch[1],
        kind: "const",
        filePath,
        line: lineNum,
        signature: trimmed.slice(0, 80),
      });
    }
  });

  return symbols;
}

/**
 * Gera ou recupera o índice de símbolos do workspace.
 */
export function getWorkspaceSymbolIndex(workspaceId: string = "default"): WorkspaceSymbolIndex {
  const cached = indexCache.get(workspaceId);
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.index;
  }

  const files = getWorkspaceFiles(workspaceId);
  const allSymbols: CodeSymbol[] = [];
  const summaryMap: Record<string, string[]> = {};

  for (const f of files) {
    if (
      f.path.endsWith(".ts") ||
      f.path.endsWith(".tsx") ||
      f.path.endsWith(".js") ||
      f.path.endsWith(".jsx")
    ) {
      const syms = extractSymbolsFromCode(f.path, f.content);
      allSymbols.push(...syms);
      if (syms.length > 0) {
        summaryMap[f.path] = syms.map((s) => `${s.kind} ${s.name}`);
      }
    }
  }

  const index: WorkspaceSymbolIndex = {
    workspaceId,
    totalFiles: files.length,
    totalSymbols: allSymbols.length,
    symbols: allSymbols,
    summaryMap,
  };

  indexCache.set(workspaceId, { timestamp: Date.now(), index });
  return index;
}

/**
 * Procura referências ou definições de um símbolo pelo nome exato ou parcial.
 */
export function findSymbol(name: string, workspaceId: string = "default"): CodeSymbol[] {
  const idx = getWorkspaceSymbolIndex(workspaceId);
  const lower = name.toLowerCase();
  return idx.symbols.filter((s) => s.name.toLowerCase().includes(lower));
}

/**
 * Produz uma visão compacta da arquitetura do workspace para injetar no contexto da IA
 * com zero desperdício de tokens.
 */
export function getCompactArchitectureMap(workspaceId: string = "default"): string {
  const idx = getWorkspaceSymbolIndex(workspaceId);
  const lines: string[] = [
    `# Workspace Architecture Map [${workspaceId}] (${idx.totalFiles} files, ${idx.totalSymbols} symbols)`,
  ];

  for (const [path, symList] of Object.entries(idx.summaryMap)) {
    lines.push(`- **${path}**: ${symList.join(", ")}`);
  }

  return lines.join("\n");
}
