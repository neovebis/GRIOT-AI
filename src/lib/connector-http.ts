/**
 * GRIOT Universal Connector HTTP Client
 * 
 * Fornece requisições HTTP de alta performance e à prova de falhas para os 30 conectores:
 * - Em ambiente nativo Android (Capacitor), utiliza CapacitorHttp para contornar restrições de CORS,
 *   preflights e cabeçalhos proibidos.
 * - Em ambiente web/PWA, utiliza fetch com sanitização de cabeçalhos e timeout.
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const isNative = typeof window !== "undefined" && Boolean(Capacitor.isNativePlatform?.());

  if (isNative) {
    try {
      const headersRecord: Record<string, string> = {};
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((v, k) => {
            headersRecord[k] = v;
          });
        } else if (Array.isArray(options.headers)) {
          options.headers.forEach(([k, v]) => {
            headersRecord[k] = v;
          });
        } else {
          Object.assign(headersRecord, options.headers);
        }
      }

      let parsedData: any = options.body;
      if (typeof options.body === "string") {
        try {
          // Se for JSON válido, passa objeto para o CapacitorHttp serializar nativamente
          if (
            (options.body.startsWith("{") && options.body.endsWith("}")) ||
            (options.body.startsWith("[") && options.body.endsWith("]"))
          ) {
            parsedData = JSON.parse(options.body);
          }
        } catch {
          parsedData = options.body;
        }
      }

      const nativeRes = await CapacitorHttp.request({
        url,
        method: options.method || "GET",
        headers: headersRecord,
        data: parsedData,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      const bodyText =
        typeof nativeRes.data === "string"
          ? nativeRes.data
          : JSON.stringify(nativeRes.data ?? {});

      return new Response(bodyText, {
        status: nativeRes.status,
        statusText: String(nativeRes.status),
        headers: nativeRes.headers,
      });
    } catch (nativeErr) {
      console.warn("[GRIOT safeFetch] Falha no CapacitorHttp, a tentar fetch padrão:", nativeErr);
      // Fallback para fetch padrão se houver qualquer anomalia no plugin nativo
    }
  }

  // Fallback / Web standard fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Filtra cabeçalhos proibidos na Web padrão (ex: User-Agent)
  const sanitizedHeaders: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => {
        if (k.toLowerCase() !== "user-agent") {
          sanitizedHeaders[k] = v;
        }
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([k, v]) => {
        if (k.toLowerCase() !== "user-agent") {
          sanitizedHeaders[k] = v;
        }
      });
    } else {
      for (const [k, v] of Object.entries(options.headers)) {
        if (k.toLowerCase() !== "user-agent" && typeof v === "string") {
          sanitizedHeaders[k] = v;
        }
      }
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: sanitizedHeaders,
      signal: options.signal || controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`Tempo limite de ligação excedido (${Math.round(timeoutMs / 1000)}s) ao contactar o serviço.`);
    }
    throw err;
  }
}

export async function handleHttpError(res: Response, service: string): Promise<string> {
  const status = res.status;
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "Sem resposta legível do servidor.";
  }

  // Tenta extrair mensagem amigável de JSON de erro comum (GitHub, GitLab, Cloudflare, etc.)
  try {
    const parsed = JSON.parse(body);
    if (parsed.message) {
      body = parsed.message;
    } else if (parsed.error) {
      body = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error);
    } else if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      body = parsed.errors.map((e: any) => e.message || JSON.stringify(e)).join("; ");
    }
  } catch {
    // Mantém texto simples
  }

  return `[${service}] Erro HTTP ${status}: ${body.slice(0, 300)}`;
}
