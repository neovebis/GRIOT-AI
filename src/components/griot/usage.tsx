import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RunRow = {
  created_at: string;
  cost_usd: number | string | null;
  duration_ms: number | null;
};
export type ServiceRow = {
  name: string;
  cost_usd: number | string | null;
  usage_units: number | null;
};

const DAY = 86_400_000;
const WEEKDAYS_SOURCE = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toNumber(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function buildDaily(runs: RunRow[], days: number) {
  const today = startOfDay(new Date()).getTime();
  const buckets = new Map<number, { gcu: number; runs: number }>();
  for (let index = days - 1; index >= 0; index -= 1) {
    buckets.set(today - index * DAY, { gcu: 0, runs: 0 });
  }
  for (const run of runs) {
    const key = startOfDay(new Date(run.created_at)).getTime();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.gcu += toNumber(run.cost_usd);
    bucket.runs += 1;
  }
  return Array.from(buckets.entries()).map(([time, value]) => {
    const date = new Date(time);
    return {
      time,
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      weekday: WEEKDAYS_SOURCE[date.getDay()] ?? "",
      gcu: Number(value.gcu.toFixed(2)),
      runs: value.runs,
    };
  });
}

function Chrome({
  title,
  value,
  delta,
  children,
  right,
}: {
  title: string;
  value: string;
  delta?: { text: string; up: boolean } | null;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="panel overflow-hidden px-5 pt-4 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t(title)}
          </p>
          <p className="mt-1.5 text-[27px] leading-none font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {delta ? (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              <span className={delta.up ? "text-signal" : "text-muted-foreground"}>
                {delta.text}
              </span>{" "}
              {t("vs. período anterior")}
            </p>
          ) : null}
        </div>
        {right}
      </div>
      <div className="mt-3 -mx-1">{children}</div>
    </div>
  );
}

function ChartTip({ suffix }: { suffix: string }) {
  return (
    <Tooltip
      cursor={{ stroke: "var(--hairline)", strokeWidth: 1 }}
      contentStyle={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        fontSize: 12,
        padding: "8px 10px",
        color: "var(--foreground)",
      }}
      labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
      formatter={(value: number | string) => [`${value} ${suffix}`, ""]}
    />
  );
}

export function UsageSection({ runs, services }: { runs: RunRow[]; services: ServiceRow[] }) {
  const t = useT();
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const daily = useMemo(() => buildDaily(runs, range), [runs, range]);
  const week = useMemo(() => buildDaily(runs, 7), [runs]);

  const totalGcu = daily.reduce((sum, day) => sum + day.gcu, 0);
  const half = Math.floor(daily.length / 2);
  const previous = daily.slice(0, half).reduce((sum, day) => sum + day.gcu, 0);
  const current = daily.slice(half).reduce((sum, day) => sum + day.gcu, 0);
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  const weekRuns = week.reduce((sum, day) => sum + day.runs, 0);
  const peak = week.reduce(
    (best, day) => (day.runs > best.runs ? day : best),
    week[0] ?? { runs: 0, weekday: "—" },
  );

  const serviceData = useMemo(
    () =>
      services
        .map((service, index) => ({
          name: service.name,
          value: Number(toNumber(service.cost_usd).toFixed(2)),
          units: service.usage_units ?? 0,
          fill: `var(--chart-${(index % 5) + 1})`,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [services],
  );

  const serviceTotal = serviceData.reduce((sum, item) => sum + item.value, 0);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <Chrome title="Gastos GCU" value={totalGcu.toFixed(2)}>
          <div className="h-[132px] w-full rounded-2xl bg-surface/30 border border-hairline/40" />
        </Chrome>
        <Chrome title="Uso semanal" value={`${weekRuns} ${t("execuções")}`}>
          <div className="h-[124px] w-full rounded-2xl bg-surface/30 border border-hairline/40" />
        </Chrome>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Chrome
        title="Gastos GCU"
        value={totalGcu.toFixed(2)}
        delta={{ text: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`, up: change >= 0 }}
        right={
          <div className="flex shrink-0 rounded-full border border-hairline p-0.5">
            {([7, 14, 30] as const).map((option) => (
              <button
                key={option}
                onClick={() => setRange(option)}
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-200 ${
                  range === option ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`}
              >
                {option}d
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={132}>
          <AreaChart data={daily} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="gcu-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={26}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10.5 }}
            />
            <YAxis hide />
            <ChartTip suffix="GCU" />
            <Area
              type="monotone"
              dataKey="gcu"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#gcu-fill)"
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Chrome>

      <Chrome
        title="Uso semanal"
        value={`${weekRuns} ${t("execuções")}`}
        delta={{ text: `${t("Pico")} ${peak.weekday}`, up: true }}
      >
        <ResponsiveContainer width="100%" height={124}>
          <BarChart
            data={week}
            margin={{ top: 6, right: 6, left: 6, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="weekday"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10.5 }}
            />
            <YAxis hide />
            <ChartTip suffix={t("execuções")} />
            <Bar dataKey="runs" radius={[6, 6, 6, 6]} animationDuration={600}>
              {week.map((day) => (
                <Cell
                  key={day.time}
                  fill={
                    day.runs === peak.runs && peak.runs > 0 ? "var(--chart-1)" : "var(--chart-4)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Chrome>

      <div className="panel px-5 pt-4 pb-4">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t("Distribuição por serviço")}
        </p>
        {serviceData.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted-foreground">
            {t("Sem serviços com consumo registado.")}
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-4">
            <div className="relative size-[124px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  data={serviceData}
                  innerRadius="46%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={6}
                    background={{ fill: "var(--muted)" }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="text-[17px] font-semibold tabular-nums">
                  {serviceTotal.toFixed(1)}
                </span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {serviceData.map((service) => (
                <li key={service.name} className="flex items-center gap-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: service.fill }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{service.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                    {service.value.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function DailyPulse({ runs }: { runs: RunRow[] }) {
  const t = useT();
  const today = useMemo(() => buildDaily(runs, 1)[0], [runs]);
  const yesterday = useMemo(() => buildDaily(runs, 2)[0], [runs]);
  const delta = (today?.gcu ?? 0) - (yesterday?.gcu ?? 0);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="panel px-5 py-4">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t("Hoje")}
        </p>
        <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums">
          {(today?.gcu ?? 0).toFixed(2)}
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          GCU · {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)} {t("vs. ontem")}
        </p>
      </div>
      <div className="panel px-5 py-4">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t("Execuções")}
        </p>
        <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums">
          {today?.runs ?? 0}
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">{t("nas últimas 24 h")}</p>
      </div>
    </div>
  );
}
