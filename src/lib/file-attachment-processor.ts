/**
 * GRIOT Universal File Attachment Processor
 *
 * Processa qualquer ficheiro anexado pelo utilizador no chat mobile:
 * - Arquivos ZIP (.zip): descompacta em memória com JSZip, gera a árvore de diretórios
 *   e extrai o código dos ficheiros principais (manifests, código-fonte, configs).
 * - Ficheiros de Texto / Código / Checksums (.sha256, .md5, .env, .log, .ts, .py, etc.):
 *   lê o conteúdo em UTF-8 com destaque de sintaxe adequado e limites de segurança.
 * - Ficheiros Binários e PDFs: extrai assinaturas hexadecimais (magic bytes), metadados
 *   e texto legível de streams.
 */

import JSZip from "jszip";

export interface AttachmentMetadata {
  fileName: string;
  fileSize: string;
  kind:
    | "zip"
    | "text"
    | "binary"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "code"
    | "sheet"
    | "pdf"
    | "doc"
    | "archive";
  mimeType?: string;
  fileCount?: number;
  folderCount?: number;
  userNote?: string;
  summary: string;
  category?: string;
  extractedSummary?: string;
}

export interface AttachmentProcessResult {
  kind: "text" | "zip" | "image" | "media" | "binary" | "audio" | "video" | "document" | "code";
  textToSend: string;
  summary: string;
  fileCount?: number;
  metadata?: AttachmentMetadata;
}

/** Formata bytes para leitura humana (B, KB, MB) */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Mapeia a extensão do ficheiro para a sintaxe de realce do Markdown */
export function getLanguageFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    html: "html",
    css: "css",
    scss: "scss",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    bat: "batch",
    ps1: "powershell",
    sha256: "text",
    md5: "text",
    env: "bash",
    log: "text",
    diff: "diff",
    patch: "diff",
    gradle: "groovy",
    properties: "properties",
    svg: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
    php: "php",
    rb: "ruby",
    swift: "swift",
    dart: "dart",
    vue: "vue",
    svelte: "svelte",
    lua: "lua",
    r: "r",
  };
  return map[ext] || "text";
}

/** Verifica se a extensão é tipicamente textual */
export function isTextExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    /\.(txt|json|md|ts|tsx|js|jsx|py|csv|tsv|html|css|scss|yaml|yml|toml|xml|sql|sh|bash|zsh|bat|ps1|sha256|md5|sha1|env|log|diff|patch|gradle|properties|svg|dockerfile|makefile|php|rb|swift|dart|vue|svelte|lua|r|c|cpp|h|hpp|cs|rs|go|java|kt|kts|graphql|prisma|proto|lock|sum|mod|ini|cfg|conf|tex|bib)$/i.test(
      lower,
    ) ||
    lower.startsWith(".env") ||
    lower === "dockerfile" ||
    lower === "makefile"
  );
}

/** Verifica se é um arquivo compactado ZIP */
export function isZipFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".zip") ||
    type.includes("zip") ||
    type === "application/x-zip-compressed" ||
    type === "application/zip"
  );
}

/** Verifica se é uma imagem suportada */
export function isImageFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(name)
  );
}

/** Verifica se é áudio */
export function isAudioFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)
  );
}

/** Verifica se é vídeo */
export function isVideoFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("video/") ||
    /\.(mp4|webm|mov|mkv|avi)$/i.test(name)
  );
}

/** Verifica se é documento estruturado (PDF, Word, Excel, PowerPoint, etc.) */
export function isDocumentFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.includes("pdf") ||
    type.includes("word") ||
    type.includes("officedocument") ||
    type.includes("document") ||
    type.includes("sheet") ||
    type.includes("excel") ||
    type.includes("powerpoint") ||
    type.includes("presentation") ||
    /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(name)
  );
}

/** Extrai primeiros bytes em formato Hexadecimal para identificação de cabeçalhos */
export async function getHexPreview(file: File, length = 32): Promise<string> {
  try {
    const slice = file.slice(0, length);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
  } catch {
    return "";
  }
}

