import { supabase } from "@/integrations/supabase/client";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { getPlan } from "@/lib/plans";

export interface GcuWalletState {
  balance: number;
  tier: string;
  handle: string;
  totalSpent: number;
}

const GCU_STORAGE_BALANCE_KEY = "griot_gcu_balance_v1";
const GCU_STORAGE_TIER_KEY = "griot_gcu_tier_v1";

/**
 * Último saldo conhecido vindo do servidor (apenas espelho de leitura).
 * Se não houver valor sincronizado, inicia com 5 no Free.
 */
export function getLocalGcuBalance(): number {
  if (typeof window === "undefined") return 5;
  const stored = localStorage.getItem(GCU_STORAGE_BALANCE_KEY);
  if (stored === null) return 5;
  const val = Number(stored);
  return Number.isFinite(val) ? val : 5;
}

export function getLocalGcuTier(): string {
  if (typeof window === "undefined") return "free";
  return localStorage.getItem(GCU_STORAGE_TIER_KEY) || "free";
}

export function setLocalGcuTier(tier: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GCU_STORAGE_TIER_KEY, tier);
}

function cacheBalance(balance: number, tier: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GCU_STORAGE_BALANCE_KEY, String(balance));
  localStorage.setItem(GCU_STORAGE_TIER_KEY, tier);
}

/**
 * Carrega a carteira real do utilizador a partir do Supabase.
 * Se a carteira ainda não existir, cria a carteira inicial com 5 GCU do plano Free.
 */
