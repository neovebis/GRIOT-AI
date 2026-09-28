import { createFileRoute } from "@tanstack/react-router";
import { generateContentWithFallback } from "@/lib/gemini.server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { checkRateLimit, SECURITY_HEADERS } from "@/lib/security-headers";

/**
 * In-memory server-side cache for translations to preserve API quota.
 */
const serverTranslationCache = new Map<string, Map<string, string>>();

// Dicionário essencial estático para fallback instantâneo (zero consumo de quota)
const CORE_DICTIONARY: Record<string, Record<string, string>> = {
  "en-US": {
    Definições: "Settings",
    GRIOT: "GRIOT",
    Conversas: "Conversations",
    Projetos: "Projects",
    Procurar: "Search",
    Novo: "New",
    Criar: "Create",
    Guardar: "Save",
    Cancelar: "Cancel",
    Apagar: "Delete",
    Ativo: "Active",
    Inativo: "Inactive",
    Ligar: "Enable",
    Desligar: "Disable",
    Autorizar: "Authorize",
    Desautorizar: "Revoke",
    "Apps de Chat": "Chat Apps",
    Segurança: "Security",
    Acessibilidade: "Accessibility",
    Aparência: "Appearance",
    Idioma: "Language",
    Tema: "Theme",
    "Modo escuro": "Dark mode",
    "Modo claro": "Light mode",
    "GRIOT Observer Nativo": "GRIOT Native Observer",
    "Serviço de Acessibilidade": "Accessibility Service",
    "Ativar Permissão": "Enable Permission",
    "Permissão Ativa": "Permission Active",
    "Permitir Notificações": "Allow Notifications",
    "Notificações Ativas": "Notifications Active",
    "Limpar cache": "Clear cache",
    Histórico: "History",
    Adicionar: "Add",
    Fechar: "Close",
    Copiar: "Copy",
    Partilhar: "Share",
    Voltar: "Back",
    Continuar: "Continue",
    Sucesso: "Success",
    Erro: "Error",
    Aviso: "Warning",
    Conectado: "Connected",
    "Não ligado": "Disconnected",
  },
  "es-ES": {
    Definições: "Ajustes",
    Conversas: "Conversaciones",
    Projetos: "Proyectos",
    Procurar: "Buscar",
    Novo: "Nuevo",
    Criar: "Crear",
    Guardar: "Guardar",
    Cancelar: "Cancelar",
    Apagar: "Eliminar",
    Ativo: "Activo",
    Inativo: "Inactivo",
    Ligar: "Activar",
    Desligar: "Desactivar",
    Autorizar: "Autorizar",
    Desautorizar: "Revocar",
    "Apps de Chat": "Apps de Chat",
    Segurança: "Seguridad",
    Acessibilidade: "Accesibilidad",
    Aparência: "Apariencia",
    Idioma: "Idioma",
    Tema: "Tema",
  },
  "pt-BR": {
    Definições: "Configurações",
    Conversas: "Conversas",
    Projetos: "Projetos",
    Procurar: "Pesquisar",
    Guardar: "Salvar",
    Acessibilidade: "Acessibilidade",
    Aparência: "Aparência",
  },
};

function getCached(locale: string, text: string): string | undefined {
  const cached = serverTranslationCache.get(locale)?.get(text);
  if (cached) return cached;
  const langKey = locale.split("-")[0];
  return (
    CORE_DICTIONARY[locale]?.[text] ||
    CORE_DICTIONARY[`${langKey}-${langKey.toUpperCase()}`]?.[text]
  );
}

function setCached(locale: string, text: string, translated: string) {
  if (!serverTranslationCache.has(locale)) {
    serverTranslationCache.set(locale, new Map());
  }
  serverTranslationCache.get(locale)!.set(text, translated);
}

// Cooldown para evitar chamadas contínuas quando a quota da API estiver esgotada
let apiCooldownUntil = 0;

