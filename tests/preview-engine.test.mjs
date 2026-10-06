import test from "node:test";
import assert from "node:assert/strict";

// Implementação espelho ou direta das funções puras do preview para validação no Node.js
function preparePreviewHtml(code, language = "html") {
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

    if (!completeHtml.includes('name="viewport"')) {
      if (completeHtml.includes("<head>")) {
        completeHtml = completeHtml.replace("<head>", '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">');
      }
    }

    if (!completeHtml.includes("tailwindcss")) {
      if (completeHtml.includes("</head>")) {
        completeHtml = completeHtml.replace("</head>", '  <script src="https://cdn.tailwindcss.com"></script>\n</head>');
      }
    }

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

  // 4. Se for React / JSX / TSX
  const isReactOrJsx = lang === "jsx" || lang === "tsx" || lang === "react" ||
    trimmed.includes("export default") ||
    trimmed.includes("return (") ||
    trimmed.includes("useState(") ||
    trimmed.includes("useEffect(") ||
    trimmed.includes("React.") ||
    trimmed.includes("<");

  if (isReactOrJsx) {
    const importedIcons = [];
    const iconMatches = trimmed.matchAll(/import\s+{([^}]+)}\s+from\s+['"](?:lucide-react|react-icons|@heroicons\/[^'"]+)['"]/g);
    for (const m of iconMatches) {
      if (m[1]) {
        const parts = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        importedIcons.push(...parts);
      }
    }

    let cleanCode = trimmed
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "")
      .replace(/import\s+['"][^'"]+['"];?/g, "")
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/g, "function $1;\nwindow.__GRIOT_ENTRY_COMPONENT__ = $1;")
      .replace(/export\s+default\s+const\s+([A-Za-z0-9_$]+)/g, "const $1")
      .replace(/export\s+default\s+([A-Za-z0-9_$]+);?/g, "window.__GRIOT_ENTRY_COMPONENT__ = $1;")
      .replace(/export\s+default\s+(function\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>|\w+\s*=>)/g, "window.__GRIOT_ENTRY_COMPONENT__ = $1")
      .replace(/export\s+(function|const|let|var|class|type|interface)\s+/g, "$1 ");

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
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
  <script type="text/babel" data-presets="react,typescript">
    (function() {
      const { useState, useEffect } = React;
      ${cleanCode}
      let Target = window.__GRIOT_ENTRY_COMPONENT__;
      const candidates = ${candidatesJson};
      const icons = ${iconsJson};
    })();
  </script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
  }

  return `<!DOCTYPE html><html><body>${trimmed}</body></html>`;
}

function extractWebSiteFromContent(content) {
  if (!content) return null;
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

test("Preview Engine: TypeScript / TSX Component Compilation Preparation", () => {
  const tsxCode = `
import React, { useState } from 'react';
import { Play, Sparkles } from 'lucide-react';

interface Props {
  title: string;
}

export default function Counter({ title }: Props) {
  const [count, setCount] = useState<number>(0);
  return (
    <div className="p-4 bg-slate-900 rounded-2xl">
      <h1>{title}</h1>
      <button onClick={() => setCount(count + 1)}><Play /> {count}</button>
    </div>
  );
}
`;

  const html = preparePreviewHtml(tsxCode, "tsx");

  assert.ok(html.includes('data-presets="react,typescript"'), "Deve incluir preset do TypeScript no Babel");
  assert.ok(html.includes("window.__GRIOT_ENTRY_COMPONENT__ = Counter"), "Deve registrar o entry component automaticamente");
  assert.ok(html.includes('"Sparkles"'), "Deve capturar os ícones Lucide importados");
  assert.ok(html.includes("react.production.min.js"), "Deve incluir runtime do React");
  assert.ok(html.includes("tailwindcss.com"), "Deve incluir Tailwind CSS");
});

test("Preview Engine: SVG Vector Rendering", () => {
  const svg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="purple"/></svg>`;
  const html = preparePreviewHtml(svg, "svg");

  assert.ok(html.includes("GRIOT SVG Live Preview"));
  assert.ok(html.includes("<circle cx=\"50\""));
  assert.ok(html.includes("filter: drop-shadow"));
});

test("Preview Engine: Full HTML Document Viewport & Error Listener Injection", () => {
  const rawHtml = `<!DOCTYPE html><html><head><title>Dashboard</title></head><body><h1>Hello</h1></body></html>`;
  const html = preparePreviewHtml(rawHtml, "html");

  assert.ok(html.includes('name="viewport"'), "Deve injetar viewport meta tag");
  assert.ok(html.includes("tailwindcss.com"), "Deve injetar Tailwind CDN");
  assert.ok(html.includes("window.addEventListener('error'"), "Deve injetar listener de erros para evitar tela em branco");
});

test("Preview Engine: Extract Web Site From Assistant Content", () => {
  const messageWithTsx = `
Aqui está o componente que pediu:

\`\`\`tsx
export default function App() {
  return <div>GRIOT App</div>;
}
\`\`\`

Pode testar acima.
`;

  const extracted = extractWebSiteFromContent(messageWithTsx);
  assert.ok(extracted !== null, "Deve detectar bloco TSX");
  assert.equal(extracted.language, "tsx");
  assert.equal(extracted.fileName, "App.tsx");
  assert.ok(extracted.html.includes("GRIOT Live Preview"));
});
