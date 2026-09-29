import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Screen, Panel, Empty } from "@/components/griot/screen";
import { UsageSection, DailyPulse, type RunRow, type ServiceRow } from "@/components/griot/usage";
import { ApiBudgetPanel } from "@/components/griot/api-budget";
import { ApisPanel } from "@/components/griot/acp-panel";
import { useT } from "@/lib/i18n";
import { greeting, relativeTime } from "@/lib/griot";
import { useTheme } from "@/lib/theme";
import { UserAvatar } from "@/components/griot/user-avatar";
import { useCurrentUser } from "@/hooks/use-user";
import { Moon, Sun, ChevronRight, Wallet, AlertTriangle, ShieldCheck } from "lucide-react";
import { getUnifiedProjects, getActiveProjectSync } from "@/lib/project-service";
import { fetchUserGcuWallet, getLocalUsageLog, type GcuWalletState } from "@/lib/gcu-service";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — GRIOT Mobile" },
      {
        name: "description",
        content:
          "Consumo de GCU, uso diário e semanal, projeto ativo e agentes — o teu ecossistema num só ecrã.",
      },
      { property: "og:title", content: "Home — GRIOT Mobile" },
      { property: "og:description", content: "Consumo de GCU, uso diário e semanal, num só ecrã." },
    ],
  }),
  component: HomePage,
});

const BUILD_LABEL_SOURCE: Record<string, string> = {
  success: "Concluído",
  running: "A correr",
  failed: "Falhou",
  idle: "Em espera",
};