/**
 * Tradução resiliente da interface com fallback em dicionário e cache persistente.
 */
export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const rateLimit = checkRateLimit(clientIp, 60, 60000);
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: "Demasiados pedidos de tradução." }),
            { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        try {
          const body = (await request.json()) as {
            locale?: string;
            language?: string;
            items?: string[];
          };
          const rawItems = (body.items ?? []).filter(
            (item) => typeof item === "string" && item.trim().length > 0,
          );
          const localeKey = body.locale ?? "en-US";
          const language = body.language ?? body.locale ?? "English (US)";

          if (rawItems.length === 0) {
            return new Response(JSON.stringify({ translations: {} }), {
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            });
          }

          const translations: Record<string, string> = {};
          const missingItems: string[] = [];

          for (const item of rawItems) {
            const cached = getCached(localeKey, item);
            if (cached) {
              translations[item] = cached;
            } else {
              missingItems.push(item);
            }
          }

          if (missingItems.length === 0) {
            return new Response(JSON.stringify({ translations }), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600",
                ...SECURITY_HEADERS,
              },
            });
          }

          // Se não houver autenticação, serve dicionário/fallback para proteger quota LLM
          const authUser = await authenticateApiRequest(request);
          if (!authUser) {
            for (const item of missingItems) {
              const fallback = getCached(localeKey, item) ?? item;
              translations[item] = fallback;
              setCached(localeKey, item, fallback);
            }
            return new Response(JSON.stringify({ translations }), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600",
                ...SECURITY_HEADERS,
              },
            });
          }

          const now = Date.now();
          if (now < apiCooldownUntil) {
            // Em cooldown: preenche com texto original ou dicionário para evitar chamadas desnecessárias
            for (const item of missingItems) {
              const fallback = getCached(localeKey, item) ?? item;
              translations[item] = fallback;
              setCached(localeKey, item, fallback);
            }
            return new Response(JSON.stringify({ translations }), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600",
                ...SECURITY_HEADERS,
              },
            });
          }

          const prompt = [
            `Traduz cada string de interface de português europeu para: ${language}.`,
            "Regras: mantém marcas e nomes próprios (GRIOT, ChatGPT, Claude, Gemini, GitHub, ACP, GCU, Wi-Fi, Bluetooth, Face ID);",
            "mantém emojis, símbolos, pontuação, placeholders e maiúsculas iniciais; texto curto e natural para mobile;",
            "responde SÓ com JSON: um objeto onde cada chave é a string original e o valor é a tradução.",
            JSON.stringify(missingItems.slice(0, 50)),
          ].join("\n");

          try {
            const { result: response } = await generateContentWithFallback({
              models: ["gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-flash-latest"],
              contents: prompt,
              config: {
                systemInstruction: "És um tradutor de interfaces. Devolves apenas JSON válido.",
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            });

            const content = response.text ?? "{}";
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(content) as Record<string, unknown>;
            } catch {
              const match = content.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  parsed = JSON.parse(match[0]) as Record<string, unknown>;
                } catch {
                  parsed = {};
                }
              }
            }

            for (const item of missingItems) {
              const value = parsed[item];
              if (typeof value === "string" && value.trim().length > 0) {
                const clean = value.trim();
                translations[item] = clean;
                setCached(localeKey, item, clean);
              } else {
                const fallback = getCached(localeKey, item) ?? item;
                translations[item] = fallback;
                setCached(localeKey, item, fallback);
              }
            }
          } catch {
            // Em caso de quota atingida (429) ou indisponibilidade, entra em cooldown de 60s
            apiCooldownUntil = Date.now() + 60_000;
            for (const item of missingItems) {
              const fallback = getCached(localeKey, item) ?? item;
              translations[item] = fallback;
              setCached(localeKey, item, fallback);
            }
          }

          return new Response(JSON.stringify({ translations }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          return new Response(JSON.stringify({ translations: {} }), {
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
