import React, { useState, useRef, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { BarChart2, Table as TableIcon, Download, AlertCircle } from "lucide-react";
import { GriotMark, GriotSymbol } from "./logo";
import { toast } from "sonner";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ComponentErrorBoundary } from "@/components/ui/component-error-boundary";

// Paleta harmónica oficial do GRIOT para séries de dados
export const GRIOT_CHART_COLORS = [
  "#10b981", // Emerald (padrão principal)
  "#3b82f6", // Azul elétrico
  "#ef4444", // Vermelho / Coral
  "#f59e0b", // Âmbar / Laranja
  "#8b5cf6", // Violeta / Roxo
  "#06b6d4", // Ciano
  "#ec4899", // Rosa vibrante
  "#14b8a6", // Turquesa
];

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface GriotChartSpec {
  type?: "bar" | "line" | "area" | "pie" | "donut";
  title?: string;
  subtitle?: string;
  description?: string;
  xAxisKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  stacked?: boolean;
  series?: ChartSeries[];
  data: Array<Record<string, unknown>>;
}

interface GriotChartProps {
  spec?: GriotChartSpec;
  rawJson?: string;
  className?: string;
}

/** Limpa e recupera JSON mesmo com formatação relaxada, aspas simples ou vírgulas soltas */
export function parseRelaxedJson(input: string): unknown {
  if (!input || typeof input !== "string") return null;

  let clean = input.trim();

  // Remove cercas de código markdown se existirem (```chart ... ```)
  clean = clean
    .replace(/^```(?:[a-zA-Z0-9_:-]*)\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  // Se tiver tag xml <griot_chart>...</griot_chart>
  clean = clean.replace(/<\/?griot_chart>/gi, "").trim();

  // Tenta parsing JSON nativo direto primeiro
  try {
    return JSON.parse(clean);
  } catch {
    // Continua para normalização relaxada
  }

  try {
    // 1. Substitui aspas simples em chaves e strings por aspas duplas
    let sanitized = clean
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":') // chaves sem aspas
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"') // aspas simples -> duplas
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas

    return JSON.parse(sanitized);
  } catch (err) {
    console.warn("[GriotChart] Falha ao analisar especificação JSON relaxada:", err);
    return null;
  }
}

/** Infere propriedades automáticas se o modelo tiver omitido xAxisKey ou series */
function sanitizeSpec(raw: GriotChartSpec): GriotChartSpec {
  const data = Array.isArray(raw.data) ? raw.data : [];
  if (data.length === 0) {
    return { ...raw, data: [] };
  }

  // 1. Infere xAxisKey se não fornecido
  let xAxisKey = raw.xAxisKey;
  if (!xAxisKey) {
    const firstRow = data[0] || {};
    const candidateKeys = Object.keys(firstRow);
    // Prioriza chaves clássicas de rótulo
    const preferred = candidateKeys.find((k) =>
      /^(name|label|categoria|category|modelo|model|item|title|x|mes|data|date)$/i.test(k),
    );
    if (preferred) {
      xAxisKey = preferred;
    } else {
      // Primeiro campo que não seja numérico
      const nonNumeric = candidateKeys.find((k) => typeof firstRow[k] !== "number");
      xAxisKey = nonNumeric || candidateKeys[0] || "name";
    }
  }

  // 2. Infere series se não fornecido
  let series = raw.series;
  if (!series || !Array.isArray(series) || series.length === 0) {
    const firstRow = data[0] || {};
    const numericKeys = Object.keys(firstRow).filter((k) => {
      if (k === xAxisKey) return false;
      const val = firstRow[k];
      return typeof val === "number" || (!isNaN(Number(val)) && val !== "");
    });

    series = numericKeys.map((key, idx) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      color: GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length],
    }));
  } else {
    // Garante cores atribuídas
    series = series.map((s, idx) => ({
      ...s,
      color: s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length],
      label: s.label || s.key,
    }));
  }

  return {
    ...raw,
    type: raw.type || "bar",
    xAxisKey,
    series,
    data,
  };
}

/**
 * Componente oficial de gráficos interativos do GRIOT.
 * Renderiza barras, linhas, áreas ou tabelas com suporte a transferência em PNG de alta resolução.
 */
const GriotChartInner: React.FC<GriotChartProps> = ({
  spec: initialSpec,
  rawJson,
  className = "",
}) => {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [isExporting, setIsExporting] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Parsing da especificação com suporte a JSON bruto
  const parsedSpec = useMemo(() => {
    if (initialSpec) return sanitizeSpec(initialSpec);
    if (rawJson) {
      const parsed = parseRelaxedJson(rawJson);
      if (parsed && typeof parsed === "object") {
        return sanitizeSpec(parsed as GriotChartSpec);
      }
    }
    return null;
  }, [initialSpec, rawJson]);

  const safeSpec: GriotChartSpec = parsedSpec || { type: "bar", xAxisKey: "name", data: [] };

  const {
    type = "bar",
    title,
    subtitle,
    description,
    xAxisKey = "name",
    yAxisLabel,
    xAxisLabel,
    stacked,
    series = [],
    data,
  } = safeSpec;

  /**
   * Cálculo de escala do Eixo Y granular, legível e sem casas decimais indesejadas.
   * Divide a escala em intervalos bem legíveis (ex: 0, 10, 20, 30... até 100).
   */
  const yAxisTicks = useMemo(() => {
    if (!data || !data.length || !series || !series.length) return undefined;
    let maxVal = Number.NEGATIVE_INFINITY;
    let minVal = Number.POSITIVE_INFINITY;
    data.forEach((row) => {
      series.forEach((s) => {
        const val = Number(row[s.key]);
        if (Number.isFinite(val)) {
          maxVal = Math.max(maxVal, val);
          minVal = Math.min(minVal, val);
        }
      });
    });

    if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) return undefined;

    const span = Math.max(1, maxVal - minVal);
    const roughStep = span / 6;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = niceFactor * magnitude;
    const floor = minVal < 0 ? Math.floor(minVal / step) * step : 0;
    const ceiling = Math.ceil(Math.max(maxVal, step) / step) * step;
    const ticks: number[] = [];
    for (let value = floor; value <= ceiling + step / 2 && ticks.length < 12; value += step) {
      ticks.push(Number(value.toPrecision(12)));
    }
    return ticks;
  }, [data, series]);

  const yDomain = useMemo<[number | string, number | string]>(() => {
    if (!yAxisTicks || !yAxisTicks.length) return [0, "auto"];
    return [yAxisTicks[0] ?? 0, yAxisTicks[yAxisTicks.length - 1] ?? "auto"];
  }, [yAxisTicks]);

  const formatNumber = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value ?? "—");
    return new Intl.NumberFormat("pt-PT", {
      notation: Math.abs(numeric) >= 10000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(numeric) < 10 && !Number.isInteger(numeric) ? 2 : 1,
    }).format(numeric);
  };

  const denseData = data.length > 8;

  // Se não foi possível processar a especificação, exibe aviso suave em vez de quebrar.
  if (!parsedSpec || data.length === 0) {
    return (
      <div
        className="my-3 rounded-2xl border border-white/10 bg-neutral-900/80 p-4 text-xs text-neutral-400"
        role="alert"
      >
        <div className="mb-1 flex items-center gap-2 text-amber-400">
          <AlertCircle className="size-4" />
          <span className="font-semibold">Gráfico indisponível</span>
        </div>
        <p className="text-[12px] text-neutral-400">
          Não foi possível estruturar os dados do gráfico.
        </p>
      </div>
    );
  }

  /** Descarrega ou partilha o PNG (compatível com Android Capacitor WebView e Mobile Web) */
  const triggerDownload = async (blob: Blob, fileName: string, canvas?: HTMLCanvasElement) => {
    try {
      const file = new File([blob], fileName, { type: "image/png" });
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: title || "Gráfico GRIOT",
        });
        toast.success("Gráfico partilhado com sucesso!");
        return;
      }
    } catch (shareErr: any) {
      if (shareErr?.name === "AbortError") return;
      console.warn("[GriotChart] Partilha nativa falhou, a recorrer a download:", shareErr);
    }

    try {
      const dataUrl = canvas ? canvas.toDataURL("image/png") : window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (!canvas) {
        window.URL.revokeObjectURL(dataUrl);
      }
      toast.success("Gráfico transferido!");
    } catch (dlErr: any) {
      console.error("[GriotChart] Download falhou:", dlErr);
      toast.error("Não foi possível transferir o ficheiro.");
    }
  };

  /**
   * Exporta o gráfico diretamente para imagem PNG em alta resolução (Retina 2x).
   * Sem cor verde indesejada, renderiza cabeçalho, dados e rodapé elegantes.
   */
  const handleExportPng = async () => {
    if (!chartContainerRef.current) return;
    setIsExporting(true);
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});

    try {
      const container = chartContainerRef.current;
      const svgElement = container.querySelector("svg.recharts-surface") as SVGSVGElement | null;

      if (!svgElement) {
        toast.error("Visualização gráfica indisponível para exportação direta.");
        setIsExporting(false);
        return;
      }

      const svgRect = svgElement.getBoundingClientRect();
      const svgWidth = svgRect.width || 600;
      const svgHeight = svgRect.height || 320;

      const scale = 2;
      const padding = 28 * scale;
      const headerHeight = 75 * scale;
      const footerHeight = 40 * scale;

      const totalWidth = (svgWidth + 56) * scale;
      const totalHeight = headerHeight + svgHeight * scale + footerHeight;

      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Não foi possível inicializar o contexto 2D do Canvas.");
      }

      // 1. Fundo estilizado do GRIOT (Preto profundo)
      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // Borda sutil
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(scale, scale, totalWidth - 2 * scale, totalHeight - 2 * scale);

      // 2. Cabeçalho monocromático
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = `bold ${10 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText("GRIOT · ANÁLISE GRÁFICA", padding, 30 * scale);

      // Título principal do gráfico
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${16 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const displayTitle = title || "Comparativo de Dados";
      ctx.fillText(displayTitle, padding, 52 * scale);

      if (subtitle || description || yAxisLabel) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = `${11 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const sub = subtitle || description || (yAxisLabel ? `Eixo Y: ${yAxisLabel}` : "");
        ctx.fillText(sub, padding, 68 * scale);
      }

      // 3. Serializa o SVG com estilos e fontes clonados
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", `${svgWidth * scale}`);
      clonedSvg.setAttribute("height", `${svgHeight * scale}`);

      const originalTexts = svgElement.querySelectorAll("text");
      const clonedTexts = clonedSvg.querySelectorAll("text");
      clonedTexts.forEach((ct, i) => {
        const ot = originalTexts[i];
        if (ot) {
          const style = window.getComputedStyle(ot);
          ct.setAttribute("fill", style.fill || "#9ca3af");
          ct.setAttribute("font-size", `${parseFloat(style.fontSize || "12") * scale}px`);
          ct.setAttribute("font-family", style.fontFamily || "sans-serif");
        }
      });

      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobUrl = URL.createObjectURL(svgBlob);

      const fileName = `${(title || "griot-chart")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}-${Date.now()}.png`;

      const img = new Image();
      img.onload = async () => {
        ctx.drawImage(img, padding, headerHeight, svgWidth * scale, svgHeight * scale);
        URL.revokeObjectURL(blobUrl);

        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.font = `${9.5 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText("Gerado pelo GRIOT Mobile", padding, totalHeight - 16 * scale);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            try {
              const dataUrl = canvas.toDataURL("image/png");
              const link = document.createElement("a");
              link.href = dataUrl;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              toast.success("Gráfico transferido!");
            } catch {
              toast.error("Erro ao gerar imagem.");
            }
            setIsExporting(false);
            return;
          }

          await triggerDownload(blob, fileName, canvas);
          setIsExporting(false);
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        try {
          const dataUrl = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success("Gráfico transferido!");
        } catch {
          toast.error("Erro ao transferir gráfico.");
        }
        setIsExporting(false);
      };

      img.src = blobUrl;
    } catch (err: any) {
      console.error("[GriotChart] Erro na exportação de PNG:", err);
      toast.error(err?.message || "Não foi possível transferir o PNG.");
      setIsExporting(false);
    }
  };

  /** Formatação personalizada de Tooltip no estilo dark glass do GRIOT */
  const renderCustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="rounded-xl border border-white/15 bg-neutral-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
        <p className="font-semibold text-neutral-200 mb-1 border-b border-white/10 pb-1">
          {String(label ?? (payload[0]?.payload && payload[0]?.payload[xAxisKey]) ?? "")}
        </p>
        <div className="space-y-1">
          {payload.map((item, idx) => {
            const color =
              item.color || item.fill || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length];
            const name = item.name || item.dataKey;
            const value = formatNumber(item.value);
            return (
              <div key={idx} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  <span>{name}:</span>
                </span>
                <span className="font-semibold font-mono text-neutral-100">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={chartContainerRef}
      className={`my-3.5 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/90 dark:bg-neutral-950/95 shadow-xl backdrop-blur-md text-neutral-100 max-w-full ${className}`}
      aria-label={title || "Visualização de dados GRIOT"}
    >
      {/* Barra Superior / Cabeçalho do Gráfico */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.08] text-neutral-200">
            <GriotSymbol className="size-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[13.5px] font-semibold text-neutral-100 leading-tight truncate">
              {title || "Análise Gráfica"}
            </h4>
            {subtitle ? (
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {/* Botões de Ação: Alternar Tabela / Transferir PNG */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Alternar Tabela vs Gráfico */}
          <button
            type="button"
            onClick={() => {
              void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
              setViewMode((m) => (m === "chart" ? "table" : "chart"));
            }}
            title={viewMode === "chart" ? "Ver como Tabela" : "Ver como Gráfico"}
            aria-label="Alternar formato"
            aria-pressed={viewMode === "table"}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-neutral-300 hover:bg-white/10 transition-colors active:scale-95"
          >
            {viewMode === "chart" ? (
              <>
                <TableIcon className="size-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Tabela</span>
              </>
            ) : (
              <>
                <BarChart2 className="size-3.5 text-neutral-300" />
                <span className="hidden sm:inline">Gráfico</span>
              </>
            )}
          </button>

          {/* Botão Transferir PNG Monocromático */}
          <button
            type="button"
            onClick={handleExportPng}
            disabled={isExporting}
            title="Transferir PNG de alta qualidade"
            aria-label="Transferir PNG"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-white/10 transition-all active:scale-95"
          >
            <Download
              className={`size-3.5 text-neutral-300 ${isExporting ? "animate-bounce" : ""}`}
            />
            <span>{isExporting ? "A transferir..." : "Transferir PNG"}</span>
          </button>
        </div>
      </div>

      {/* Descrição opcional */}
      {description ? (
        <div className="px-3.5 pt-2 text-[12px] text-muted-foreground">{description}</div>
      ) : null}

      {/* Corpo: Gráfico Visual ou Tabela */}
      <div className="p-3.5">
        {viewMode === "chart" ? (
          <div className="h-[280px] w-full min-w-0 overflow-x-auto sm:h-[320px]">
            <div
              className={
                denseData && type !== "pie" && type !== "donut"
                  ? "h-full min-w-[680px]"
                  : "h-full min-w-0"
              }
              role="img"
              aria-label={`${title || "Gráfico"}. ${data.length} categorias e ${series.length} séries.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                {type === "line" ? (
                  <LineChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 4 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey={xAxisKey}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.7)", fontSize: 11.5 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255, 255, 255, 0.15)" }}
                      interval={denseData ? 0 : "preserveEnd"}
                      angle={denseData ? -28 : 0}
                      textAnchor={denseData ? "end" : "middle"}
                      height={denseData ? 58 : 30}
                      tickFormatter={(value) =>
                        String(value).length > 14 ? `${String(value).slice(0, 13)}…` : String(value)
                      }
                    />
                    <YAxis
                      domain={yDomain}
                      ticks={yAxisTicks}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tickFormatter={formatNumber}
                    />
                    <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.24)" />
                    <Tooltip content={renderCustomTooltip} cursor={false} />
                    {series.map((s, idx) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label || s.key}
                        stroke={s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{
                          r: 4,
                          strokeWidth: 1.5,
                          fill: s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length],
                        }}
                        activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                ) : type === "area" ? (
                  <AreaChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 4 }}>
                    <defs>
                      {series.map((s, idx) => {
                        const color =
                          s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length];
                        return (
                          <linearGradient
                            key={`grad-${s.key}`}
                            id={`grad-${s.key}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey={xAxisKey}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.7)", fontSize: 11.5 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255, 255, 255, 0.15)" }}
                      interval={denseData ? 0 : "preserveEnd"}
                      angle={denseData ? -28 : 0}
                      textAnchor={denseData ? "end" : "middle"}
                      height={denseData ? 58 : 30}
                      tickFormatter={(value) =>
                        String(value).length > 14 ? `${String(value).slice(0, 13)}…` : String(value)
                      }
                    />
                    <YAxis
                      domain={yDomain}
                      ticks={yAxisTicks}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tickFormatter={formatNumber}
                    />
                    <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.24)" />
                    <Tooltip content={renderCustomTooltip} cursor={false} />
                    {series.map((s, idx) => {
                      const color = s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length];
                      return (
                        <Area
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label || s.key}
                          stroke={color}
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill={`url(#grad-${s.key})`}
                        />
                      );
                    })}
                  </AreaChart>
                ) : type === "pie" || type === "donut" ? (
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Tooltip content={renderCustomTooltip} cursor={false} />
                    <Pie
                      data={data}
                      dataKey={series[0]?.key || "value"}
                      nameKey={xAxisKey}
                      cx="50%"
                      cy="50%"
                      innerRadius={type === "donut" ? 55 : 0}
                      outerRadius={85}
                      paddingAngle={3}
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth={2}
                      label={({ name, percent }) =>
                        `${String(name).slice(0, 12)} ${Math.round((percent || 0) * 100)}%`
                      }
                      labelLine={false}
                    >
                      {data.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={GRIOT_CHART_COLORS[index % GRIOT_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                ) : (
                  /* Gráfico de Barras Padrão (Vertical Bar / Grouped Bar / Stacked Bar) */
                  <BarChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 4 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey={xAxisKey}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.7)", fontSize: 11.5 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255, 255, 255, 0.15)" }}
                      interval={denseData ? 0 : "preserveEnd"}
                      angle={denseData ? -28 : 0}
                      textAnchor={denseData ? "end" : "middle"}
                      height={denseData ? 58 : 30}
                      tickFormatter={(value) =>
                        String(value).length > 14 ? `${String(value).slice(0, 13)}…` : String(value)
                      }
                    />
                    <YAxis
                      domain={yDomain}
                      ticks={yAxisTicks}
                      stroke="rgba(255, 255, 255, 0.3)"
                      tick={{ fill: "rgba(255, 255, 255, 0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tickFormatter={formatNumber}
                    />
                    <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.24)" />
                    <Tooltip content={renderCustomTooltip} cursor={false} />
                    {series.map((s, idx) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label || s.key}
                        fill={s.color || GRIOT_CHART_COLORS[idx % GRIOT_CHART_COLORS.length]}
                        radius={[6, 6, 0, 0]}
                        stackId={stacked ? "stack" : undefined}
                        maxBarSize={56}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          /* Visualização em Tabela Elegante (Referência da imagem 3) */
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">{title || "Dados do gráfico"}</caption>
              <thead className="border-b border-white/10 bg-white/[0.04] text-[11.5px] uppercase tracking-wider text-neutral-400 font-semibold">
                <tr>
                  <th scope="col" className="sticky left-0 bg-neutral-900 px-3.5 py-2.5">
                    {xAxisLabel || xAxisKey || "Item"}
                  </th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="px-3.5 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        <span
                          className="size-2 rounded-full inline-block"
                          style={{ backgroundColor: s.color }}
                        />
                        <span>{s.label || s.key}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {data.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="sticky left-0 bg-neutral-950 px-3.5 py-2 text-neutral-200 font-sans font-medium">
                      {String(row[xAxisKey] ?? `Item ${rIdx + 1}`)}
                    </td>
                    {series.map((s) => (
                      <td key={s.key} className="px-3.5 py-2 text-right text-neutral-100">
                        {formatNumber(row[s.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legenda Inferior com Cores e Nomes das Séries */}
        {series.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 pt-2.5 border-t border-white/5 text-[11.5px] text-neutral-400">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full shadow-xs"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-neutral-300 font-medium">{s.label || s.key}</span>
              </div>
            ))}
            {yAxisLabel ? (
              <span className="text-muted-foreground/60 text-[10.5px]">· {yAxisLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const GriotChart: React.FC<GriotChartProps> = (props) => (
  <ComponentErrorBoundary
    fallbackTitle="Erro ao carregar gráfico"
    fallbackMessage="Não foi possível renderizar a visualização deste gráfico com os dados fornecidos."
  >
    <GriotChartInner {...props} />
  </ComponentErrorBoundary>
);
