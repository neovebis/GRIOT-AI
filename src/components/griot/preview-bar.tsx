import React, { useState } from "react";
import { Play, Globe, RotateCw, Smartphone, Monitor, X, ExternalLink, FileCode, FileText, Code2, Copy, Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export interface WebSiteExtracted {
  hasSite: boolean;
  title: string;
  html: string;
  language?: string;
  fileName?: string;
}

/**
 * Prepara o HTML completo para o Live Preview Nativo
 */
export function preparePreviewHtml(code: string, language = "html"): string {
  const trimmed = code.trim();
  const lang = (language || "").toLowerCase().trim();

  // 1. Se já for um documento HTML estruturado completo
  if (trimmed.includes("<!DOCTYPE html>") || (trimmed.includes("<html") && trimmed.includes("</html>"))) {
    return trimmed;
  }

  // 2. Se for SVG
  if (trimmed.startsWith("<svg") && (trimmed.endsWith("</svg>") || trimmed.includes("</svg>"))) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { display: grid; place-items: center; min-height: 100vh; background-color: #090d16; margin: 0; padding: 1.5rem; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
  }

  // 3. Se for fragmento HTML
  if (lang === "html" || (trimmed.startsWith("<") && trimmed.endsWith(">"))) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-4 antialiased min-h-screen">
  ${trimmed}
</body>
</html>`;
  }

  // 4. Se for React / JSX / TSX
  if (lang === "jsx" || lang === "tsx" || lang === "react" || trimmed.includes("export default") || trimmed.includes("return (")) {
    const cleanCode = trimmed
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "")
      .replace(/export\s+default\s+function\s+(\w+)/, "function $1")
      .replace(/export\s+default\s+(\w+);?/, "");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-4 min-h-screen">
  <div id="root"></div>
  <script type="text/babel">
    try {
      ${cleanCode}
      const TargetApp = typeof App !== 'undefined' ? App : (typeof Component !== 'undefined' ? Component : Object.values(window).find(v => typeof v === 'function'));
      if (TargetApp) {
        ReactDOM.createRoot(document.getElementById('root')).render(<TargetApp />);
      } else {
        document.getElementById('root').innerHTML = '<div class="text-amber-400 p-4 border border-amber-500/30 rounded-xl bg-amber-500/10 font-mono text-xs">Aguardando declaração de componente React...</div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML = '<div class="text-red-400 p-4 border border-red-500/30 rounded-xl bg-red-500/10 font-mono text-xs">Erro ao renderizar preview React: ' + err.message + '</div>';
    }
  </script>
</body>
</html>`;
  }

  // 5. Fallback para outros códigos/ficheiros de texto
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text">
  ${trimmed.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
</body>
</html>`;
}

/**
 * Deteta se o texto da mensagem contém ficheiro, HTML, código ou aplicação web gerada
 */
export function extractWebSiteFromContent(content: string): WebSiteExtracted | null {
  if (!content) return null;

  // 1. Blocos de código markdown ```html / ```jsx / ```tsx / ```svg
  const codeBlockRegex = /```(html|jsx|tsx|svg|xml)\s*([\s\S]*?)```/i;
  const match = content.match(codeBlockRegex);

  let rawHtml = "";
  let language = "html";

  if (match && match[2]) {
    language = (match[1] || "html").toLowerCase();
    rawHtml = match[2].trim();
  } else if (content.includes("<!DOCTYPE html>") || (content.includes("<html") && content.includes("</html>"))) {
    const startIdx = content.indexOf("<!DOCTYPE html>") !== -1 ? content.indexOf("<!DOCTYPE html>") : content.indexOf("<html");
    const endIdx = content.lastIndexOf("</html>");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      rawHtml = content.substring(startIdx, endIdx + 7).trim();
    }
  }

  if (!rawHtml) return null;

  let title = "Aplicação Web / Ficheiro";
  const titleMatch = rawHtml.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  } else if (language === "jsx" || language === "tsx") {
    title = "Componente React Live";
  } else if (language === "svg") {
    title = "Vetor SVG Interativo";
  }

  return {
    hasSite: true,
    title,
    language,
    fileName: language === "jsx" ? "App.jsx" : language === "tsx" ? "App.tsx" : language === "svg" ? "image.svg" : "index.html",
    html: preparePreviewHtml(rawHtml, language),
  };
}

interface PreviewBarProps {
  title?: string;
  subtitle?: string;
  onPreview: () => void;
  className?: string;
}

export function PreviewBar({
  title = "Aplicação Web / Ficheiro",
  subtitle = "index.html · Live Preview no dispositivo",
  onPreview,
  className = "",
}: PreviewBarProps) {
  const t = useT();

  return (
    <div
      className={`my-2 flex items-center justify-between gap-3 rounded-2xl border border-hairline/90 bg-surface/90 px-3.5 py-2.5 shadow-2xs backdrop-blur-md transition-all ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
          <Globe className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-foreground">
            {title}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-transform active:scale-95 shrink-0 hover:opacity-95"
      >
        <Play className="size-3.5 fill-current" />
        <span>{t("Preview")}</span>
      </button>
    </div>
  );
}