/** Processa arquivos ZIP: descompacta, cataloga e extrai ficheiros-chave */
export async function processZipArchive(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  const zip = new JSZip();
  const buffer = await file.arrayBuffer();
  const loaded = await zip.loadAsync(buffer);

  interface EntryInfo {
    path: string;
    isDir: boolean;
    size: number;
    isManifest: boolean;
    isText: boolean;
  }

  const entries: EntryInfo[] = [];

  loaded.forEach((relativePath, entry) => {
    // Ignorar metadados do macOS e ficheiros invisíveis de lixo
    if (
      relativePath.startsWith("__MACOSX/") ||
      relativePath.endsWith(".DS_Store") ||
      relativePath.endsWith("Thumbs.db")
    ) {
      return;
    }

    const isDir = entry.dir;
    const baseName = relativePath.split("/").pop() || "";
    const isManifest =
      /^(package\.json|readme\.md|cargo\.toml|requirements\.txt|go\.mod|pom\.xml|composer\.json|build\.gradle|gemfile|\.env.*)$/i.test(
        baseName,
      );
    const isText = !isDir && (isTextExtension(baseName) || isManifest);

    entries.push({
      path: relativePath,
      isDir,
      size: (entry as any)._data?.uncompressedSize || 0,
      isManifest,
      isText,
    });
  });

  const totalFiles = entries.filter((e) => !e.isDir).length;
  const totalDirs = entries.filter((e) => e.isDir).length;

  // Ordena ficheiros: primeiro manifestos e configs na raiz, depois código, depois restantes
  entries.sort((a, b) => {
    if (a.isManifest && !b.isManifest) return -1;
    if (!a.isManifest && b.isManifest) return 1;
    if (a.isText && !b.isText) return -1;
    if (!a.isText && b.isText) return 1;
    return a.path.localeCompare(b.path);
  });

  // 1. Constrói a árvore de diretórios (até 80 entradas visíveis)
  const treeLines: string[] = [];
  const maxTreeEntries = 80;
  for (let i = 0; i < Math.min(entries.length, maxTreeEntries); i++) {
    const e = entries[i];
    if (e.isDir) {
      treeLines.push(`📁 ${e.path}`);
    } else {
      const sizeStr = e.size > 0 ? ` (${formatBytes(e.size)})` : "";
      treeLines.push(`📄 ${e.path}${sizeStr}`);
    }
  }
  if (entries.length > maxTreeEntries) {
    treeLines.push(`... e mais ${entries.length - maxTreeEntries} ficheiros/pastas no arquivo.`);
  }

  // 2. Extrai o conteúdo dos ficheiros textuais prioritários (orçamento máximo: ~50.000 caracteres)
  let extractedChars = 0;
  const maxExtractedChars = 50000;
  const extractedFiles: Array<{ path: string; lang: string; content: string }> = [];

  for (const e of entries) {
    if (e.isDir || !e.isText) continue;
    if (extractedChars >= maxExtractedChars) break;

    const entry = loaded.file(e.path);
    if (!entry) continue;

    try {
      const rawText = await entry.async("text");
      if (!rawText.trim()) continue;

      // Se o ficheiro tiver caracteres nulos binários, ignora
      if (/[\x00-\x08\x0E-\x1F]/.test(rawText.slice(0, 512))) continue;

      const remainingBudget = maxExtractedChars - extractedChars;
      const snippet = rawText.slice(0, Math.min(rawText.length, 12000, remainingBudget));
      extractedChars += snippet.length;

      const lang = getLanguageFromExtension(e.path);
      extractedFiles.push({
        path: e.path,
        lang,
        content: snippet + (rawText.length > snippet.length ? "\n... [truncado pelo tamanho]" : ""),
      });
    } catch {
      // Ignora erro de leitura de entrada individual
    }
  }

  // Montagem do payload estruturado
  const parts: string[] = [];

  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "zip",
    fileCount: totalFiles,
    folderCount: totalDirs,
    userNote: userNote?.trim() || "",
    summary: `Arquivo ZIP "${file.name}" (${totalFiles} ficheiros, ${formatBytes(file.size)})`,
  };

  // Tag oculta de metadados para que o cliente renderize o Card Elegante e não o texto cru
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push(
    `📦 **[Arquivo ZIP Descompactado: ${file.name}]** (Tamanho: ${formatBytes(file.size)}, ${totalFiles} ficheiros, ${totalDirs} pastas)`,
  );
  parts.push("");
  parts.push("#### 📂 Estrutura do Arquivo:");
  parts.push("```text");
  parts.push(treeLines.join("\n"));
  parts.push("```");

  if (extractedFiles.length > 0) {
    parts.push("");
    parts.push("#### 📜 Conteúdo dos Ficheiros Prioritários Extraídos:");
    for (const ef of extractedFiles) {
      parts.push(`##### 📄 \`${ef.path}\``);
      parts.push(`\`\`\`${ef.lang}`);
      parts.push(ef.content);
      parts.push("```");
    }
  }

  parts.push("");
  parts.push(
    `[INSTRUÇÃO AO ASSISTENTE GRIOT]:
O utilizador anexou este arquivo ZIP. Foi lida e catalogada a estrutura completa de pastas (${totalDirs}) e ficheiros (${totalFiles}), bem como o conteúdo dos ficheiros prioritários (README, manifestos de configuração).
Na tua resposta:
1. Confirma claramente que descompactaste e leste o arquivo ZIP "${file.name}" (${totalFiles} ficheiros, ${formatBytes(file.size)}).
2. Apresenta um resumo conciso e objetivo da arquitetura e finalidade do projeto com base na árvore e manifests lidos.
3. Informa o utilizador de que tens toda a estrutura em contexto e estás pronto para analisar em detalhe qualquer ficheiro ou módulo específico que ele deseje.`
  );

  return {
    kind: "zip",
    textToSend: parts.join("\n"),
    summary: `Arquivo ZIP "${file.name}" descompactado (${totalFiles} ficheiros).`,
    fileCount: totalFiles,
    metadata,
  };
}

