import { useEffect, useMemo, useState } from "react";
import { Check, Gauge, Pencil, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export type ApiServiceRow = {
  id?: string;
  name: string;
  kind?: string | null;
  status?: string | null;
  cost_usd: number | string | null;
  usage_units: number | null;
};

type Metric = "money" | "usage";
type Limits = Record<string, { metric: Metric; limit: number }>;

const STORAGE_KEY = "griot-api-limits";

function toNumber(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Limite sugerido: arredonda para cima até um valor "bonito" acima do consumo. */
function suggestLimit(used: number) {
  if (used <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(used));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude * 2;
    if (candidate > used * 1.15) return Number(candidate.toFixed(2));
  }
  return Number((used * 2).toFixed(2));
}

/** Deteta automaticamente se a API se mede em dinheiro ou em unidades de utilização. */
function detectMetric(service: ApiServiceRow): Metric {
  const money = toNumber(service.cost_usd);
  const units = service.usage_units ?? 0;
  if (units > 0 && money <= 0) return "usage";
  if (money > 0 && units <= 0) return "money";
  return units > money * 50 ? "usage" : "money";
}

function readLimits(): Limits {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Limits) : {};
  } catch {
    return {};
  }
}

function formatUnits(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function Ring({ ratio }: { ratio: number }) {
  const size = 44;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  const tone =
    clamped >= 1 ? "var(--destructive)" : clamped >= 0.85 ? "var(--chart-3)" : "var(--chart-1)";
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-griot)" }}
        />
      </svg>
      <span className="absolute text-[10.5px] font-semibold tabular-nums">
        {Math.round(clamped * 100)}
      </span>
    </span>
  );
}

/**
 * Painel flexível de gastos de APIs.
 * Se a API mede dinheiro: mostra gasto e quanto falta até ao limite.
 * Se mede utilização: mostra unidades usadas e quantas restam.
 */
export function ApiBudgetPanel({ services }: { services: ApiServiceRow[] }) {
  const t = useT();
  const [limits, setLimits] = useState<Limits>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => setLimits(readLimits()), []);

  function persist(next: Limits) {
    setLimits(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const rows = useMemo(
    () =>
      services.map((service) => {
        const stored = limits[service.name];
        const metric = stored?.metric ?? detectMetric(service);
        const used = metric === "money" ? toNumber(service.cost_usd) : (service.usage_units ?? 0);
        const limit = stored?.limit && stored.limit > 0 ? stored.limit : suggestLimit(used);
        const remaining = Math.max(0, limit - used);
        return {
          service,
          metric,
          used,
          limit,
          remaining,
          ratio: limit > 0 ? used / limit : 0,
          custom: Boolean(stored),
        };
      }),
    [services, limits],
  );

  const money = rows.filter((row) => row.metric === "money");
  const totalUsed = money.reduce((sum, row) => sum + row.used, 0);
  const totalLimit = money.reduce((sum, row) => sum + row.limit, 0);

  if (rows.length === 0) {
    return (
      <div className="panel px-5 py-8 text-center text-[13.5px] text-muted-foreground">
        {t("Liga uma API para ver gastos e limites aqui.")}
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden px-5 pt-4 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t("Gastos de APIs")}
          </p>
          <p className="mt-1.5 text-[27px] leading-none font-semibold tracking-tight tabular-nums">
            ${totalUsed.toFixed(2)}
          </p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {t("falta")} ${Math.max(0, totalLimit - totalUsed).toFixed(2)} {t("de")} $
            {totalLimit.toFixed(2)}
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
          <Gauge className="size-[17px]" />
        </span>
      </div>

      <ul className="mt-3 divide-y divide-hairline">
        {rows.map((row) => (
          <li key={row.service.name} className="py-3">
            <div className="flex items-center gap-3">
              <Ring ratio={row.ratio} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                    {row.service.name}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums">
                    {row.metric === "money"
                      ? `$${row.used.toFixed(2)}`
                      : `${formatUnits(row.used)} ${t("un.")}`}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {row.metric === "money"
                    ? `${t("restam")} $${row.remaining.toFixed(2)} ${t("de")} $${row.limit.toFixed(2)}`
                    : `${t("restam")} ${formatUnits(row.remaining)} ${t("de")} ${formatUnits(row.limit)} ${t("unidades")}`}
                  {row.custom ? "" : ` · ${t("limite estimado")}`}
                </p>
              </div>
              <button
                aria-label={`${t("Definir limite de")} ${row.service.name}`}
                onClick={() => {
                  setEditing(editing === row.service.name ? null : row.service.name);
                  setValue(String(row.limit));
                }}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
              >
                <Pencil className="size-[14px]" />
              </button>
            </div>

            {editing === row.service.name ? (
              <div className="rise mt-3 rounded-2xl border border-hairline p-2.5">
                <div className="flex gap-1.5">
                  {(["money", "usage"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() =>
                        persist({
                          ...limits,
                          [row.service.name]: { metric: option, limit: row.limit },
                        })
                      }
                      className={`flex-1 rounded-xl py-2 text-[12.5px] font-medium ${
                        row.metric === option
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary"
                      }`}
                    >
                      {option === "money" ? t("Dinheiro") : t("Utilização")}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    inputMode="decimal"
                    placeholder={t("Limite")}
                    className="min-w-0 flex-1 rounded-xl border border-hairline bg-background px-3 py-2 text-[14px] outline-none"
                  />
                  <button
                    aria-label={t("Guardar limite")}
                    onClick={() => {
                      const parsed = Number(value.replace(",", "."));
                      if (parsed > 0) {
                        persist({
                          ...limits,
                          [row.service.name]: { metric: row.metric, limit: parsed },
                        });
                      }
                      setEditing(null);
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"
                  >
                    <Check className="size-[16px]" />
                  </button>
                  <button
                    aria-label={t("Cancelar")}
                    onClick={() => setEditing(null)}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
                  >
                    <X className="size-[16px]" />
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