export async function fetchUserGcuWallet(userId?: string): Promise<GcuWalletState> {
  const localTier = getLocalGcuTier();

  if (!userId || userId === "anonymous") {
    return { balance: getLocalGcuBalance(), tier: localTier, handle: "@local", totalSpent: 0 };
  }

  try {
    const workspaceId = await getCurrentWorkspaceId(userId);
    if (!workspaceId) {
      cacheBalance(5, localTier);
      return { balance: 5, tier: localTier, handle: "@griot", totalSpent: 0 };
    }

    const [walletRes, profileRes] = await Promise.all([
      supabase
        .from("griot_gcu_wallets")
        .select("balance_gcu, lifetime_used_gcu")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase.from("griot_user_profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);

    let wallet = walletRes.data;
    const handle = profileRes.data?.display_name
      ? `@${profileRes.data.display_name.replace(/\s+/g, "").toLowerCase()}`
      : "@griot";

    // Se o utilizador ainda não tem carteira no Supabase, criamos a carteira inicial com 5 GCU
    if (!wallet && workspaceId) {
      try {
        const { data: newWallet } = await supabase
          .from("griot_gcu_wallets")
          .insert({
            workspace_id: workspaceId,
            balance_gcu: 5,
            lifetime_used_gcu: 0,
            reserved_gcu: 0,
            debt_gcu: 0,
            version: 1,
          })
          .select("balance_gcu, lifetime_used_gcu")
          .maybeSingle();

        if (newWallet) {
          wallet = newWallet;
          // Regista o bónus inicial no livro-razão (griot_gcu_ledger)
          void (supabase as any).from("griot_gcu_ledger").insert({
            workspace_id: workspaceId,
            event_type: "welcome_credit",
            amount_gcu: 5,
            balance_delta_gcu: 5,
            debt_delta_gcu: 0,
            reserved_delta_gcu: 0,
            reason: "Bónus Inicial Plano Free (5 GCU)",
            source: "griot-system",
            idempotency_key: `welcome-${userId}`,
            metadata: { plan: localTier },
          });
        }
      } catch (err) {
        console.warn("[GCU] Erro ao inicializar carteira no Supabase:", err);
      }
    }

    if (!wallet) {
      const fallbackBalance = Math.max(5, getLocalGcuBalance());
      cacheBalance(fallbackBalance, localTier);
      return { balance: fallbackBalance, tier: localTier, handle, totalSpent: 0 };
    }

    const remoteBalance = Number(wallet.balance_gcu ?? 5);
    const remoteTier = localTier;
    cacheBalance(remoteBalance, remoteTier);

    return {
      balance: remoteBalance,
      tier: remoteTier,
      handle,
      totalSpent: Number(wallet.lifetime_used_gcu ?? 0),
    };
  } catch {
    return { balance: getLocalGcuBalance(), tier: localTier, handle: "@griot", totalSpent: 0 };
  }
}

const SHEOL_TRIAL_KEY = "griot_sheol_trial_used_v1";

/** Anúncios só aparecem no plano Free. */
export function planShowsAds(tier: string = getLocalGcuTier()): boolean {
  return getPlan(tier).showsAds;
}

/** No Free, o SHEOL requer saldo de GCUs ativo e autorização de teste. */
export function canUseSheol(userId?: string, tier: string = getLocalGcuTier()): boolean {
  if (getPlan(tier).sheolUnlimited) return true;
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${SHEOL_TRIAL_KEY}:${userId ?? "anon"}`) !== "1";
}

export function markSheolTrialUsed(userId?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${SHEOL_TRIAL_KEY}:${userId ?? "anon"}`, "1");
}

/**
 * Valida se o utilizador tem GCU suficiente para realizar uma execução (BASE ou SHEOL).
 * Sem saldo (> 0), a execução é estritamente bloqueada no Supabase.
 */
export function checkGcuAllowance(
  wallet: GcuWalletState,
  requiredGcu = 1,
): { allowed: boolean; balance: number; reason?: string } {
  if (wallet.balance <= 0) {
    return {
      allowed: false,
      balance: 0,
      reason:
        "Saldo de GCU esgotado (0 GCU). Atingiste o limite do teu plano. Para continuar a utilizar o modo BASE e SHEOL, adquire mais GCUs ou atualiza o teu plano.",
    };
  }

  if (wallet.balance < requiredGcu) {
    return {
      allowed: false,
      balance: wallet.balance,
      reason: `Saldo de GCU insuficiente (${wallet.balance} GCU disponíveis, necessários ${requiredGcu} GCU).`,
    };
  }

  return { allowed: true, balance: wallet.balance };
}

/**
 * Consome GCU de forma real no Supabase (carteira + livro razão) e sincroniza localmente
 */
export async function consumeGcu(params: {
  userId?: string;
  amount: number;
  label: string;
  modelId?: string;
}): Promise<number> {
  const { userId, amount, label, modelId } = params;
  const current = getLocalGcuBalance();
  const newBalance = Math.max(0, current - amount);

  if (typeof window !== "undefined") {
    localStorage.setItem(GCU_STORAGE_BALANCE_KEY, String(newBalance));
    window.dispatchEvent(
      new CustomEvent("griot:gcu-updated", {
        detail: { balance: newBalance, consumed: amount, label },
      }),
    );
  }

  if (userId && userId !== "anonymous") {
    try {
      const workspaceId = await getCurrentWorkspaceId(userId);
      if (workspaceId) {
        // 1. Tenta invocar a RPC atómica griot_gcu_meter_event no Supabase
        const { error: rpcErr } = await supabase.rpc("griot_gcu_meter_event", {
          p_workspace_id: workspaceId,
          p_user_id: userId,
          p_idempotency_key: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          p_component: "griot-app",
          p_operation: label,
          p_metrics: { gcu: amount, model_id: modelId ?? null },
        });

        // 2. Fallback de atualização direta de tabelas se a RPC não estiver disponível
        if (rpcErr) {
          const { data: currentWallet } = await supabase
            .from("griot_gcu_wallets")
            .select("balance_gcu, lifetime_used_gcu")
            .eq("workspace_id", workspaceId)
            .maybeSingle();

          const prevBalance = Number(currentWallet?.balance_gcu ?? 5);
          const prevUsed = Number(currentWallet?.lifetime_used_gcu ?? 0);
          const updatedBalance = Math.max(0, prevBalance - amount);
          const updatedUsed = prevUsed + amount;

          await supabase
            .from("griot_gcu_wallets")
            .update({
              balance_gcu: updatedBalance,
              lifetime_used_gcu: updatedUsed,
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", workspaceId);

          // Registar entrada no griot_gcu_ledger
          void (supabase as any).from("griot_gcu_ledger").insert({
            workspace_id: workspaceId,
            event_type: "usage_debit",
            amount_gcu: amount,
            balance_delta_gcu: -amount,
            debt_delta_gcu: 0,
            reserved_delta_gcu: 0,
            reason: label,
            source: "griot-app",
            idempotency_key: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            metadata: { model_id: modelId ?? null },
          });

          cacheBalance(updatedBalance, getLocalGcuTier());
          return updatedBalance;
        }
      }
    } catch (err) {
      console.warn("[GCU] Erro ao registar consumo real no Supabase:", err);
    }
  }

  return newBalance;
}
