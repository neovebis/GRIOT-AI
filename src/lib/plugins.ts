export type PluginId = "search" | "web" | "weather" | "fx" | "news" | "time";

export type PluginDef = {
  id: PluginId;
  label: string;
  vendor: string;
  short: string;
  /** Descrição usada no System Prompt e na barra de permissão. */
  purpose: string;
  args: string;
};

export const PLUGINS: PluginDef[] = [
  {
    id: "search",
    label: "Pesquisa",
    vendor: "Wikipedia",
    short: "PQ",
    purpose: "procurar factos e resumos enciclopédicos",
    args: '{"query":"termo a pesquisar"}',
  },
  {
    id: "web",
    label: "Leitor Web",
    vendor: "HTTP",
    short: "WB",
    purpose: "abrir um endereço e ler o texto da página",
    args: '{"url":"https://exemplo.com"}',
  },
  {
    id: "weather",
    label: "Meteorologia",
    vendor: "Open-Meteo",
    short: "MT",
    purpose: "obter tempo atual e previsão de um local",
    args: '{"place":"Lisboa"}',
  },
  {
    id: "fx",
    label: "Câmbios",
    vendor: "Frankfurter",
    short: "FX",
    purpose: "converter moedas com taxas reais",
    args: '{"from":"EUR","to":"USD","amount":100}',
  },
  {
    id: "news",
    label: "Notícias Tech",
    vendor: "Hacker News",
    short: "NW",
    purpose: "ler o que se publica agora em tecnologia",
    args: '{"query":"tema"}',
  },
  {
    id: "time",
    label: "Hora Mundial",
    vendor: "Sistema",
    short: "HR",
    purpose: "saber a data e hora exatas num fuso horário",
    args: '{"timezone":"Europe/Lisbon"}',
  },
];

import { PLUGINS_LIST } from "./plugins-service";

export function pluginById(id: string): PluginDef | undefined {
  if (!id) return undefined;
  const normalizedId = id.toLowerCase().trim();
  const legacy = PLUGINS.find((plugin) => plugin.id.toLowerCase() === normalizedId);
  if (legacy) return legacy;

  const found = PLUGINS_LIST.find(
    (p) => p.id.toLowerCase() === normalizedId || p.name.toLowerCase() === normalizedId,
  );
  if (found) {
    return {
      id: found.id as any,
      label: found.name,
      vendor:
        found.category === "dev_cloud"
          ? "Dev & Cloud"
          : found.category === "ai_tools"
            ? "IA & Modelos"
            : found.category === "productivity"
              ? "Mensageria"
              : found.category === "database"
                ? "Base de Dados"
                : "Integração",
      short: found.name.slice(0, 2).toUpperCase(),
      purpose: found.description,
      args: "{}",
    };
  }
  return undefined;
}

export type PluginCall = { id: PluginId; args: Record<string, unknown>; raw: string };

const CALL = /<plugin\s+name="([a-z]+)"(?:\s+args='([^']*)')?\s*\/?>(?:<\/plugin>)?/gi;

/** Lê pedidos de plugin emitidos pelo modelo e devolve o texto sem os blocos. */
export function parsePluginCalls(text: string): { calls: PluginCall[]; clean: string } {
  const calls: PluginCall[] = [];
  let clean = text;
  for (const match of text.matchAll(CALL)) {
    const def = pluginById(match[1]!.toLowerCase());
    if (!def) continue;
    let args: Record<string, unknown> = {};
    try {
      args = match[2] ? (JSON.parse(match[2]) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    calls.push({ id: def.id, args, raw: match[0]! });
    clean = clean.replace(match[0]!, "");
  }
  return { calls, clean: clean.trim() };
}

/** Esconde um bloco a meio de streaming para não piscar markup na conversa. */
export function stripPartialPlugin(text: string): string {
  if (!text) return "";
  let clean = text;
  clean = clean
    .replace(/<connector_action\b[^>]*\/?>/gi, "")
    .replace(/<connector_action[\s\S]*?<\/connector_action>/gi, "")
    .replace(/<connector_action[\s\S]*$/, "")
    .replace(/<griot_action\b[^>]*\/?>/gi, "")
    .replace(/<griot_action[\s\S]*?<\/griot_action>/gi, "")
    .replace(/<griot_action[\s\S]*$/, "");

  const index = clean.lastIndexOf("<plugin");
  if (index !== -1 && !clean.slice(index).includes(">")) {
    clean = clean.slice(0, index);
  }
  return clean;
}

export function describeArgs(args: Record<string, unknown>) {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

const KEY = "griot-plugins";

export function connectedPlugins(): PluginId[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PluginId[]) : [];
  } catch {
    return [];
  }
}

export function setPluginConnected(id: PluginId, on: boolean) {
  const current = new Set(connectedPlugins());
  if (on) current.add(id);
  else current.delete(id);
  window.localStorage.setItem(KEY, JSON.stringify([...current]));
  return [...current];
}
