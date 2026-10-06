import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings, Terminal, Box, Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Screen, Panel, Metric, Empty } from "@/components/griot/screen";
import { relativeTime } from "@/lib/griot";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { getRuntimeMode, setRuntimeMode, type RuntimeMode } from "@/lib/runtime/native-terminal-bridge";
import { NativeTerminalModal } from "@/components/griot/native-terminal-modal";

export const Route = createFileRoute("/_authenticated/control")({
  head: () => ({
    meta: [
      { title: "Control Center — GRIOT Mobile" },
      {
        name: "description",
        content: "ModelOS: estado das APIs, modelos, utilização, custos, agentes e execuções.",
      },
      { property: "og:title", content: "Control Center — GRIOT Mobile" },
      {
        property: "og:description",
        content: "ModelOS: estado dos modelos, custos, agentes e execuções.",
      },
    ],
  }),
  component: ControlPage,
});

const STATUS_LABEL: Record<string, string> = {
  operational: "Operacional",
  degraded: "Degradado",
  down: "Em baixo",
};

function ControlPage() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const [runtimeMode, setRuntimeModeState] = useState<RuntimeMode>(() => getRuntimeMode());
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);

  const handleSelectRuntime = (mode: RuntimeMode) => {
    setRuntimeModeState(mode);
    setRuntimeMode(mode);
  };

  const { data } = useQuery({
    queryKey: ["control"],
    queryFn: async () => {
      try {
        const [credsRes, pipelineRes, usageRes, profileRes] = await Promise.all([
          (supabase as any)
            .from("griot_credentials")
            .select("id, provider_id, label, kind, status")
            .order("created_at", { ascending: false }),
          (supabase as any).from("griot_pipeline_configs").select("nodes").limit(1).maybeSingle(),
          (supabase as any)
            .from("griot_provider_usage_events")
            .select(
              "id, provider_id, model_id, total_tokens, estimated_cost_usd, status, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(8),
          (supabase as any)
            .from("griot_user_profiles")
            .select("display_name")
            .limit(1)
            .maybeSingle(),
        ]);

        const rawCreds = credsRes?.data || [];
        const services = rawCreds.map((c: any) => ({
          id: c.id,
          name: c.label || c.provider_id,
          kind: c.kind,
          status: c.status === "active" ? "operational" : "degraded",
          cost_usd: 0,
        }));

        const pipelineNodes = Array.isArray(pipelineRes?.data?.nodes) ? pipelineRes.data.nodes : [];
        const activeAgents = pipelineNodes.filter((n: any) => n.enabled !== false).length;

        const rawUsage = usageRes?.data || [];
        const runs = rawUsage.map((u: any) => ({
          id: u.id,
          label: `${u.provider_id}/${u.model_id}`,
          status: u.status || "succeeded",
          created_at: u.created_at,
          cost_usd: Number(
            u.estimated_cost_usd || (u.total_tokens ? u.total_tokens * 0.0000005 : 0),
          ),
        }));

        const totalCost = runs.reduce((acc: number, r: any) => acc + (r.cost_usd || 0), 0);

        return {
          services,
          activeAgents,
          runs,
          totalCost,
          profile: {
            desktop_online: profileRes?.data?.desktop_online === true,
            display_name: profileRes?.data?.display_name || "GRIOT",
          },
        };
      } catch (err) {
        console.warn("Falha na consulta de Control:", err);
        return {
          services: [],
          activeAgents: 0,
          runs: [],
          totalCost: 0,
          profile: { desktop_online: false, display_name: "GRIOT" },
        };
      }
    },
  });

  const cost = data?.totalCost ?? 0;
  const activeAgents = data?.activeAgents ?? 0;

  return (
    <Screen
      title={t("Control")}
      subtitle="ModelOS"
      action={
        <Link
          to="/settings"
          aria-label={t("Definições")}
          className="grid size-10 place-items-center rounded-full border border-hairline"
        >
          <Settings className="size-[18px]" />
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric label={t("Custo")} value={`$${cost.toFixed(2)}`} note={t("acumulado")} />
        <Metric label={t("Agentes")} value={`${activeAgents}`} note={t("ativos")} />
      </div>

      {/* Seletor de Modo de Execução: Sandbox Isolado vs Terminal Nativo (PRoot ARM64) */}
      <Panel className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Ambiente de Execução")}
          </p>
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-500">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            {runtimeMode === "native" ? t("ARM64 Nativo") : t("Sandbox Ativo")}
          </span>
        </div>

        {/* Abas Seletoras com design nativo GRIOT */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-secondary/50 p-1 border border-hairline/60">
          <button
            type="button"
            onClick={() => handleSelectRuntime("sandbox")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition-all ${
              runtimeMode === "sandbox"
                ? "bg-surface text-foreground shadow-xs border border-hairline"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Box className="size-3.5" />
            <span>{t("Sandbox")}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectRuntime("native")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition-all ${
              runtimeMode === "native"
                ? "bg-surface text-foreground shadow-xs border border-hairline"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Terminal className="size-3.5" />
            <span>{t("Terminal Nativo")}</span>
          </button>
        </div>

        {/* Detalhes do Modo Ativo */}
        {runtimeMode === "native" ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t("Kernel / Userspace")}</span>
              <span className="font-mono text-foreground font-medium">PRoot ARM64 (Ubuntu Jammy)</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t("Toolchains & Binários")}</span>
              <span className="font-mono text-foreground font-medium">Node v20 · Python3 · Git</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t("Proteção RAM & Processos")}</span>
              <span className="text-emerald-500 font-medium">Heap 1024MB · Shield Ativo</span>
            </div>

            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setTerminalModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-hairline bg-surface py-2 text-[12.5px] font-medium text-foreground hover:border-primary/40 active:scale-95 transition-all shadow-2xs"
              >
                <Terminal className="size-3.5 text-primary" />
                <span>{t("Abrir Terminal Interativo PTY")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t("Tipo")}</span>
              <span className="font-medium text-foreground">{t("Container Isolado em Nuvem")}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">{t("Isolamento")}</span>
              <span className="font-medium text-foreground">WASM / Studio Compute</span>
            </div>
          </div>
        )}
      </Panel>

      <p className="pt-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        {t("Serviços")}
      </p>
      {data?.services.length ? (
        <Panel className="divide-y divide-hairline">
          {data.services.map((service: (typeof data.services)[number]) => (
            <div
              key={service.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{service.name}</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {t(STATUS_LABEL[service.status] ?? service.status)} · $
                  {Number(service.cost_usd ?? 0).toFixed(2)}
                </p>
              </div>
              <span
                className={`size-2 shrink-0 rounded-full ${
                  service.status === "operational" ? "bg-primary" : "bg-muted-foreground/50"
                }`}
              />
            </div>
          ))}
        </Panel>
      ) : (
        <Empty text={t("Sem serviços registados.")} />
      )}

      <p className="pt-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        {t("Execuções")}
      </p>
      {data?.runs.length ? (
        <Panel className="divide-y divide-hairline">
          {data.runs.map((run: (typeof data.runs)[number]) => (
            <div
              key={run.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{run.label}</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {relativeTime(run.created_at)}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] text-muted-foreground">{run.status}</span>
            </div>
          ))}
        </Panel>
      ) : (
        <Empty text={t("Sem execuções recentes.")} />
      )}

      <div className="grid grid-cols-2 gap-2.5 pt-2">
        <button
          onClick={toggle}
          className="rounded-2xl border border-hairline py-3.5 text-[15px] font-medium transition-transform duration-200 active:scale-95"
        >
          {t("Tema")} {theme === "dark" ? t("claro") : t("escuro")}
        </button>
        <Link
          to="/neoverbis-pay"
          className="rounded-2xl border border-hairline py-3.5 text-center text-[15px] font-medium transition-transform duration-200 active:scale-95"
        >
          {t("Planos & Preços")}
        </Link>
      </div>

      <NativeTerminalModal
        open={terminalModalOpen}
        onClose={() => setTerminalModalOpen(false)}
      />
    </Screen>
  );
}
