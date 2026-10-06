import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
 * Prepara o HTML completo para o Live Preview Nativo com tolerância total a erros,
 * suporte para React 18, JSX, TSX, Babel com TypeScript, Lucide Icons e Tailwind CSS.
 */
export function preparePreviewHtml(code: string, language = "html"): string {
  const trimmed = code.trim();
  const lang = (language || "").toLowerCase().trim();

  // 1. Se for SVG
  if (lang === "svg" || (trimmed.startsWith("<svg") && (trimmed.endsWith("</svg>") || trimmed.includes("</svg>")))) {
    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GRIOT SVG Live Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      display: grid;
      place-items: center;
      min-height: 100vh;
      background: radial-gradient(circle at center, #111827 0%, #030712 100%);
      margin: 0;
      padding: 1.5rem;
    }
    svg { max-width: 100%; height: auto; filter: drop-shadow(0 15px 30px rgba(0,0,0,0.6)); }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
  }

  // 2. Se for documento HTML completo
  if (trimmed.includes("<!DOCTYPE html>") || (trimmed.includes("<html") && trimmed.includes("</html>"))) {
    let completeHtml = trimmed;

    // Injetar viewport se não existir
    if (!completeHtml.includes('name="viewport"')) {
      if (completeHtml.includes("<head>")) {
        completeHtml = completeHtml.replace("<head>", '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">');
      }
    }

    // Injetar Tailwind CDN se não existir
    if (!completeHtml.includes("tailwindcss")) {
      if (completeHtml.includes("</head>")) {
        completeHtml = completeHtml.replace("</head>", '  <script src="https://cdn.tailwindcss.com"></script>\n</head>');
      }
    }

    // Injetar captura de erro e Lucide icons
    const headInject = `
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch(e){}
    });
    window.addEventListener('error', (e) => {
      const banner = document.getElementById('griot-err-banner');
      if (!banner) {
        const b = document.createElement('div');
        b.id = 'griot-err-banner';
        b.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:999999;background:#1e1115;border:1px solid #f43f5e;color:#ffe4e6;padding:12px 16px;border-radius:12px;font-family:sans-serif;font-size:12px;box-shadow:0 20px 40px rgba(0,0,0,0.9);';
        b.innerHTML = '<div style="font-weight:600;color:#f43f5e;margin-bottom:4px;">⚠️ Erro de Execução no Preview</div><div style="font-family:monospace;font-size:11px;opacity:0.9;">' + (e.message || String(e)) + '</div>';
        document.body.appendChild(b);
      }
    });
  </script>`;

    if (completeHtml.includes("</head>")) {
      completeHtml = completeHtml.replace("</head>", `${headInject}\n</head>`);
    }

    return completeHtml;
  }

  // 3. Se for fragmento HTML simples (sem React/JSX)
  const isHtmlFragment = (lang === "html" || (trimmed.startsWith("<") && trimmed.endsWith(">"))) &&
    !trimmed.includes("export default") &&
    !trimmed.includes("return (") &&
    !trimmed.includes("useState(") &&
    !trimmed.includes("React.");

  if (isHtmlFragment) {
    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GRIOT Live Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch(e){}
    });
  </script>
</head>
<body class="bg-slate-950 text-slate-100 p-4 antialiased min-h-screen">
  ${trimmed}