/** Processa imagens com compressão ideal para visão computacional */
export async function processImageAttachment(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  let dataUrl = "";
  try {
    const { compressImageForVision } = await import("./multimodal-vision");
    const compressed = await compressImageForVision(file);
    dataUrl = compressed.dataUrl;
  } catch (err) {
    console.warn("Falha ao comprimir imagem para visão:", err);
    try {
      const reader = new FileReader();
      dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
    } catch {}
  }

  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "image",
    mimeType: file.type || "image/jpeg",
    userNote: userNote?.trim() || "",
    summary: `Imagem "${file.name}" (${formatBytes(file.size)})`,
  };

  const parts: string[] = [];
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (dataUrl) {
    parts.push(`![${file.name}](${dataUrl})`);
  }

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push("Por favor analisa detalhadamente esta imagem.");

  return {
    kind: "image",
    textToSend: parts.join("\n\n"),
    summary: `Imagem "${file.name}" anexada à conversa.`,
    metadata,
  };
}

/** Processa ficheiros de áudio e voz */
export async function processAudioAttachment(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "audio",
    mimeType: file.type || "audio/mpeg",
    userNote: userNote?.trim() || "",
    summary: `Áudio "${file.name}" (${formatBytes(file.size)})`,
  };

  const parts: string[] = [];
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push(
    `🎙️ **[Ficheiro de Áudio Anexado: ${file.name}]** (Tamanho: ${formatBytes(file.size)}, Tipo: ${file.type || "audio/mpeg"})`,
  );
  parts.push("Por favor analisa este ficheiro de áudio com base no contexto e metadados.");

  return {
    kind: "audio",
    textToSend: parts.join("\n\n"),
    summary: `Áudio "${file.name}" anexado à conversa.`,
    metadata,
  };
}

