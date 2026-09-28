// Gera o catálogo completo de strings de interface (português europeu) usado
// pelo motor de tradução. Corre: bun run scripts/gen-i18n-catalog.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(tsx?|ts)$/.test(entry) && !entry.endsWith(".gen.ts")) files.push(path);
  }
}
walk(ROOT);

const found = new Set();
const add = (value) => {
  const text = value.trim();
  if (!text || text.length > 220) return;
  if (!/[a-zA-ZÀ-ÿ]/.test(text)) return;
  found.add(text);
};

const STRING = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'`;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  // t("...") em qualquer ficheiro
  for (const match of source.matchAll(new RegExp(String.raw`\bt\(\s*(?:${STRING})\s*\)`, "g"))) {
    add((match[1] ?? match[2] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'"));
  }
  // label/hint/title/note/subtitle/text/placeholder: "..." — passam por t() dinamicamente
  for (const match of source.matchAll(
    new RegExp(
      String.raw`\b(?:label|hint|title|note|subtitle|text|placeholder|short|vendor)\s*:\s*(?:${STRING})`,
      "g",
    ),
  )) {
    add((match[1] ?? match[2] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'"));
  }
  // mapas de estado: { operational: "Operacional" }
  for (const match of source.matchAll(
    new RegExp(String.raw`^\s*[a-zA-Z_]+:\s*(?:${STRING}),?$`, "gm"),
  )) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (/^[A-ZÀ-Ý]/.test(value) && /\s|[çãõáéíóúâêô]/i.test(value)) add(value);
  }
}

const list = Array.from(found).sort((a, b) => a.localeCompare(b, "pt"));
writeFileSync(
  "src/lib/i18n-catalog.ts",
  `// Ficheiro gerado por scripts/gen-i18n-catalog.mjs — não editar à mão.\n` +
    `export const I18N_CATALOG: readonly string[] = ${JSON.stringify(list, null, 2)} as const;\n`,
);
console.log(`catálogo: ${list.length} strings`);
