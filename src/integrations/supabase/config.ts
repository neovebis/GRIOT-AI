/**
 * Coordenadas do backend GRIOT (Supabase), num único sítio.
 *
 * Regras:
 * - A configuração vem sempre do ambiente (build/servidor).
 * - O URL NUNCA pode ser substituído por valores guardados no dispositivo
 *   (localStorage), para não permitir desvio de sessões.
 * - A chave publicável é pública por natureza; a service role nunca vive aqui.
 */

const FALLBACK_URL = "https://dslccwkaitihiszetdlh.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable__C-TElQqGI2za2yyyihRfg_fRpS1VtS";

function clean(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function readEnv(...names: string[]): string {
  const viteEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const nodeEnv = (typeof process !== "undefined" ? (process.env ?? {}) : {}) as Record<
    string,
    string | undefined
  >;
  for (const name of names) {
    const value = clean(viteEnv[name] ?? nodeEnv[name]);
    if (value) return value;
  }
  return "";
}

const urlFromEnv = readEnv("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
const keyFromEnv = readEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
);

export const SUPABASE_URL =
  urlFromEnv.startsWith("http://") || urlFromEnv.startsWith("https://") ? urlFromEnv : FALLBACK_URL;

export const SUPABASE_PUBLISHABLE_KEY =
  keyFromEnv.length >= 10 ? keyFromEnv : FALLBACK_PUBLISHABLE_KEY;

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * fetch partilhado: envia sempre `apikey` e remove o Authorization automático
 * quando a chave é do formato novo (opaca, não é JWT).
 *
 * Não existe qualquer fallback com dados de demonstração: erros de rede
 * propagam para a interface poder mostrar o estado real.
 */
export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