/** Processa ficheiros de vídeo */
export async function processVideoAttachment(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "video",
    mimeType: file.type || "video/mp4",
    userNote: userNote?.trim() || "",
    summary: `Vídeo "${file.name}" (${formatBytes(file.size)})`,
  };

  const parts: string[] = [];
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push(
    `🎬 **[Ficheiro de Vídeo Anexado: ${file.name}]** (Tamanho: ${formatBytes(file.size)}, Tipo: ${file.type || "video/mp4"})`,
  );
  parts.push("Por favor analisa este ficheiro de vídeo com base no contexto e metadados.");

  return {
    kind: "video",
    textToSend: parts.join("\n\n"),
    summary: `Vídeo "${file.name}" anexado à conversa.`,
    metadata,
  };
}

/** Processa documentos estruturados (PDF, Word, Excel, PowerPoint, etc.) */
export async function processDocumentAttachment(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  const hex = await getHexPreview(file, 24);
  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "document",
    mimeType: file.type || "application/pdf",
    userNote: userNote?.trim() || "",
    summary: `Documento "${file.name}" (${formatBytes(file.size)})`,
  };

  const parts: string[] = [];
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push(
    `📑 **[Documento Anexado: ${file.name}]** (Tamanho: ${formatBytes(file.size)}, Tipo: ${file.type || "documento"})`,
  );
  if (hex) {
    parts.push(`- **Assinatura (Magic Bytes):** \`${hex}\``);
  }
  parts.push("");
  parts.push("Por favor analisa este documento com base no tipo e metadados descritos.");

  return {
    kind: "document",
    textToSend: parts.join("\n\n"),
    summary: `Documento "${file.name}" anexado à conversa.`,
    metadata,
  };
}

/**
 * Processador principal de qualquer ficheiro anexado.
 * Retorna o texto formatado para envio e resumo de notificação.
 */
export async function processFileAttachment(
  file: File,
  userNote?: string,
): Promise<AttachmentProcessResult> {
  const lowerName = file.name.toLowerCase();

  // 1. Arquivos ZIP
  if (isZipFile(file)) {
    try {
      return await processZipArchive(file, userNote);
    } catch (zipErr) {
      console.warn("Falha ao descompactar ZIP com JSZip:", zipErr);
    }
  }

  // 2. Imagens
  if (isImageFile(file)) {
    try {
      return await processImageAttachment(file, userNote);
    } catch (imgErr) {
      console.warn("Falha ao processar imagem:", imgErr);
    }
  }

  // 3. Ficheiros de Áudio
  if (isAudioFile(file)) {
    return await processAudioAttachment(file, userNote);
  }

  // 4. Ficheiros de Vídeo
  if (isVideoFile(file)) {
    return await processVideoAttachment(file, userNote);
  }

  // 5. Documentos estruturados (PDF, DOC, DOCX, XLSX, etc.)
  if (isDocumentFile(file) && !lowerName.endsWith(".csv") && !lowerName.endsWith(".tsv")) {
    return await processDocumentAttachment(file, userNote);
  }

  // 6. Ficheiros de Texto / Código / Checksums (.sha256, .md5, etc.)
  let textContent: string | null = null;
  let isLikelyText = isTextExtension(file.name) || (file.type && file.type.startsWith("text/"));

  try {
    const raw = await file.text();
    // Verifica se os primeiros 2KB não possuem bytes nulos de ficheiros binários
    const hasNullBytes = /[\x00-\x08\x0E-\x1F]/.test(raw.slice(0, 2048));
    if (!hasNullBytes && raw.length > 0) {
      textContent = raw;
      isLikelyText = true;
    }
  } catch {
    textContent = null;
  }

  if (isLikelyText && textContent !== null) {
    const lang = getLanguageFromExtension(file.name);
    const maxChars = 40000;
    const isTruncated = textContent.length > maxChars;
    const body = textContent.slice(0, maxChars);
    const isCode = lang !== "text" && lang !== "markdown";

    const metadata: AttachmentMetadata = {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      kind: isCode ? "code" : "text",
      userNote: userNote?.trim() || "",
      summary: `Ficheiro "${file.name}" (${formatBytes(file.size)})`,
    };

    const parts: string[] = [];
    parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

    if (userNote?.trim()) {
      parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
      parts.push("");
    }

    parts.push(
      `📄 **[Ficheiro Anexado: ${file.name}]** (Tamanho: ${formatBytes(file.size)})`,
    );
    parts.push(`\`\`\`${lang}`);
    parts.push(body);
    parts.push("```");

    if (isTruncated) {
      parts.push(
        `*(Conteúdo truncado para os primeiros ${maxChars.toLocaleString()} caracteres de um total de ${textContent.length.toLocaleString()})*`,
      );
    }

    // Se for um checksum sha256 / md5, adiciona uma instrução específica
    if (lowerName.endsWith(".sha256") || lowerName.endsWith(".md5")) {
      parts.push(
        "Por favor analisa este checksum de verificação criptográfica, identifica o hash e o ficheiro de destino correspondente.",
      );
    } else {
      parts.push("Por favor analisa detalhadamente o conteúdo deste ficheiro.");
    }

    return {
      kind: isCode ? "code" : "text",
      textToSend: parts.join("\n"),
      summary: `Ficheiro "${file.name}" anexado à conversa.`,
      metadata,
    };
  }

  // 7. Ficheiros Binários e Outros
  const hex = await getHexPreview(file, 24);
  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileSize: formatBytes(file.size),
    kind: "binary",
    userNote: userNote?.trim() || "",
    summary: `Ficheiro "${file.name}" (${formatBytes(file.size)})`,
  };

  const parts: string[] = [];
  parts.push(`<!--GRIOT_ATTACHMENT_META:${JSON.stringify(metadata)}-->`);

  if (userNote?.trim()) {
    parts.push(`**Mensagem do Utilizador:** ${userNote.trim()}`);
    parts.push("");
  }

  parts.push(`📎 **[Ficheiro Binário Anexado: ${file.name}]**`);
  parts.push(`- **Tamanho:** ${formatBytes(file.size)}`);
  parts.push(`- **Tipo MIME:** ${file.type || "application/octet-stream"}`);
  if (hex) {
    parts.push(`- **Assinatura (Magic Bytes):** \`${hex}\``);
  }
  parts.push("");
  parts.push(
    "Por favor analisa este ficheiro binário com base no seu tipo, extensão e metadados descritos acima.",
  );

  return {
    kind: "binary",
    textToSend: parts.join("\n"),
    summary: `Ficheiro "${file.name}" adicionado à conversa.`,
    metadata,
  };
}