interface GriotFileBarProps {
  fileName: string;
  language?: string;
  code: string;
  onPreview?: () => void;
  className?: string;
}

export function GriotFileBar({
  fileName,
  language = "code",
  code,
  onPreview,
  className = "",
}: GriotFileBarProps) {
  const [copied, setCopied] = useState(false);
  const isPreviewable = Boolean(onPreview);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      toast.success("Código/Ficheiro copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const ext = language.toUpperCase();

  return (
    <div
      className={`my-2 flex items-center justify-between gap-3 rounded-2xl border border-hairline/90 bg-secondary/80 px-3.5 py-2.5 shadow-2xs backdrop-blur-md transition-all ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface border border-hairline/80 text-foreground shadow-2xs">
          <FileCode className="size-4 text-emerald-500" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-foreground" title={fileName}>
            {fileName}
          </p>
          <p className="truncate text-[11px] font-mono text-muted-foreground">
            {ext} · {code.length} chars
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar"
          className="flex items-center gap-1 rounded-xl border border-hairline bg-surface/80 px-2.5 py-1.5 text-[11.5px] font-medium text-foreground transition-all active:scale-95 hover:bg-surface"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-500" />
              <span className="text-emerald-500">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="size-3 text-muted-foreground" />
              <span>Copiar</span>
            </>
          )}
        </button>

        {isPreviewable && (
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-transform active:scale-95 hover:opacity-95"
          >
            <Play className="size-3.5 fill-current" />
            <span>Preview</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface FunctionalPreviewModalProps {
  open: boolean;
  onClose: () => void;
  srcDoc: string;
  title?: string;
}

export function FunctionalPreviewModal({
  open,
  onClose,
  srcDoc,
  title = "Live Preview",
}: FunctionalPreviewModalProps) {
  const t = useT();
  const [reloadKey, setReloadKey] = useState(0);
  const [viewport, setViewport] = useState<"mobile" | "responsive">("responsive");

  if (!open) return null;

  const handleReload = () => {
    setReloadKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    try {
      const blob = new Blob([srcDoc], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150">
      {/* Top bar com o design elegante do GRIOT */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5 pt-[calc(env(safe-area-inset-top,0px)+10px)] bg-surface/90 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Fechar")}
            className="rounded-xl border border-hairline bg-secondary/60 p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            <X className="size-4" />
          </button>
          <div className="min-w-0">
            <span className="truncate text-[13.5px] font-semibold text-foreground block">
              {title}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Preview Nativo (Dispositivo)
            </span>
          </div>
        </div>

        {/* Controles de Preview */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setViewport((v) => (v === "mobile" ? "responsive" : "mobile"))}
            title={viewport === "mobile" ? t("Modo Responsivo") : t("Modo Telemóvel")}
            className="rounded-xl border border-hairline bg-secondary/50 p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            {viewport === "mobile" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
          </button>

          <button
            type="button"
            onClick={handleReload}
            title={t("Recarregar")}
            className="rounded-xl border border-hairline bg-secondary/50 p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            <RotateCw className="size-4" />
          </button>

          <button
            type="button"
            onClick={handleOpenExternal}
            title={t("Abrir")}
            className="rounded-xl border border-hairline bg-secondary/50 p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            <ExternalLink className="size-4" />
          </button>
        </div>
      </div>

      {/* Container de visualização */}
      <div className="flex-1 w-full bg-[#0d0f17] flex items-center justify-center p-0 md:p-3 overflow-hidden">
        <div
          className={`h-full bg-white transition-all duration-200 overflow-hidden shadow-2xl ${
            viewport === "mobile"
              ? "w-[375px] max-w-full rounded-2xl border-4 border-hairline/80 my-auto"
              : "w-full rounded-none"
          }`}
        >
          <iframe
            key={reloadKey}
            title="GRIOT Live Preview Nativo"
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
            srcDoc={srcDoc}
            className="h-full w-full border-none bg-white"
          />
        </div>
      </div>
    </div>
  );
}
