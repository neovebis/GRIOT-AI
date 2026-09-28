/**
 * GRIOT Semantic Diff & AST-Aware File Patcher
 *
 * Implements high-precision code patching:
 * 1. Unified Diff (patch) parsing with fuzzy context fallback
 * 2. AST-like TypeScript/JavaScript import consolidation (no duplicates)
 * 3. Search-and-Replace block resolution
 * 4. Structural syntax sanity validation (brackets, quotes, JSX balance)
 */

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface PatchResult {
  success: boolean;
  content: string;
  appliedHunks: number;
  totalHunks: number;
  error?: string;
}

/**
 * Valida o equilíbrio sintático estrutural de código TypeScript/JavaScript/JSX.
 */
export function validateSyntaxBalance(content: string): { valid: boolean; error?: string } {
  let brace = 0; // { }
  let paren = 0; // ( )
  let bracket = 0; // [ ]
  let inString = false;
  let stringChar = "";
  let inComment = false;
  let inLineComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (char === "\\" && i + 1 < content.length) {
        i++; // Ignora caracter de escape
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    // Abertura de comentários
    if (char === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === "/" && next === "*") {
      inComment = true;
      i++;
      continue;
    }

    // Strings
    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    // Contagem de parênteses/chaves
    if (char === "{") brace++;
    else if (char === "}") brace--;
    else if (char === "(") paren++;
    else if (char === ")") paren--;
    else if (char === "[") bracket++;
    else if (char === "]") bracket--;

    if (brace < 0)
      return { valid: false, error: `Chave fechada '}' sem correspondente na posição ${i}` };
    if (paren < 0)
      return { valid: false, error: `Parêntese fechado ')' sem correspondente na posição ${i}` };
    if (bracket < 0)
      return { valid: false, error: `Colchete fechado ']' sem correspondente na posição ${i}` };
  }

  if (brace !== 0)
    return {
      valid: false,
      error: `Desequilíbrio de chaves: ${brace > 0 ? `${brace} '{' não fechada(s)` : `${-brace} '}' extra(s)`}`,
    };
  if (paren !== 0)
    return {
      valid: false,
      error: `Desequilíbrio de parênteses: ${paren > 0 ? `${paren} '(' não fechado(s)` : `${-paren} ')' extra(s)`}`,
    };
  if (bracket !== 0)
    return {
      valid: false,
      error: `Desequilíbrio de colchetes: ${bracket > 0 ? `${bracket} '[' não fechado(s)` : `${-bracket} ']' extra(s)`}`,
    };

  return { valid: true };
}

/**
 * Adiciona ou mescla um import de forma inteligente no topo do ficheiro,
 * evitando duplicações e unificando named imports do mesmo módulo.
 */
export function injectOrMergeImport(sourceContent: string, importStatement: string): string {
  const trimmedImport = importStatement.trim();
  if (!trimmedImport.startsWith("import ")) return sourceContent;

  // Extrai o caminho do módulo ex: import { A, B } from "@/lib/test"; -> "@/lib/test"
  const moduleMatch = trimmedImport.match(/from\s+["']([^"']+)["']/);
  if (!moduleMatch) {
    // Import sem "from" (ex: import "./styles.css")
    if (sourceContent.includes(trimmedImport)) return sourceContent;
    return `${trimmedImport}\n${sourceContent}`;
  }

  const modulePath = moduleMatch[1];
  const existingImportRegex = new RegExp(
    `import\\s+(?:{[^}]+}|[^{;]+)\\s+from\\s+["']${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?`,
    "g",
  );

  const existingMatch = sourceContent.match(existingImportRegex);
  if (!existingMatch) {
    // Insere após o último import existente ou no topo
    const lastImportIndex = sourceContent.lastIndexOf("\nimport ");
    if (lastImportIndex !== -1) {
      const endOfLastImport = sourceContent.indexOf("\n", lastImportIndex + 1);
      return `${sourceContent.slice(0, endOfLastImport + 1)}${trimmedImport}\n${sourceContent.slice(endOfLastImport + 1)}`;
    }
    return `${trimmedImport}\n\n${sourceContent}`;
  }

  // Se já existir um import idêntico, não faz nada
  if (sourceContent.includes(trimmedImport)) return sourceContent;

  // Se for import nomeado de ambos os lados, mescla os identificadores
  const newNamedMatch = trimmedImport.match(/import\s+{\s*([^}]+)\s*}\s+from/);
  const oldNamedMatch = existingMatch[0].match(/import\s+{\s*([^}]+)\s*}\s+from/);

  if (newNamedMatch && oldNamedMatch) {
    const existingItems = oldNamedMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const newItems = newNamedMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedItems = Array.from(new Set([...existingItems, ...newItems]));
    const mergedImport = `import { ${mergedItems.join(", ")} } from "${modulePath}";`;
    return sourceContent.replace(existingMatch[0], mergedImport);
  }

  // Fallback: adiciona a linha de import logo após o import existente
  return sourceContent.replace(existingMatch[0], `${existingMatch[0]}\n${trimmedImport}`);
}