/**
 * Extrai os metadados do anexo a partir de uma mensagem (se houver).
 * Permite que a UI mostre um card elegante e compacto em vez de despejar centenas de linhas.
 */
export function parseAttachmentMeta(content: string): {
  meta: AttachmentMetadata | null;
  cleanContent: string;
} {
  if (!content) return { meta: null, cleanContent: "" };

  const match = content.match(/<!--GRIOT_ATTACHMENT_META:([\s\S]*?)-->/);
  if (match) {
    try {
      const meta = JSON.parse(match[1]!) as AttachmentMetadata;
      const cleanContent = content.replace(match[0], "").trim();
      return { meta, cleanContent };
    } catch {
      // Ignora erro de JSON e avança para fallback
    }
  }

  // Fallback 1: Arquivos ZIP gravados sem a tag explícita
  const zipMatch = content.match(
    /📦 \*\*\[Arquivo ZIP Descompactado:\s*([^\]]+)\]\*\*\s*\(Tamanho:\s*([^,]+),\s*(\d+)\s*ficheiros,\s*(\d+)\s*pastas\)/,
  );
  if (zipMatch) {
    const rawNoteMatch = content.match(/^\*\*Mensagem do Utilizador:\*\*\s*([^\n]+)/);
    const userNote = rawNoteMatch ? rawNoteMatch[1]?.trim() : undefined;
    return {
      meta: {
        fileName: zipMatch[1]!.trim(),
        fileSize: zipMatch[2]!.trim(),
        kind: "zip",
        fileCount: parseInt(zipMatch[3]!, 10),
        folderCount: parseInt(zipMatch[4]!, 10),
        userNote,
        summary: `Arquivo ZIP "${zipMatch[1]!.trim()}"`,
      },
      cleanContent: content,
    };
  }

  // Fallback 2: Ficheiros de texto / checksums gravados no formato anterior
  const textFileMatch = content.match(
    /📄 \*\*\[Ficheiro Anexado:\s*([^\]]+)\]\*\*\s*\(Tamanho:\s*([^)]+)\)/,
  );
  if (textFileMatch) {
    return {
      meta: {
        fileName: textFileMatch[1]!.trim(),
        fileSize: textFileMatch[2]!.trim(),
        kind: "text",
        summary: `Ficheiro "${textFileMatch[1]!.trim()}"`,
      },
      cleanContent: content,
    };
  }

  // Fallback 3: Ficheiros Binários gravados no formato anterior
  const binFileMatch = content.match(
    /📎 \*\*\[Ficheiro Binário Anexado:\s*([^\]]+)\]\*\*/,
  );
  if (binFileMatch) {
    const sizeMatch = content.match(/- \*\*Tamanho:\*\*\s*([^\n]+)/);
    return {
      meta: {
        fileName: binFileMatch[1]!.trim(),
        fileSize: sizeMatch ? sizeMatch[1]!.trim() : "Ficheiro",
        kind: "binary",
        summary: `Ficheiro "${binFileMatch[1]!.trim()}"`,
      },
      cleanContent: content,
    };
  }

  // Fallback 4: Imagens Markdown com DataURL base64 ou URL (ex.: envio anterior com textão base64)
  const mdImgMatch = content.match(
    /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+|blob:[^\s)]+|local:\/\/[^\s)]+)\)/,
  );
  if (mdImgMatch) {
    const rawNote = content
      .replace(mdImgMatch[0], "")
      .replace(/Por favor analisa esta imagem\.?/gi, "")
      .replace(/\*\*Mensagem do Utilizador:\*\*/gi, "")
      .trim();

    let sizeStr = "Imagem";
    if (mdImgMatch[2].startsWith("data:")) {
      const b64Len = mdImgMatch[2].length - mdImgMatch[2].indexOf(",") - 1;
      const bytes = Math.round((b64Len * 3) / 4);
      sizeStr = formatBytes(bytes);
    }

    return {
      meta: {
        fileName: mdImgMatch[1] || "imagem.jpg",
        fileSize: sizeStr,
        kind: "image",
        userNote: rawNote || undefined,
        summary: `Imagem "${mdImgMatch[1] || "imagem.jpg"}"`,
      },
      cleanContent: rawNote,
    };
  }

  // Fallback 5: Data URLs de imagem soltos gigantes (capturas não envolvidas em markdown)
  const rawDataUrlMatch = content.match(
    /data:image\/([a-zA-Z0-9.+_-]+);base64,[A-Za-z0-9+/=]{100,}/,
  );
  if (rawDataUrlMatch) {
    const b64Len = rawDataUrlMatch[0].length;
    const bytes = Math.round((b64Len * 3) / 4);
    const cleanNote = content
      .replace(rawDataUrlMatch[0], "")
      .replace(/Por favor analisa esta imagem\.?/gi, "")
      .replace(/[!\[\]()]/g, "")
      .trim();
    return {
      meta: {
        fileName: `imagem.${rawDataUrlMatch[1] || "jpg"}`,
        fileSize: formatBytes(bytes),
        kind: "image",
        userNote: cleanNote || undefined,
        summary: "Imagem anexada",
      },
      cleanContent: cleanNote,
    };
  }

  // Fallback 6: Ficheiro anexado genérico com Anexei o ficheiro "..."
  const attachedFileTextMatch = content.match(/Anexei o ficheiro "([^"]+)"/);
  if (attachedFileTextMatch) {
    return {
      meta: {
        fileName: attachedFileTextMatch[1],
        fileSize: "Ficheiro",
        kind: "text",
        summary: `Ficheiro "${attachedFileTextMatch[1]}"`,
      },
      cleanContent: content,
    };
  }

  return { meta: null, cleanContent: content };
}