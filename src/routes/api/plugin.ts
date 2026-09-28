import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest, isSafePublicUrl, unauthorizedApiResponse } from "@/lib/api-auth";
import { checkRateLimit, SECURITY_HEADERS } from "@/lib/security-headers";

type Body = { id?: string; args?: Record<string, unknown> };

const UA = { "User-Agent": "GRIOT-Mobile/1.0 (plugin runner)" };

function str(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: UA });
  if (!response.ok) throw new Error(`Serviço indisponível (${response.status}).`);
  return (await response.json()) as T;
}

async function runSearch(args: Record<string, unknown>) {
  const query = str(args["query"] ?? args["q"]);
  if (!query) throw new Error("Falta o termo de pesquisa.");
  const data = await json<{ query?: { search?: { title: string; snippet: string }[] } }>(
    `https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=4&srsearch=${encodeURIComponent(query)}`,
  );
  const hits = data.query?.search ?? [];
  if (hits.length === 0) return `Sem resultados para "${query}".`;
  return hits.map((hit) => `• ${hit.title}: ${hit.snippet.replace(/<[^>]+>/g, "")}`).join("\n");
}

async function runWeb(args: Record<string, unknown>) {
  const url = str(args["url"]);
  if (!/^https?:\/\//i.test(url)) throw new Error("Endereço inválido.");
  if (!isSafePublicUrl(url)) {
    throw new Error("Acesso a endereços locais ou internos não é permitido.");
  }
  const response = await fetch(url, { headers: UA });
  if (!response.ok) throw new Error(`A página respondeu ${response.status}.`);
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 6000);
}

async function runWeather(args: Record<string, unknown>) {
  const place = str(args["place"] ?? args["city"], "Lisboa");
  const geo = await json<{
    results?: { latitude: number; longitude: number; name: string; country?: string }[];
  }>(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=${encodeURIComponent(place)}`,
  );
  const spot = geo.results?.[0];
  if (!spot) throw new Error(`Não encontrei "${place}".`);
  const data = await json<{
    current?: {
      temperature_2m: number;
      apparent_temperature: number;
      wind_speed_10m: number;
      relative_humidity_2m: number;
    };
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`,
  );
  const now = data.current;
  const days = (data.daily?.time ?? [])
    .map(
      (day, index) =>
        `${day}: ${data.daily?.temperature_2m_min?.[index]}°–${data.daily?.temperature_2m_max?.[index]}°, chuva ${data.daily?.precipitation_probability_max?.[index]}%`,
    )
    .join("\n");
  return `${spot.name}${spot.country ? `, ${spot.country}` : ""}
Agora: ${now?.temperature_2m}°C (sensação ${now?.apparent_temperature}°C), humidade ${now?.relative_humidity_2m}%, vento ${now?.wind_speed_10m} km/h
${days}`;
}

async function runFx(args: Record<string, unknown>) {
  const from = str(args["from"], "EUR").toUpperCase();
  const to = str(args["to"], "USD").toUpperCase();
  const amount = Number(args["amount"] ?? 1) || 1;
  const data = await json<{ rates?: Record<string, number>; date?: string }>(
    `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`,
  );
  const value = data.rates?.[to];
  if (value === undefined) throw new Error("Par de moedas não suportado.");
  return `${amount} ${from} = ${value} ${to} (taxa de ${data.date}).`;
}

async function runNews(args: Record<string, unknown>) {
  const query = str(args["query"] ?? args["q"]);
  const url = query
    ? `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=6&query=${encodeURIComponent(query)}`
    : "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=6";
  const data = await json<{ hits?: { title: string; url?: string; points?: number }[] }>(url);
  const hits = data.hits ?? [];
  if (hits.length === 0) return "Sem notícias para esse tema.";
  return hits.map((hit) => `• ${hit.title} (${hit.points ?? 0} pts) ${hit.url ?? ""}`).join("\n");
}

function runTime(args: Record<string, unknown>) {
  const timezone = str(args["timezone"] ?? args["tz"], "Europe/Lisbon");
  try {
    const now = new Intl.DateTimeFormat("pt-PT", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "medium",
    }).format(new Date());
    return `${timezone}: ${now}`;
  } catch {
    throw new Error("Fuso horário inválido.");
  }
}

export const Route = createFileRoute("/api/plugin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const rateLimit = checkRateLimit(clientIp, 60, 60000);
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: "Demasiados pedidos. Tenta novamente mais tarde." }),
            { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        const authUser = await authenticateApiRequest(request);
        if (!authUser) {
          return unauthorizedApiResponse();
        }

        const body = (await request.json()) as Body;
        const args = body.args ?? {};
        try {
          let result: string;
          switch (body.id) {
            case "search":
              result = await runSearch(args);
              break;
            case "web":
              result = await runWeb(args);
              break;
            case "weather":
              result = await runWeather(args);
              break;
            case "fx":
              result = await runFx(args);
              break;
            case "news":
              result = await runNews(args);
              break;
            case "time":
              result = runTime(args);
              break;
            default:
              return new Response(JSON.stringify({ error: "Plugin desconhecido." }), {
                status: 400,
              });
          }
          return new Response(JSON.stringify({ result: result.slice(0, 8000) }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
