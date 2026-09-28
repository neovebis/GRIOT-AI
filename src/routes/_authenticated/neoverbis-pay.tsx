import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PlanCheckoutDialog } from "@/components/griot/plan-checkout-dialog";
import {
  ensureFreeAllowance,
  getActivePlan,
  reconcileCheckoutSession,
} from "@/lib/payments.functions";
import { PLAN_PRICE_IDS, getStripeEnvironment } from "@/lib/stripe";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Sparkles, ShieldCheck, Coins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Screen, Panel } from "@/components/griot/screen";
import { useT } from "@/lib/i18n";
import { GRIOT_PLANS, type PlanDefinition } from "@/lib/plans";
import { useCurrentUser } from "@/hooks/use-user";
import { getLocalGcuTier, setLocalGcuTier } from "@/lib/gcu-service";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/neoverbis-pay")({
  head: () => ({
    meta: [
      { title: "Planos & Assinatura — GRIOT Studio" },
      {
        name: "description",
        content:
          "Planos do GRIOT: Free, BASE, Starter, Plus e Pro. Escolha o poder de computação ideal em GCU para os seus projetos.",
      },
      { property: "og:title", content: "Planos & Assinatura — GRIOT Studio" },
      {
        property: "og:description",
        content: "Planos oficiais e gestão de GCU do GRIOT Studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansAndPricingPage,
});

type TabView = "plans" | "wallet";

interface TransactionRow {
  id: string;
  label: string;
  amount_gcu: number | null;
  created_at: string;
}

export function PlansAndPricingPage() {
  const t = useT();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabView>("plans");
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanDefinition | null>(null);
  const fetchActivePlan = useServerFn(getActivePlan);
  const grantFreeAllowance = useServerFn(ensureFreeAllowance);
  const reconcileCheckout = useServerFn(reconcileCheckoutSession);

  // O plano vem sempre das assinaturas pagas, nunca de uma escolha local.
  useEffect(() => {
    if (!user?.id) return;
    let env: "sandbox" | "live";
    try {
      env = getStripeEnvironment();
    } catch {
      return;
    }
    void fetchActivePlan({ data: { environment: env } })
      .then((res) => {
        if ("plan" in res && res.plan !== getLocalGcuTier()) {
          setLocalGcuTier(res.plan);
          void queryClient.invalidateQueries({ queryKey: ["user-plan-and-wallet"] });
        }
      })
      .catch(() => undefined);
  }, [user?.id, fetchActivePlan, queryClient]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    void grantFreeAllowance()
      .then(async (freeResult) => {
        if ("error" in freeResult) throw new Error(freeResult.error);

        const sessionId = new URLSearchParams(window.location.search).get("session_id");
        if (sessionId) {
          const paidResult = await reconcileCheckout({
            data: { sessionId, environment: getStripeEnvironment() },
          });
          if ("error" in paidResult) throw new Error(paidResult.error);
          if (!cancelled) {
            setLocalGcuTier(paidResult.plan);
            toast.success(t("Pagamento confirmado. O plano e os GCU já estão ativos."));
            window.history.replaceState({}, "", "/neoverbis-pay");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["user-plan-and-wallet"] });
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, grantFreeAllowance, reconcileCheckout, queryClient, t]);

  const { data: walletData } = useQuery({
    queryKey: ["user-plan-and-wallet", user?.id],
    queryFn: async () => {
      const currentUserId = user?.id;
      if (!currentUserId) {
        return {
          tier: "free",
          balance_gcu: 0,
          handle: "@griot",
          transactions: [] as TransactionRow[],
        };
      }

      const workspaceId = await getCurrentWorkspaceId(currentUserId);
      const handle = `@${(user.email ?? "griot").split("@")[0]}`.slice(0, 24);

      if (!workspaceId) {
        return {
          tier: getLocalGcuTier().toLowerCase(),
          balance_gcu: 0,
          handle,
          transactions: [] as TransactionRow[],
        };
      }

      const [walletRes, transRes] = await Promise.all([
        supabase
          .from("griot_gcu_wallets")
          .select("balance_gcu")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase
          .from("griot_gcu_ledger")
          .select("id, event_type, reason, amount_gcu, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const transactions: TransactionRow[] = (transRes.data ?? []).map((row) => ({
        id: row.id,
        label: row.reason ?? row.event_type,
        amount_gcu: row.amount_gcu,
        created_at: row.created_at,
      }));

      return {
        tier: getLocalGcuTier().toLowerCase(),
        balance_gcu: Number(walletRes.data?.balance_gcu ?? 0),
        handle,
        transactions,
      };
    },
  });

  const currentTier = walletData?.tier || "free";
  const currentBalance = walletData?.balance_gcu ?? 0;

  function handleSelectPlan(plan: PlanDefinition) {
    if (plan.id === currentTier) {
      toast.info(t("Já se encontra neste plano."));
      return;
    }
    if (plan.id === "free") {
      toast.info(t("Para voltar ao Free, cancela a assinatura atual."));
      return;
    }
    const priceId = PLAN_PRICE_IDS[plan.id];
    if (!priceId || !user?.id) {
      toast.error(t("Inicia sessão para assinar um plano."));
      return;
    }
    try {
      getStripeEnvironment();
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    setProcessingPlan(null);
    setCheckoutPlan(plan);
  }

  return (
    <Screen
      title={t("Planos & Faturação")}
      subtitle={t("GRIOT Studio Subscrições")}
      action={
        <Link
          to="/control"
          aria-label={t("Voltar")}
          className="grid size-10 place-items-center rounded-full border border-hairline hover:bg-secondary/40 transition-colors"
        >
          <ArrowLeft className="size-[18px]" />
        </Link>
      }
    >
      <div className="flex rounded-2xl border border-hairline bg-secondary/20 p-1">
        <button
          onClick={() => setActiveTab("plans")}
          className={`flex-1 rounded-xl py-2 text-[13.5px] font-medium transition-all ${
            activeTab === "plans"
              ? "bg-background text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("Planos de Assinatura")}
        </button>
        <button
          onClick={() => setActiveTab("wallet")}
          className={`flex-1 rounded-xl py-2 text-[13.5px] font-medium transition-all ${
            activeTab === "wallet"
              ? "bg-background text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("Carteira & GCU")}
        </button>
      </div>

      {activeTab === "plans" ? (
        <div className="space-y-6">
          <Panel className="flex items-center justify-between gap-4 border border-hairline bg-card/60">
            <div className="min-w-0">
              <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase block">
                {t("Plano Ativo")}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[20px] font-bold tracking-tight capitalize text-foreground">
                  GRIOT {currentTier}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-primary">
                  <Coins className="size-3" />
                  {currentBalance.toFixed(0)} GCU
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[12px] text-muted-foreground block">{t("Renovação")}</span>
              <span className="text-[13px] font-medium text-foreground">{t("Mensal")}</span>
            </div>
          </Panel>

          <div className="space-y-4">
            {GRIOT_PLANS.map((plan) => {
              const isCurrent = plan.id === currentTier;
              const isHighlighted = plan.badge !== undefined;

              return (
                <div
                  key={plan.id}
                  id={`plan-card-${plan.id}`}
                  className={`relative rounded-3xl border p-5 transition-all ${
                    isHighlighted
                      ? "border-primary/50 bg-gradient-to-b from-primary/5 via-card to-card shadow-md"
                      : "border-hairline bg-card"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold text-primary-foreground uppercase tracking-wider shadow-sm flex items-center gap-1">
                      <Sparkles className="size-3" />
                      {plan.badge}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[20px] font-bold tracking-tight text-foreground">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
                        {plan.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-hairline/60 flex items-baseline gap-2">
                    <span className="text-[34px] font-extrabold tracking-tight text-foreground">
                      {plan.priceMonthly}€
                    </span>
                    <span className="text-[14px] text-muted-foreground">/ {t("mês")}</span>

                    {plan.originalPriceMonthly && (
                      <span className="text-[16px] text-muted-foreground/60 line-through ml-1">
                        {plan.originalPriceMonthly}€
                      </span>
                    )}
                  </div>

                  {plan.savingsMonthly && (
                    <p className="mt-0.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                      {plan.savingsMonthly}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-2xl bg-secondary/30 p-3 text-[12.5px]">
                    <div>
                      <span className="text-muted-foreground block text-[11px] uppercase tracking-wider">
                        GCU
                      </span>
                      <span className="font-semibold text-foreground">{plan.gcuLabel}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] uppercase tracking-wider">
                        ModelOS Apps
                      </span>
                      <span className="font-semibold text-foreground">{plan.modelOsLabel}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] uppercase tracking-wider">
                        {t("Integrações")}
                      </span>
                      <span className="font-semibold text-foreground">
                        {plan.integrationsLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <span className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      {t("Limites")}
                    </span>
                    <ul className="space-y-1 text-[13px] text-muted-foreground">
                      {plan.limits.map((limit, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-muted-foreground/60 font-mono text-[11px] mt-0.5">
                            •
                          </span>
                          <span>{limit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <span className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      {t("Inclui")}
                    </span>
                    <ul className="space-y-1.5 text-[13px] text-foreground">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="size-4 text-primary shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    id={`btn-select-plan-${plan.id}`}
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrent || processingPlan === plan.id}
                    className={`mt-5 w-full rounded-2xl py-3 text-[14.5px] font-semibold transition-all duration-200 active:scale-[0.98] ${
                      isCurrent
                        ? "border border-hairline bg-secondary/40 text-muted-foreground cursor-default"
                        : isHighlighted
                          ? "bg-primary text-primary-foreground shadow-md hover:opacity-95"
                          : "border border-hairline bg-card hover:bg-secondary/40 text-foreground"
                    }`}
                  >
                    {processingPlan === plan.id
                      ? t("A processar…")
                      : isCurrent
                        ? t("Plano Atual")
                        : plan.ctaLabel}
                  </button>

                  <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                    {plan.footnote}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-hairline bg-secondary/10 p-4 space-y-2 text-[12.5px] text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ShieldCheck className="size-4 text-emerald-500" />
              <span>{t("Faturação Transparente & Segura")}</span>
            </div>
            <p>
              {t(
                "Pode alterar de plano ou cancelar a qualquer momento sem taxas ocultas. As unidades computacionais GCU contratadas são disponibilizadas imediatamente.",
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Panel>
            <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {t("Saldo Disponível")}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-semibold tracking-tight tabular-nums">
                {currentBalance.toFixed(0)}
              </span>
              <span className="text-[15px] text-muted-foreground">GCU</span>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {walletData?.handle ?? "@griot"} · {t("Plano")} {currentTier.toUpperCase()}
            </p>
          </Panel>

          <p className="pt-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("Histórico de Movimentos")}
          </p>

          {walletData?.transactions && walletData.transactions.length > 0 ? (
            <Panel className="divide-y divide-hairline">
              {walletData.transactions.map((tx) => {
                const amount = Number(tx.amount_gcu ?? 0);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium">{tx.label}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[14px] font-medium tabular-nums ${
                        amount < 0 ? "text-muted-foreground" : "text-primary font-bold"
                      }`}
                    >
                      {amount > 0 ? "+" : ""}
                      {amount.toFixed(0)} GCU
                    </span>
                  </div>
                );
              })}
            </Panel>
          ) : (
            <Panel className="text-center py-6 text-[13.5px] text-muted-foreground">
              {t("Sem movimentos recentes de GCU.")}
            </Panel>
          )}
        </div>
      )}
      <PlanCheckoutDialog
        priceId={checkoutPlan ? (PLAN_PRICE_IDS[checkoutPlan.id] ?? null) : null}
        planName={checkoutPlan?.name ?? ""}
        onClose={() => setCheckoutPlan(null)}
      />
    </Screen>
  );
}

export default PlansAndPricingPage;
