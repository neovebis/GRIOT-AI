import { supabase } from "@/integrations/supabase/client";
import { SECURITY_HEADERS } from "./security-headers";

/**
 * Extrai e valida o token JWT do cabeçalho de autorização contra o Supabase.
 * Retorna o utilizador autenticado ou null se não autorizado.
 */
export async function authenticateApiRequest(request: Request): Promise<{
  userId: string;
  email?: string;
} | null> {
  const authHeader = request.headers.get("authorization") || "";
  let token = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token || token.split(".").length !== 3) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      return null;
    }
    return {
      userId: data.user.id,
      email: data.user.email,
    };
  } catch (err) {
    console.error("[Auth API] Erro ao validar utilizador:", err);
    return null;
  }
}

/**
 * Resposta padrão 401 Não Autorizado para rotas API.
 */
export function unauthorizedApiResponse(
  message = "Autenticação necessária. Por favor inicia sessão.",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Prevenção de SSRF (Server-Side Request Forgery).
 * Garante que apenas URLs públicos HTTP/HTTPS externos são acedidos pelo servidor.
 */
export function isSafePublicUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Bloqueia nomes locais
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    // Bloqueia endereços IPv4 privados, de loopback e metadados de cloud
    // 127.0.0.0/8 (loopback)
    // 10.0.0.0/8 (privado)
    // 172.16.0.0/12 (privado)
    // 192.168.0.0/16 (privado)
    // 169.254.0.0/16 (link-local e metadata da AWS/GCP/Azure)
    // 0.0.0.0/8 (origem)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = host.match(ipv4Regex);
    if (ipMatch) {
      const b1 = parseInt(ipMatch[1], 10);
      const b2 = parseInt(ipMatch[2], 10);

      if (b1 === 127) return false;
      if (b1 === 10) return false;
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return false;
      if (b1 === 192 && b2 === 168) return false;
      if (b1 === 169 && b2 === 254) return false;
      if (b1 === 0) return false;
    }

    // Bloqueia IPv6 loopback e link-local
    if (
      host === "::1" ||
      host === "[::1]" ||
      host.startsWith("fc00:") ||
      host.startsWith("fe80:")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
