import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { GriotMark } from "@/components/griot/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/oauth-callback")({
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [statusMessage, setStatusMessage] = useState("A processar autorização da conta...");

  useEffect(() => {
    async function processCallback() {
      try {
        // 1. Inspeciona a hash (#access_token=...&provider_token=...) e search (?code=...)
        const hash = window.location.hash ? window.location.hash.slice(1) : "";
        const search = window.location.search ? window.location.search.slice(1) : "";

        const hashParams = new URLSearchParams(hash);
        const searchParams = new URLSearchParams(search);

        let providerToken = hashParams.get("provider_token") || searchParams.get("provider_token");
        let accessToken = hashParams.get("access_token") || searchParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token");

        // Se houver access_token do Supabase, restaura a sessão
        if (accessToken && refreshToken) {
          try {
            const { data } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (data.session?.provider_token && !providerToken) {
              providerToken = data.session.provider_token;
            }
          } catch (e) {
            console.warn("[OAuthCallback] Falha ao sincronizar sessão Supabase:", e);
          }
        }

        // Se ainda não tivermos provider_token, tenta ler da sessão atual
        if (!providerToken) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.provider_token) {
            providerToken = data.session.provider_token;
          }
          if (!accessToken && data.session?.access_token) {
            accessToken = data.session.access_token;
          }
        }

        // 2. Se estiver numa janela Popup (window.opener)
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage(
              {
                type: "GRIOT_PLUGIN_OAUTH_CALLBACK",
                providerToken: providerToken || accessToken,
                accessToken,
                hash,
                search,
              },
              "*",
            );
          } catch (postErr) {
            console.warn("[OAuthCallback] Falha ao enviar postMessage:", postErr);
          }

          setStatus("success");
          setStatusMessage("Conta autorizada com sucesso! A fechar janela...");

          setTimeout(() => {
            try {
              window.close();
            } catch {
              // Popup pode não fechar se não foi aberta por script
            }
          }, 800);
          return;
        }

        // 3. Se for ambiente nativo ou redirecionamento na mesma janela
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("griot-oauth-success", {
              detail: { providerToken: providerToken || accessToken, accessToken },
            }),
          );

          if (providerToken || accessToken) {
            localStorage.setItem(
              "griot_pending_oauth_callback",
              JSON.stringify({
                providerToken: providerToken || accessToken,
                accessToken,
                timestamp: Date.now(),
              }),
            );
          }
        }

        setStatus("success");
        setStatusMessage("Autorização concluída! A redirecionar para o GRIOT...");
        setTimeout(() => {
          void navigate({ to: "/control", replace: true });
        }, 1200);
      } catch (err: any) {
        console.error("[OAuthCallback] Erro no processamento:", err);
        setStatus("error");
        setStatusMessage(err.message || "Falha ao processar autorização da conta.");
      }
    }

    void processCallback();
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center px-6 py-12 text-center animate-fade-in">
      <GriotMark className="size-16 rounded-2xl shadow-md" />

      <div className="mt-6 flex flex-col items-center">
        {status === "processing" && (
          <>
            <Loader2 className="size-8 animate-spin text-primary mb-3" />
            <h2 className="text-[17px] font-semibold text-foreground">Autorização em Progresso</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{statusMessage}</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 mb-3">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="text-[17px] font-semibold text-foreground">Conectado com Sucesso!</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{statusMessage}</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/15 border border-destructive/30 text-destructive mb-3">
              <Sparkles className="size-6" />
            </div>
            <h2 className="text-[17px] font-semibold text-foreground">Aviso de Autorização</h2>
            <p className="mt-1 text-[13px] text-destructive">{statusMessage}</p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/control", replace: true })}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground"
            >
              Voltar ao GRIOT
            </button>
          </>
        )}
      </div>
    </div>
  );
}
