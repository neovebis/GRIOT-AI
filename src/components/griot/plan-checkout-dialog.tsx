import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createCheckoutSession } from "@/lib/payments.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

export function PlanCheckoutDialog({
  priceId,
  planName,
  onClose,
}: {
  priceId: string | null;
  planName: string;
  onClose: () => void;
}) {
  const createSession = useServerFn(createCheckoutSession);

  const options = useMemo(
    () => ({
      fetchClientSecret: async () => {
        const result = await createSession({
          data: {
            priceId: priceId as string,
            returnUrl: `${window.location.origin}/neoverbis-pay?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
            environment: getStripeEnvironment(),
          },
        });
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error("Pagamento indisponível de momento.");
        return result.clientSecret;
      },
    }),
    [priceId, createSession],
  );

  return (
    <Dialog open={!!priceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assinar {planName}</DialogTitle>
        </DialogHeader>
        {import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN?.startsWith("pk_test_") && (
          <p className="rounded-xl border border-hairline bg-secondary/30 px-3 py-2 text-[12px] text-muted-foreground">
            Modo de teste: nenhum pagamento real é cobrado.
          </p>
        )}
        {priceId && (
          <EmbeddedCheckoutProvider key={priceId} stripe={getStripe()} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
