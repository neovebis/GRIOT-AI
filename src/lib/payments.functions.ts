import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

const PRICE_TO_PLAN: Record<string, string> = {
  griot_base_monthly: "lite",
  griot_starter_monthly: "starter",
  griot_plus_monthly: "plus",
  griot_pro_monthly: "pro",
};

const PLAN_GCU: Record<string, number> = {
  lite: 150,
  starter: 250,
  plus: 750,
  pro: 1200,
};

async function resolveUserWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const member = await supabase
    .from("griot_workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (member.data?.workspace_id) return member.data.workspace_id;

  const provisioned = await supabase.functions.invoke("griot-api/auth/me", { method: "GET" });
  const provisionedWorkspace = provisioned.data?.workspace?.id;
  if (provisioned.error || !provisionedWorkspace) {
    throw new Error("Não foi possível criar a carteira GCU desta conta.");
  }
  return String(provisionedWorkspace);
}

async function grantGcu(
  supabase: SupabaseClient<Database>,
  input: {
    workspaceId: string;
    userId: string;
    amount: number;
    idempotencyKey: string;
    reason: string;
    source: string;
  },
) {
  const { error } = await supabase.rpc("griot_gcu_grant", {
    p_workspace_id: input.workspaceId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
    p_source: input.source,
    p_actor_id: input.userId,
  });
  if (error) throw new Error(error.message);
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!PRICE_TO_PLAN[data.priceId]) throw new Error("Invalid priceId");
    if (data.environment !== "sandbox" && data.environment !== "live")
      throw new Error("Invalid environment");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
      });
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: prices.data[0].id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        managed_payments: { enabled: true },
        metadata: { userId, managed_payments: "true" },
        subscription_data: { metadata: { userId } },
      } as Stripe.Checkout.SessionCreateParams);
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Plano ativo do utilizador, lido diretamente das assinaturas pagas. */
export const getActivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<{ plan: string } | { error: string }> => {
    try {
      const { userId } = context;
      if (!/^[a-zA-Z0-9_-]+$/.test(userId)) return { plan: "free" };
      const stripe = createStripeClient(data.environment);
      const subs = await stripe.subscriptions.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 20,
      });
      const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
      const price = active?.items.data[0]?.price;
      const lookup = (typeof price === "object" ? price?.lookup_key : null) ?? "";
      return { plan: PRICE_TO_PLAN[lookup] ?? "free" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Garante os 5 GCU iniciais exatamente uma vez por conta. */
export const ensureFreeAllowance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ granted: true } | { error: string }> => {
    try {
      const workspaceId = await resolveUserWorkspace(context.supabase, context.userId);
      await grantGcu(context.supabase, {
        workspaceId,
        userId: context.userId,
        amount: 5,
        idempotencyKey: `free-welcome-${context.userId}`,
        reason: "Crédito inicial do plano Free",
        source: "free_plan",
      });
      return { granted: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Não foi possível ativar os 5 GCU.",
      };
    }
  });

/**
 * Confirma um checkout concluído e aplica imediatamente o plano/GCU ao próprio
 * utilizador. É idempotente e não confia apenas no redirecionamento do browser.
 */
export const reconcileCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!/^cs_(test_|live_)?[a-zA-Z0-9_]+$/.test(data.sessionId)) {
      throw new Error("Sessão de pagamento inválida");
    }
    if (data.environment !== "sandbox" && data.environment !== "live") {
      throw new Error("Ambiente de pagamento inválido");
    }
    return data;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ plan: string; balanceUpdated: true } | { error: string }> => {
      try {
        const stripe = createStripeClient(data.environment);
        const session = await stripe.checkout.sessions.retrieve(data.sessionId);
        if (session.metadata?.userId !== context.userId) {
          throw new Error("Este pagamento não pertence à conta atual.");
        }
        if (session.status !== "complete" || session.payment_status === "unpaid") {
          throw new Error("O pagamento ainda não está confirmado.");
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) throw new Error("A assinatura não foi encontrada.");

        // Expandimos o price para garantir que temos o lookup_key
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });

        if (!["active", "trialing", "past_due"].includes(subscription.status)) {
          throw new Error("A assinatura ainda não está ativa.");
        }

        const price = subscription.items.data[0]?.price;
        const lookupKey = (typeof price === "object" ? price?.lookup_key : null) ?? "";
        const plan = PRICE_TO_PLAN[lookupKey];
        const amount = plan ? PLAN_GCU[plan] : undefined;

        if (!plan || !amount) throw new Error("O plano pago não foi reconhecido.");

        const workspaceId = await resolveUserWorkspace(context.supabase, context.userId);
        const invoiceId =
          typeof subscription.latest_invoice === "string"
            ? subscription.latest_invoice
            : subscription.latest_invoice?.id;

        if (!invoiceId) throw new Error("A fatura paga não foi encontrada.");

        await grantGcu(context.supabase, {
          workspaceId,
          userId: context.userId,
          amount,
          idempotencyKey: `stripe-invoice-${data.environment}-${invoiceId}`,
          reason: `Plano ${plan === "lite" ? "BASE" : plan[0].toUpperCase() + plan.slice(1)} (pagamento confirmado)`,
          source: "stripe_subscription",
        });

        return { plan, balanceUpdated: true };
      } catch (error) {
        return { error: getStripeErrorMessage(error) };
      }
    },
  );

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { returnUrl: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    try {
      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, { userId: context.userId });
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