/**
 * Aplica um patch no formato Unified Diff (estilo git diff / unified patch).
 */
export function applyUnifiedDiff(originalContent: string, diffText: string): PatchResult {
  const originalLines = originalContent.split("\n");
  const diffLines = diffText.split("\n");

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (const line of diffLines) {
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkHeader) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkHeader[1], 10),
        oldLines: hunkHeader[2] ? parseInt(hunkHeader[2], 10) : 1,
        newStart: parseInt(hunkHeader[3], 10),
        newLines: hunkHeader[4] ? parseInt(hunkHeader[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
        currentHunk.lines.push(line);
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  if (hunks.length === 0) {
    return {
      success: false,
      content: originalContent,
      appliedHunks: 0,
      totalHunks: 0,
      error: "Nenhum bloco de diff (hunk) válido detectado no formato @@ -x,y +a,b @@",
    };
  }

  let resultLines = [...originalLines];
  let appliedCount = 0;

  for (const hunk of hunks) {
    // Procura o local de correspondência das linhas de contexto
    const contextLines = hunk.lines.filter((l) => !l.startsWith("+")).map((l) => l.slice(1));
    const expectedOldBlock = contextLines.join("\n");

    let matchIndex = -1;

    // 1. Tenta correspondência na linha indicada pelo header
    const targetIdx = Math.max(0, hunk.oldStart - 1);
    const candidateBlock = resultLines.slice(targetIdx, targetIdx + contextLines.length).join("\n");

    if (candidateBlock === expectedOldBlock) {
      matchIndex = targetIdx;
    } else {
      // 2. Busca por varredura exata em todo o ficheiro
      for (let i = 0; i <= resultLines.length - contextLines.length; i++) {
        if (resultLines.slice(i, i + contextLines.length).join("\n") === expectedOldBlock) {
          matchIndex = i;
          break;
        }
      }
    }

    // 3. Fallback: busca por correspondência de espaço em branco flexível
    if (matchIndex === -1) {
      const normExpected = expectedOldBlock.replace(/\s+/g, " ").trim();
      for (let i = 0; i <= resultLines.length - contextLines.length; i++) {
        const normCandidate = resultLines
          .slice(i, i + contextLines.length)
          .join("\n")
          .replace(/\s+/g, " ")
          .trim();
        if (normCandidate === normExpected) {
          matchIndex = i;
          break;
        }
      }
    }

    if (matchIndex === -1) {
      continue; // Não foi possível casar este hunk
    }

    // Constrói o novo bloco substituído
    const newBlockLines: string[] = [];
    for (const l of hunk.lines) {
      if (l.startsWith("+")) {
        newBlockLines.push(l.slice(1));
      } else if (l.startsWith(" ")) {
        newBlockLines.push(l.slice(1));
      }
      // Linhas que começam com '-' são omitidas (removidas)
    }

    resultLines.splice(matchIndex, contextLines.length, ...newBlockLines);
    appliedCount++;
  }

  const newContent = resultLines.join("\n");
  const isCompleteSuccess = appliedCount === hunks.length;

  return {
    success: appliedCount > 0,
    content: newContent,
    appliedHunks: appliedCount,
    totalHunks: hunks.length,
    error: isCompleteSuccess
      ? undefined
      : `Apenas ${appliedCount}/${hunks.length} blocos de diff foram aplicados.`,
  };
}

/**
 * Substitui um bloco de código com correspondência resiliente (Search & Replace).
 */
export function applySearchReplace(
  originalContent: string,
  search: string,
  replace: string,
): { success: boolean; content: string; error?: string } {
  // 1. Substituição exata
  if (originalContent.includes(search)) {
    return {
      success: true,
      content: originalContent.replace(search, replace),
    };
  }

  // 2. Substituição com normalização de quebras de linha (\r\n -> \n)
  const normOriginal = originalContent.replace(/\r\n/g, "\n");
  const normSearch = search.replace(/\r\n/g, "\n");
  const normReplace = replace.replace(/\r\n/g, "\n");

  if (normOriginal.includes(normSearch)) {
    return {
      success: true,
      content: normOriginal.replace(normSearch, normReplace),
    };
  }

  // 3. Substituição por linhas com trim
  const searchLines = normSearch
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const origLines = normOriginal.split("\n");

  for (let i = 0; i <= origLines.length - searchLines.length; i++) {
    const windowSlice = origLines.slice(i, i + searchLines.length).map((l) => l.trimEnd());
    if (windowSlice.join("\n") === searchLines.join("\n")) {
      origLines.splice(i, searchLines.length, ...normReplace.split("\n"));
      return {
        success: true,
        content: origLines.join("\n"),
      };
    }
  }

  return {
    success: false,
    content: originalContent,
    error: "O bloco de busca especificado não foi encontrado no arquivo.",
  };
}
