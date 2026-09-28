import React, { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { GriotChart, parseRelaxedJson } from "./griot-chart";
import { stripActionBlocks } from "@/lib/runtime/parser";
import { GriotFileBar, FunctionalPreviewModal, preparePreviewHtml } from "./preview-bar";

interface MarkdownContentProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function isChartBlock(language: string, code: string): boolean {
  const lang = (language || "").trim().toLowerCase();
  if (
    lang === "chart" ||
    lang === "griot-chart" ||
    lang === "graph" ||
    lang.startsWith("chart:") ||
    lang === "recharts" ||
    lang === "barchart" ||
    lang === "linechart"
  ) {
    return true;
  }
  if (lang === "json" || lang === "") {
    const trimmed = code.trim();
    if (
      trimmed.startsWith("{") &&
      (trimmed.includes('"xAxisKey"') ||
        (trimmed.includes('"data"') &&
          (trimmed.includes('"series"') || trimmed.includes('"type"'))))
    ) {
      const parsed = parseRelaxedJson(trimmed);
      if (
        parsed &&
        typeof parsed === "object" &&
        "data" in parsed &&
        Array.isArray(parsed.data) &&
        parsed.data.length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function isPreviewableLang(lang: string, code: string): boolean {
  const l = (lang || "").toLowerCase().trim();
  if (l === "html" || l === "jsx" || l === "tsx" || l === "svg" || l === "react") return true;
  const trimmed = code.trim();
  return (
    trimmed.startsWith("<svg") ||
    trimmed.includes("<!DOCTYPE html>") ||
    (trimmed.includes("<html") && trimmed.includes("</html>"))
  );
}

function resolveFileName(lang: string, code: string): string {
  const l = (lang || "").toLowerCase().trim();
  const trimmed = code.trim();
  if (l === "html" || trimmed.includes("<!DOCTYPE html>")) return "index.html";
  if (l === "jsx") return "App.jsx";
  if (l === "tsx") return "App.tsx";
  if (l === "py" || l === "python") return "script.py";
  if (l === "js" || l === "javascript") return "index.js";
  if (l === "ts" || l === "typescript") return "index.ts";
  if (l === "css") return "styles.css";
  if (l === "json") return "data.json";
  if (l === "svg" || trimmed.startsWith("<svg")) return "vector.svg";
  if (l === "sql") return "query.sql";
  if (l === "sh" || l === "bash") return "script.sh";
  return `file.${l || "txt"}`;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const displayLang = language.trim() || "code";
  const fileName = resolveFileName(displayLang, code);
  const canPreview = isPreviewableLang(displayLang, code);
  const previewHtml = canPreview ? preparePreviewHtml(code, displayLang) : "";

  return (
    <div className="my-3.5 space-y-2">
      <GriotFileBar
        fileName={fileName}
        language={displayLang}
        code={code}
        onPreview={canPreview ? () => setPreviewOpen(true) : undefined}
      />

      <div className="overflow-hidden rounded-2xl border border-hairline/80 bg-neutral-950/90 text-neutral-100 shadow-md">
        <div className="overflow-x-auto p-3.5 text-[13px] leading-relaxed font-mono">
          <pre className="m-0 font-mono whitespace-pre">{code}</pre>
        </div>
      </div>

      {canPreview && (
        <FunctionalPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          srcDoc={previewHtml}
          title={`${fileName} · Live Preview`}
        />
      )}
    </div>
  );
}

/**
 * Renderizador de Markdown e texto estruturado com streaming progressivo para mobile.
 */
export const MarkdownContent = React.memo(function MarkdownContent({
  content,
  className = "",
  isUser = false,
}: MarkdownContentProps) {
  if (!content) return null;

  // Se for mensagem do utilizador, renderiza simples com quebra preservada sem cortar palavras
  if (isUser) {
    return (
      <div
        className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full overflow-hidden ${className}`}
      >
        {content}
      </div>
    );
  }

  const effectiveContent = stripActionBlocks(content);
  if (!effectiveContent) return null;

  // Decomposição de blocos de código markdown (```lang ... ```) e tags <griot_chart>
  const segments: React.ReactNode[] = [];
  const codeBlockRegex =
    /(?:```([a-zA-Z0-9_:-]*)[ \t]*\r?\n([\s\S]*?)```|<griot_chart>([\s\S]*?)<\/griot_chart>)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(effectiveContent)) !== null) {
    const textBefore = effectiveContent.slice(lastIndex, match.index);
    if (textBefore) {
      segments.push(renderFormattedText(textBefore, `text-${lastIndex}`));
    }

    // Se for tag <griot_chart>
    if (match[3] !== undefined) {
      segments.push(<GriotChart key={`chart-${match.index}`} rawJson={match[3]} />);
    } else {
      const language = match[1] || "";
      const code = match[2]?.replace(/\n$/, "") || "";

      if (isChartBlock(language, code)) {
        segments.push(<GriotChart key={`chart-${match.index}`} rawJson={code} />);
      } else {
        segments.push(<CodeBlock key={`code-${match.index}`} language={language} code={code} />);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  const remainingText = effectiveContent.slice(lastIndex);
  if (remainingText) {
    segments.push(renderFormattedText(remainingText, `text-${lastIndex}`));
  }

  return (
    <div
      className={`space-y-1.5 text-[15px] leading-relaxed text-foreground break-words max-w-full overflow-hidden ${className}`}
    >
      {segments}
    </div>
  );
});

/** Formata texto enriquecido com inline code, negrito, itálico, listas e títulos */
function renderFormattedText(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;

  const tableRows: string[][] = [];
  const flushTable = (idx: number) => {
    if (tableRows.length < 2) {
      tableRows.splice(0).forEach((cells, rowIndex) => {
        elements.push(
          <p
            key={`table-fallback-${keyPrefix}-${idx}-${rowIndex}`}
            className="leading-relaxed break-words"
          >
            {renderInlineFormatting(cells.join(" | "))}
          </p>,
        );
      });
      return;
    }
    const rows = tableRows.splice(0);
    const separatorIndex = rows.findIndex((cells) =>
      cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim())),
    );
    if (separatorIndex !== 1) return;
    const headers = rows[0] || [];
    elements.push(
      <div
        key={`table-${keyPrefix}-${idx}`}
        className="my-3 max-w-full overflow-x-auto rounded-xl border border-hairline/80"
      >
        <table className="w-full min-w-max border-collapse text-[12.5px]">
          <thead className="border-b border-hairline bg-secondary/50 text-muted-foreground">
            <tr>
              {headers.map((header, column) => (
                <th key={column} scope="col" className="px-3 py-2 text-left font-semibold">
                  {renderInlineFormatting(header.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.slice(2).map((cells, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-secondary/25">
                {headers.map((_, column) => {
                  const value = (cells[column] || "").trim();
                  const numeric = /^[-+]?\d[\d\s.,%€$]*$/.test(value);
                  return (
                    <td
                      key={column}
                      className={`px-3 py-2 align-top ${numeric ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {renderInlineFormatting(value || "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  };

  const flushList = (idx: number) => {
    if (!currentList) return;
    if (currentList.type === "ul") {
      elements.push(
        <ul
          key={`ul-${keyPrefix}-${idx}`}
          className="my-2 space-y-1 pl-4 list-disc text-foreground/90"
        >
          {currentList.items}
        </ul>,
      );
    } else {
      elements.push(
        <ol
          key={`ol-${keyPrefix}-${idx}`}
          className="my-2 space-y-1 pl-5 list-decimal text-foreground/90"
        >
          {currentList.items}
        </ol>,
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList(i);
      tableRows.push(trimmed.slice(1, -1).split("|"));
      continue;
    }
    if (tableRows.length > 0) flushTable(i);

    // Títulos Markdown (#, ##, ###)
    if (trimmed.startsWith("### ")) {
      flushList(i);
      elements.push(
        <h4
          key={`${keyPrefix}-${i}`}
          className="mt-3.5 mb-1.5 text-[16px] font-semibold text-foreground tracking-tight"
        >
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>,
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList(i);
      elements.push(
        <h3
          key={`${keyPrefix}-${i}`}
          className="mt-4 mb-2 text-[17.5px] font-bold text-foreground tracking-tight"
        >
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList(i);
      elements.push(
        <h2
          key={`${keyPrefix}-${i}`}
          className="mt-4 mb-2 text-[19px] font-bold text-foreground tracking-tight"
        >
          {renderInlineFormatting(trimmed.slice(2))}
        </h2>,
      );
      continue;
    }

    // Listas com marcadores (- ou *)
    const ulMatch = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (ulMatch) {
      if (!currentList || currentList.type !== "ul") {
        flushList(i);
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(
        <li key={`li-${i}`} className="pl-1 leading-relaxed">
          {renderInlineFormatting(ulMatch[2]!)}
        </li>,
      );
      continue;
    }

    // Listas numeradas (1. 2. etc.)
    const olMatch = line.match(/^(\s*)\d+[\.\)]\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.type !== "ol") {
        flushList(i);
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(
        <li key={`oli-${i}`} className="pl-1 leading-relaxed">
          {renderInlineFormatting(olMatch[2]!)}
        </li>,
      );
      continue;
    }

    // Citações em bloco (> )
    if (trimmed.startsWith("> ")) {
      flushList(i);
      elements.push(
        <blockquote
          key={`${keyPrefix}-${i}`}
          className="my-2.5 rounded-r-xl border-l-2 border-primary/60 bg-secondary/30 px-3.5 py-2 text-[14px] italic text-muted-foreground"
        >
          {renderInlineFormatting(trimmed.slice(2))}
        </blockquote>,
      );
      continue;
    }

    // Linha horizontal (--- ou ***)
    if (trimmed === "---" || trimmed === "***") {
      flushList(i);
      elements.push(<hr key={`${keyPrefix}-${i}`} className="my-3 border-hairline" />);
      continue;
    }

    // Linha vazia
    if (!trimmed) {
      flushList(i);
      elements.push(<div key={`${keyPrefix}-${i}`} className="h-1.5" />);
      continue;
    }

    // Bloco ou frase explícita com scroll horizontal controlado isolado
    if (
      (trimmed.startsWith("[scroll]") && trimmed.endsWith("[/scroll]")) ||
      (trimmed.startsWith("<scroll>") && trimmed.endsWith("</scroll>"))
    ) {
      flushList(i);
      const inner = trimmed
        .replace(/^(\[scroll\]|<scroll>)/, "")
        .replace(/(\[\/scroll\]|<\/scroll>)$/, "");
      elements.push(
        <div
          key={`${keyPrefix}-${i}`}
          className="my-2 max-w-full overflow-x-auto rounded-xl border border-hairline/60 bg-secondary/30 p-2.5 text-xs font-mono no-scrollbar"
        >
          <div className="w-max min-w-full whitespace-nowrap">{inner}</div>
        </div>,
      );
      continue;
    }

    // Parágrafo regular
    flushList(i);
    elements.push(
      <p key={`${keyPrefix}-${i}`} className="leading-relaxed break-words">
        {renderInlineFormatting(line)}
      </p>,
    );
  }

  flushList(lines.length);
  if (tableRows.length > 0) flushTable(lines.length);

  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}

/** Formata inline: código `code`, negrito **bold**, itálico *italic* e links */
function renderInlineFormatting(text: string): React.ReactNode {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={index}
          className="rounded-md border border-hairline/60 bg-secondary/60 px-1.5 py-0.5 font-mono text-[13px] text-foreground break-all inline-block max-w-full align-middle"
        >
          {code}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={index} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-3 transition-opacity hover:opacity-80"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}
