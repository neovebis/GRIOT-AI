import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

const PRICE_GCU: Record<string, { gcu: number; name: string }> = {
  griot_base_monthly: { gcu: 150, name: "BASE" },
  griot_starter_monthly: { gcu: 250, name: "Starter" },
  griot_plus_monthly: { gcu: 750, name: "Plus" },
  griot_pro_monthly: { gcu: 1200, name: "Pro" },
};

/** Cada fatura paga de uma assinatura credita os GCU do plano na carteira. */
async function grantForInvoice(invoice: any, env: StripeEnv) {
  const line = invoice.lines?.data?.[0];
  const lookup: string =
    line?.price?.lookup_key ??
    line?.metadata?.lookup_key ??
    line?.pricing?.price_details?.price_lookup_key ??
    "";

  let plan = PRICE_GCU[lookup];
  let userId: string | undefined =
    invoice.subscription_details?.metadata?.userId ??
    invoice.metadata?.userId ??
    invoice.parent?.subscription_details?.metadata?.userId;

  const subId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;

  if ((!plan || !userId) && subId) {
    const { createStripeClient } = await import("@/lib/stripe.server");
    const stripe = createStripeClient(env);
    const sub = await stripe.subscriptions.retrieve(String(subId), {
      expand: ["items.data.price"],
    });
    const price = sub.items.data[0]?.price;
    const subLookup = (typeof price === "object" ? price?.lookup_key : null) ?? "";
    plan = plan ?? PRICE_GCU[subLookup];
    userId = userId ?? sub.metadata?.userId;
  }

  if (!plan || !userId) {
    console.warn(
      `[Webhook] Ignoring invoice ${invoice.id}: plan or userId not found. Lookup: ${lookup}, User: ${userId}`,
    );
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: member } = await (supabaseAdmin as any)
    .from("griot_workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member?.workspace_id) {
    console.error(`[Webhook] Workspace not found for user ${userId}`);
    return;
  }

  const { error } = await supabaseAdmin.rpc("griot_gcu_grant", {
    p_workspace_id: member.workspace_id,
    p_amount: plan.gcu,
    p_idempotency_key: `stripe-invoice-${env}-${invoice.id}`,
    p_reason: `Plano ${plan.name} (pagamento confirmado)`,
    p_source: "stripe_subscription",
    p_actor_id: userId,
  });

  if (error) {
    console.error(`[Webhook] GCU grant failed: ${error.message}`);
    throw new Error(`Não foi possível creditar GCU: ${error.message}`);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          const event = await verifyWebhook(request, rawEnv);
          if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
            await grantForInvoice(event.data.object, rawEnv);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