function HomePage() {
  const { theme, toggle } = useTheme();
  const t = useT();
  const queryClient = useQueryClient();
  const { displayName, email, avatarUrl } = useCurrentUser();

  // Escuta atualizações de consumo de GCU em tempo real para recarregar os dados do painel
  useEffect(() => {
    const handleGcuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    };
    window.addEventListener("griot:gcu-updated", handleGcuUpdated);
    return () => {
      window.removeEventListener("griot:gcu-updated", handleGcuUpdated);
    };
  }, [queryClient]);

  const { data } = useQuery({
    queryKey: ["home", email, displayName],
    queryFn: async () => {
      try {
        const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
        const { data: authData } = await supabase.auth.getUser();
        const currentUser = authData?.user ?? null;

        const profilePromise = currentUser
          ? (supabase as any)
              .from("griot_user_profiles")
              .select("display_name, avatar_url")
              .eq("id", currentUser.id)
              .maybeSingle()
          : Promise.resolve({ data: null });

        // Carrega a carteira real do utilizador (garante criação inicial com 5 GCU se for novo)
        const walletPromise = fetchUserGcuWallet(currentUser?.id);
        const workspaceId = currentUser?.id ? await getCurrentWorkspaceId(currentUser.id) : null;

        const [profile, projectsRes, pipelineRes, ledgerRes, credsRes, opbEventsRes, wallet] =
          await Promise.all([
            profilePromise,
            (supabase as any)
              .from("griot_studio_projects")
              .select("id, name, description, brief, archived, created_at, updated_at")
              .eq("archived", false)
              .order("updated_at", { ascending: false }),
            (supabase as any).from("griot_pipeline_configs").select("nodes").limit(1).maybeSingle(),
            workspaceId
              ? (supabase as any)
                  .from("griot_gcu_ledger")
                  .select("id, amount_gcu, event_type, reason, created_at")
                  .eq("workspace_id", workspaceId)
                  .gte("created_at", since)
                  .order("created_at", { ascending: false })
                  .limit(100)
              : Promise.resolve({ data: [] }),
            (supabase as any)
              .from("griot_credentials")
              .select("id, provider_id, label, kind, status")
              .eq("status", "active"),
            (supabase as any)
              .from("griot_opb_events")
              .select("id, event_type, payload, created_at")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            walletPromise,
          ]);

        const localName =
          typeof window !== "undefined" ? localStorage.getItem("griot_user_name") : null;
        const localEmail =
          typeof window !== "undefined" ? localStorage.getItem("griot_user_email") : null;

        const resolvedName =
          profile?.data?.display_name ||
          currentUser?.user_metadata?.display_name ||
          currentUser?.user_metadata?.name ||
          currentUser?.user_metadata?.full_name ||
          displayName ||
          localName ||
          (currentUser?.email ? currentUser.email.split("@")[0] : null) ||
          (localEmail ? localEmail.split("@")[0] : null) ||
          (email ? email.split("@")[0] : "");

        const resolvedAvatar =
          profile?.data?.avatar_url ||
          currentUser?.user_metadata?.avatar_url ||
          currentUser?.user_metadata?.picture ||
          avatarUrl ||
          (typeof window !== "undefined" ? localStorage.getItem("griot_user_avatar") : null);

        // Projetos reais unificados (do Supabase e de griot_local_projects)
        const mappedProjects = await getUnifiedProjects();
        const activeProj = getActiveProjectSync();

        // Nós ativos do pipeline multi-agente
        const pipelineNodes = Array.isArray(pipelineRes?.data?.nodes) ? pipelineRes.data.nodes : [];
        const activeAgentsCount =
          pipelineNodes.length > 0
            ? pipelineNodes.filter((n: any) => n.enabled !== false).length
            : 4;

        // Registo real de consumos do griot_gcu_ledger no Supabase e cache local
        const rawLedger = Array.isArray(ledgerRes?.data) ? ledgerRes.data : [];
        const localUsage = getLocalUsageLog();

        // Combina o ledger do Supabase e as execuções locais sem duplicados
        const combinedUsageMap = new Map<string, any>();
        for (const item of rawLedger) {
          combinedUsageMap.set(item.id || item.created_at, item);
        }
        for (const item of localUsage) {
          if (!combinedUsageMap.has(item.id) && !combinedUsageMap.has(item.created_at)) {
            combinedUsageMap.set(item.id, item);
          }
        }

        const allEntries = Array.from(combinedUsageMap.values());
        const mappedRuns: RunRow[] = allEntries
          .filter(
            (u: any) =>
              u.event_type === "usage_debit" ||
              (Number(u.amount_gcu) > 0 && !String(u.event_type || "").includes("credit")),
          )
          .map((u: any) => ({
            created_at: u.created_at,
            cost_usd: Number(u.amount_gcu ?? 1), // cost_usd representa os GCUs reais consumidos
            duration_ms: 0,
          }));

        // Serviços e credenciais ativas
        const rawCreds = credsRes?.data || [];
        const mappedServices: ServiceRow[] = rawCreds.map((c: any) => ({
          name: c.label || c.provider_id,
          kind: c.kind,
          status: c.status === "active" ? "operational" : "degraded",
          cost_usd: 0,
          usage_units: 1,
        }));

        // Último alerta / evento OPB
        const latestOpb = opbEventsRes?.data;
        const alertObj = latestOpb
          ? {
              id: latestOpb.id,
              message: `OPB Evento: ${latestOpb.event_type.replace(/_/g, " ")}`,
              created_at: latestOpb.created_at,
            }
          : null;

        return {
          profile: {
            display_name: resolvedName,
            active_project_id: activeProj?.id || mappedProjects[0]?.id || null,
            desktop_online: true,
            avatar_url: resolvedAvatar,
          },
          wallet,
          projects: mappedProjects,
          activeAgents: activeAgentsCount,
          alert: alertObj,
          runs: mappedRuns,
          services: mappedServices,
        };
      } catch (err) {
        console.warn("Falha na consulta da Home, usando carteira local:", err);
        const localProjects = await getUnifiedProjects();
        const activeProj = getActiveProjectSync();
        const fallbackWallet = await fetchUserGcuWallet();
        return {
          profile: {
            display_name: displayName || "GRIOT",
            active_project_id: activeProj?.id || localProjects[0]?.id || null,
            desktop_online: false,
            avatar_url: avatarUrl || null,
          },
          wallet: fallbackWallet,
          projects: localProjects,
          activeAgents: 2,
          alert: null,
          runs: [] as RunRow[],
          services: [] as ServiceRow[],
        };
      }
    },
  });

  const active =
    data?.projects.find((project) => project.id === data.profile?.active_project_id) ??
    data?.projects[0];

  const headerTitle =
    data?.profile?.display_name ||
    displayName ||
    (typeof window !== "undefined" ? localStorage.getItem("griot_user_name") : null) ||
    (email ? email.split("@")[0] : "") ||
    "";

  const wallet: GcuWalletState = data?.wallet || {
    balance: 5,
    tier: "free",
    handle: "@griot",
    totalSpent: 0,
  };

  const isWalletDepleted = wallet.balance <= 0;

  return (
    <Screen
      subtitle={t(greeting())}
      icon={
        <UserAvatar
          name={headerTitle}
          email={email}
          avatarUrl={
            avatarUrl || (data?.profile as unknown as { avatar_url?: string })?.avatar_url || null
          }
          size="sm"
        />
      }
      title={headerTitle}
      action={
        <button
          onClick={toggle}
          aria-label={t("Alternar tema")}
          className="grid size-10 place-items-center rounded-full border border-hairline bg-surface transition-transform duration-200 active:scale-95"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      }
    >
      {/* Cartão de Estado Real da Carteira GCU */}
      <div
        className={`rounded-2xl border p-4 transition-all shadow-xs ${
          isWalletDepleted
            ? "border-amber-500/40 bg-amber-500/10 text-foreground"
            : "border-hairline bg-surface/80 text-foreground"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`grid size-9 place-items-center rounded-xl ${
                isWalletDepleted
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {isWalletDepleted ? (
                <AlertTriangle className="size-5" />
              ) : (
                <Wallet className="size-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-tight">
                  {wallet.balance.toFixed(0)} GCU
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Plano {wallet.tier}
                </span>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-tight mt-0.5">
                {isWalletDepleted
                  ? t("Saldo esgotado (0 GCU). Modo BASE e SHEOL bloqueados.")
                  : t("Saldo real em carteira sincronizado com o Supabase")}
              </p>
            </div>
          </div>

          <Link
            to="/pay"
            className="shrink-0 flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-[12px] font-semibold hover:opacity-90 active:scale-95 transition-all shadow-xs"
          >
            <span>{isWalletDepleted ? t("Recarregar GCU") : t("Planos & GCU")}</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <DailyPulse runs={data?.runs ?? []} />

      <ApiBudgetPanel services={data?.services ?? []} />

      <ApisPanel />

      <UsageSection runs={data?.runs ?? []} services={data?.services ?? []} />

      {active ? (
        (() => {
          const progressVal = Math.min(100, Math.max(0, Number(active.progress ?? 0)));
          return (
            <Link to="/projects/$projectId" params={{ projectId: active.id }} className="block">
              <Panel>
                <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Projeto ativo")}
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="truncate min-w-0 flex-1 text-[26px] leading-normal py-0.5 font-semibold tracking-tight">
                    {active.name}
                  </span>
                  <span className="text-[20px] font-semibold tabular-nums shrink-0">
                    {progressVal}%
                  </span>
                </div>
                <div className="mt-3.5 h-[3px] w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${progressVal}%` }}
                  />
                </div>
              </Panel>
            </Link>
          );
        })()
      ) : (
        <Empty text={t("Ainda não existe nenhum projeto.")} />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t("Agentes")}
          </p>
          <p className="mt-1.5 text-[26px] leading-snug py-0.5 font-semibold tracking-tight">
            {data?.activeAgents ?? 0}
          </p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t("ativos")}</p>
        </Panel>
        <Panel>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t("Build")}
          </p>
          <p className="mt-1.5 text-[26px] leading-snug py-0.5 font-semibold tracking-tight truncate">
            {t(BUILD_LABEL_SOURCE[String((active as any)?.build_status ?? "idle")] ?? "Em espera")}
          </p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {data?.profile?.desktop_online ? t("Desktop online") : t("Desktop offline")}
          </p>
        </Panel>
      </div>

      {data?.alert ? (
        <Panel>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t("Último alerta")}
          </p>
          <p className="mt-1.5 text-[17px] font-medium">{data.alert.message}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {relativeTime(data.alert.created_at)}
          </p>
        </Panel>
      ) : null}

      <Link to="/chat" className="block">
        <Panel className="flex items-center justify-between">
          <span className="text-[16px] font-medium">{t("Continuar a conversa")}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Panel>
      </Link>
    </Screen>
  );
}
