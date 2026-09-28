import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APP_LANGUAGES } from "@/lib/settings";
import { I18N_CATALOG } from "@/lib/i18n-catalog";

const LOCALE_KEY = "griot-locale";
const CACHE_PREFIX = "griot-i18n:";
const CACHE_VERSION = `v2:${I18N_CATALOG.length}`;
const BASE_LOCALE = "pt-PT";
const CHUNK = 100;
const CONCURRENCY = 1;

export type LocaleId = (typeof APP_LANGUAGES)[number]["id"];

export function localeFromLabel(label: string): LocaleId {
  return (APP_LANGUAGES.find((language) => language.label === label)?.id ??
    BASE_LOCALE) as LocaleId;
}

export function labelFromLocale(id: string): string {
  return APP_LANGUAGES.find((language) => language.id === id)?.label ?? "Português (Portugal)";
}

type Dict = Record<string, string>;
type Cache = { version: string; dict: Dict };

type I18nValue = {
  locale: LocaleId;
  setLocale: (next: LocaleId) => void;
  /** Traduz uma frase escrita em português europeu para o idioma ativo. */
  t: (source: string) => string;
  /** `false` enquanto o idioma inteiro ainda está a ser preparado. */
  ready: boolean;
};

const I18nContext = createContext<I18nValue>({
  locale: BASE_LOCALE as LocaleId,
  setLocale: () => {},
  t: (source) => source,
  ready: true,
});

function readCache(locale: string): Dict {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + locale);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Cache;
    if (parsed?.version !== CACHE_VERSION) return {};
    return parsed.dict ?? {};
  } catch {
    return {};
  }
}

function writeCache(locale: string, dict: Dict) {
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + locale,
      JSON.stringify({ version: CACHE_VERSION, dict } satisfies Cache),
    );
  } catch {
    // armazenamento cheio — ignora
  }
}

async function translateBatch(locale: string, items: string[]): Promise<Dict> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, language: labelFromLocale(locale), items }),
  });
  if (!response.ok) throw new Error("translate failed");
  const data = (await response.json()) as { translations?: Dict };
  return data.translations ?? {};
}

/** Traduz um conjunto grande em blocos paralelos, para o idioma ficar pronto de uma vez. */
async function translateAll(locale: string, items: string[]): Promise<Dict> {
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += CHUNK) {
    chunks.push(items.slice(index, index + CHUNK));
  }
  const result: Dict = {};
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
    for (;;) {
      const chunk = chunks[cursor++];
      if (!chunk) return;
      try {
        Object.assign(result, await translateBatch(locale, chunk));
      } catch {
        try {
          Object.assign(result, await translateBatch(locale, chunk));
        } catch {
          // bloco falhado: fica em português nesta sessão
        }
      }
    }
  });
  await Promise.all(workers);
  return result;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(BASE_LOCALE as LocaleId);
  const [dict, setDict] = useState<Dict>({});
  const [ready, setReady] = useState(true);

  const target = useRef<string>(BASE_LOCALE);
  const extras = useRef<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Prepara o idioma inteiro antes de o mostrar — nunca metade em português. */
  const prepare = useCallback((next: string) => {
    target.current = next;
    requested.current = new Set();
    extras.current = new Set();
    if (next === BASE_LOCALE) {
      setDict({});
      setReady(true);
      return;
    }
    const cached = readCache(next);
    const missing = I18N_CATALOG.filter((item) => !cached[item]);
    if (missing.length === 0) {
      setDict(cached);
      setReady(true);
      return;
    }
    setDict(cached);
    setReady(false);
    void (async () => {
      const fresh = await translateAll(next, missing);
      if (target.current !== next) return;
      const merged = { ...cached, ...fresh };
      writeCache(next, merged);
      setDict(merged);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored && APP_LANGUAGES.some((language) => language.id === stored)) {
      setLocaleState(stored as LocaleId);
      prepare(stored);
    }
  }, [prepare]);

  /** Rede de segurança para frases que não estão no catálogo gerado. */
  const queue = useCallback((source: string, active: string) => {
    if (requested.current.has(source)) return;
    requested.current.add(source);
    extras.current.add(source);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const items = Array.from(extras.current);
      extras.current.clear();
      if (items.length === 0) return;
      void (async () => {
        try {
          const fresh = await translateBatch(active, items);
          if (target.current !== active) return;
          setDict((current) => {
            const merged = { ...current, ...fresh };
            writeCache(active, merged);
            return merged;
          });
        } catch {
          items.forEach((item) => requested.current.delete(item));
        }
      })();
    }, 40);
  }, []);

  const setLocale = useCallback(
    (next: LocaleId) => {
      window.localStorage.setItem(LOCALE_KEY, next);
      setLocaleState(next);
      prepare(next);
    },
    [prepare],
  );

  const t = useCallback(
    (source: string) => {
      if (!source || locale === BASE_LOCALE) return source;
      const hit = dict[source];
      if (hit) return hit;
      if (typeof window !== "undefined") queue(source, locale);
      return source;
    },
    [dict, locale, queue],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Atalho: `const t = useT();` e depois `t("Definições")`. */
export function useT() {
  return useI18n().t;
}