</body>
</html>`;
  }

  // 4. Se for React / JSX / TSX / JavaScript com componente
  const isReactOrJsx = lang === "jsx" || lang === "tsx" || lang === "react" ||
    trimmed.includes("export default") ||
    trimmed.includes("return (") ||
    trimmed.includes("useState(") ||
    trimmed.includes("useEffect(") ||
    trimmed.includes("React.") ||
    trimmed.includes("<");

  if (isReactOrJsx) {
    // Extrair nomes de ícones importados do Lucide
    const importedIcons: string[] = [];
    const iconMatches = trimmed.matchAll(/import\s+{([^}]+)}\s+from\s+['"](?:lucide-react|react-icons|@heroicons\/[^'"]+)['"]/g);
    for (const m of iconMatches) {
      if (m[1]) {
        const parts = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        importedIcons.push(...parts);
      }
    }

    // Sanitizar código React
    let cleanCode = trimmed
      // Remover imports
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "")
      .replace(/import\s+['"][^'"]+['"];?/g, "")
      // Capturar export default function Nome(...)
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/g, "function $1;\nwindow.__GRIOT_ENTRY_COMPONENT__ = $1;")
      // Capturar export default const Nome = ... ou export default Nome;
      .replace(/export\s+default\s+const\s+([A-Za-z0-9_$]+)/g, "const $1")
      .replace(/export\s+default\s+([A-Za-z0-9_$]+);?/g, "window.__GRIOT_ENTRY_COMPONENT__ = $1;")
      // Capturar export default () => ...
      .replace(/export\s+default\s+(function\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>|\w+\s*=>)/g, "window.__GRIOT_ENTRY_COMPONENT__ = $1")
      // Limpar exports nomeados
      .replace(/export\s+(function|const|let|var|class|type|interface)\s+/g, "$1 ");

    // Descobrir candidatos a componente PascalCase declarados no código
    const candidateMatches = [
      ...cleanCode.matchAll(/(?:function\s+([A-Z][A-Za-z0-9_$]*)|(?:const|let|var)\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)|props|\(\))\s*=>)/g)
    ].map((m) => m[1] || m[2]).filter(Boolean);

    const candidatesJson = JSON.stringify(candidateMatches);
    const iconsJson = JSON.stringify(importedIcons);

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GRIOT Live Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {} }
    };
  </script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; min-height: 100vh;
      background-color: #0b0f17; color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    #root { min-height: 100vh; display: flex; flex-direction: column; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 9999px; }
  </style>
  <script>
    window.addEventListener('error', function(e) {
      console.error('Preview error:', e);
      var errBox = document.getElementById('griot-err-box');
      if (!errBox) {
        errBox = document.createElement('div');
        errBox.id = 'griot-err-box';
        errBox.style.cssText = 'position:fixed;inset:16px;z-index:999999;background:#180d12;border:1px solid #f43f5e;color:#ffe4e6;padding:16px;border-radius:16px;font-family:sans-serif;font-size:12px;max-height:85vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,0.85);';
        errBox.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:#f43f5e;font-weight:600;font-size:14px;margin-bottom:8px;"><span>⚠️</span> Erro de Compilação no Live Preview</div>' +
          '<div style="font-family:monospace;background:rgba(244,63,94,0.1);padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-word;color:#fecdd3;">' +
          (e.message || String(e)) + (e.lineno ? ' (linha ' + e.lineno + ')' : '') +
          '</div>' +
          '<div style="margin-top:10px;color:#94a3b8;font-size:11px;">O código foi isolado para proteger a execução.</div>';
        document.body.appendChild(errBox);
      }
    });
  </script>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel" data-presets="react,typescript">
    (function() {
      // 1. Injetar todos os Hooks do React globalmente
      const {
        useState, useEffect, useContext, useReducer, useCallback,
        useMemo, useRef, useImperativeHandle, useLayoutEffect,
        useDebugValue, useId, useTransition, useDeferredValue,
        Children, cloneElement, createContext, createElement,
        createRef, forwardRef, isValidElement, memo
      } = React;

      // 2. Icon Generator & Proxy compatível com Lucide
      function createIcon(name) {
        return function DynamicIcon(props) {
          const { size = 20, className = "", color = "currentColor", strokeWidth = 2, ...rest } = props || {};
          const pascal = name.charAt(0).toUpperCase() + name.slice(1);
          const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
          const def = window.lucide?.icons?.[pascal] || window.lucide?.icons?.[kebab] || window.lucide?.icons?.[name.toLowerCase()];
          if (def && Array.isArray(def)) {
            return React.createElement('svg', {
              xmlns: "http://www.w3.org/2000/svg",
              width: size,
              height: size,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: color,
              strokeWidth: strokeWidth,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              className: className,
              ...rest
            }, def.map(([tag, attrs], idx) => React.createElement(tag, { key: idx, ...attrs })));
          }
          return React.createElement('svg', {
            xmlns: "http://www.w3.org/2000/svg",
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: color,
            strokeWidth: strokeWidth,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            className: className,
            ...rest
          }, React.createElement('circle', { cx: 12, cy: 12, r: 8, opacity: 0.3 }), React.createElement('path', { d: "M12 8v8M8 12h8" }));
        };
      }

      // Mapear ícones comuns
      const standardIcons = [
        "Play", "Pause", "Check", "X", "Plus", "Minus", "Trash", "Trash2", "Edit", "Edit2", "Edit3",
        "ChevronRight", "ChevronLeft", "ChevronDown", "ChevronUp", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
        "Search", "User", "Users", "Settings", "Home", "Heart", "Star", "Sparkles", "Globe", "Mail", "Phone",
        "Calendar", "Clock", "ExternalLink", "FileText", "FileCode", "Folder", "Download", "Upload",
        "Image", "Music", "Video", "Terminal", "Code", "AlertCircle", "AlertTriangle", "Info", "Shield",
        "Eye", "EyeOff", "Sun", "Moon", "RefreshCw", "RotateCw", "Menu", "MoreVertical", "MoreHorizontal",
        "Send", "Share2", "Copy", "Lock", "Unlock", "Bell", "Compass", "MapPin", "Filter", "Sliders"
      ];
      standardIcons.forEach(iconName => { window[iconName] = createIcon(iconName); });

      const explicitlyImported = ${iconsJson};
      explicitlyImported.forEach(iconName => { window[iconName] = createIcon(iconName); });

      // Stubs seguros de bibliotecas
      window.motion = new Proxy({}, {
        get: (_, tag) => (props) => {
          const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props || {};
          return React.createElement(tag, rest);
        }
      });
      window.AnimatePresence = ({ children }) => children;
      window.confetti = window.confetti || (() => {});

      // ErrorBoundary do React
      class GriotErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false, error: null };
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error };
        }
        componentDidCatch(error, info) {
          console.error("Griot Live Preview Error:", error, info);
        }
        render() {
          if (this.state.hasError) {
            return (
              <div className="min-h-screen bg-slate-950 text-slate-100 p-5 flex items-center justify-center font-sans">
                <div className="max-w-md w-full rounded-2xl bg-red-950/40 border border-red-500/30 p-5 shadow-2xl">
                  <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-2">
                    <span className="size-2 rounded-full bg-red-500 animate-pulse"></span>
                    Erro na Execução do Componente React
                  </div>
                  <div className="text-xs text-red-200/90 font-mono bg-red-900/30 p-3 rounded-xl border border-red-500/20 whitespace-pre-wrap break-words">
                    {String(this.state.error?.message || this.state.error)}
                  </div>
                </div>
              </div>
            );
          }
          return this.props.children;
        }
      }

      window.__GRIOT_ENTRY_COMPONENT__ = null;

      try {
        ${cleanCode}

        let Target = window.__GRIOT_ENTRY_COMPONENT__;
        if (!Target && typeof App !== 'undefined') Target = App;
        if (!Target && typeof Component !== 'undefined') Target = Component;
        if (!Target && typeof Main !== 'undefined') Target = Main;
        if (!Target && typeof Page !== 'undefined') Target = Page;
        if (!Target && typeof Dashboard !== 'undefined') Target = Dashboard;

        if (!Target) {
          const candidates = ${candidatesJson};
          for (const name of candidates) {
            try {
              if (typeof window[name] === 'function') {
                Target = window[name];
                break;
              }
            } catch(e) {}
          }
        }

        const rootEl = document.getElementById('root');
        if (Target && rootEl) {
          ReactDOM.createRoot(rootEl).render(
            <GriotErrorBoundary>
              <Target />
            </GriotErrorBoundary>
          );
        } else if (rootEl) {
          rootEl.innerHTML = '<div class="p-6 text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-2xl font-mono text-xs m-4">Aguardando exportação de componente React (ex: export default function App() { ... })</div>';
        }
      } catch (err) {
        console.error("Griot Script Error:", err);
        const rootEl = document.getElementById('root');
        if (rootEl) {
          rootEl.innerHTML = '<div class="p-6 text-red-400 border border-red-500/30 bg-red-500/10 rounded-2xl font-mono text-xs m-4"><strong>Erro no código React:</strong><br/><br/>' + (err.message || String(err)) + '</div>';
        }
      }
    })();
  </script>
</body>
</html>`;
  }

  // 5. Fallback para outros códigos/ficheiros de texto
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GRIOT File Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text min-h-screen">
  ${trimmed.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
</body>
</html>`;
}

/**
 * Deteta se o texto da mensagem contém ficheiro, HTML, código ou aplicação web gerada
 */
export function extractWebSiteFromContent(content: string): WebSiteExtracted | null {
  if (!content) return null;

  // 1. Blocos de código markdown ```html / ```jsx / ```tsx / ```svg / ```react
  const codeBlockRegex = /```(html|jsx|tsx|svg|xml|react)\s*([\s\S]*?)```/i;
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
  } else if (content.includes("<svg") && content.includes("</svg>")) {
    const startIdx = content.indexOf("<svg");
    const endIdx = content.lastIndexOf("</svg>");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      rawHtml = content.substring(startIdx, endIdx + 6).trim();
      language = "svg";
    }
  }

  if (!rawHtml) return null;

  let title = "Aplicação Web / Ficheiro";
  const titleMatch = rawHtml.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  } else if (language === "jsx" || language === "tsx" || language === "react") {
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    // 1. Fechar imediatamente o teclado virtual do dispositivo móvel
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // 2. Travar o scroll da página de fundo e sinalizar que o preview está ativo
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-griot-preview-active", "true");

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.removeAttribute("data-griot-preview-active");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

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

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-background animate-in fade-in duration-150"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
      }}
    >
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
          className={`h-full bg-slate-950 transition-all duration-200 overflow-hidden shadow-2xl ${
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
            className="h-full w-full border-none bg-slate-950"
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
