import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { GriotMark } from "@/components/griot/logo";
import { supabase } from "@/integrations/supabase/client";
import { ensurePrimaryGriotSessionRestored } from "@/lib/plugin-oauth";

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
        const code = searchParams.get("code");

        const isPluginFlow = Boolean(
          searchParams.get("plugin") ||
          hashParams.get("plugin") ||
          (typeof window !== "undefined" && localStorage.getItem("griot_active_oauth_plugin"))
        );
        const pluginId =
          searchParams.get("plugin") ||
          hashParams.get("plugin") ||
          (typeof window !== "undefined" ? localStorage.getItem("griot_active_oauth_plugin") : null) ||
          "github";

        let externalUserMetadata: { username?: string; email?: string; avatarUrl?: string } | null = null;

        // Se o provedor retornou código PKCE, troca pelo token e sessão temporária
        if (code) {
          try {
            const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (!codeErr && codeData?.session) {
              if (codeData.session.provider_token) {
                providerToken = codeData.session.provider_token;
              }
              if (codeData.session.access_token) {
                accessToken = codeData.session.access_token;
              }
              const u = codeData.session.user;
              if (u) {
                externalUserMetadata = {
                  username:
                    u.user_metadata?.user_name ||
                    u.user_metadata?.preferred_username ||
                    u.user_metadata?.name ||
                    u.email?.split("@")[0],
                  email: u.email,
                  avatarUrl: u.user_metadata?.avatar_url || u.user_metadata?.picture,
                };
              }
            }
          } catch (codeExErr) {
            console.warn("[OAuthCallback] Falha ao trocar código PKCE:", codeExErr);
          }
        }

        // Se houver access_token do Supabase e NÃO for fluxo de plugin, sincroniza sessão normalmente
        if (!isPluginFlow && accessToken && refreshToken) {
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

        // Se for fluxo de autorização de PLUGIN:
        if (isPluginFlow) {
          const effectiveToken = providerToken || accessToken;
          if (effectiveToken && typeof window !== "undefined") {
            try {
              localStorage.setItem(`griot_provider_token_${pluginId}`, effectiveToken);
              localStorage.setItem("griot_latest_provider_token", effectiveToken);
            } catch {}
          }

          // Restaura a sessão e perfil primários do GRIOT imediatamente
          await ensurePrimaryGriotSessionRestored();

          // 2. Se estiver numa janela Popup (window.opener)
          if (window.opener && window.opener !== window) {
            try {
              window.opener.postMessage(
                {
                  type: "GRIOT_PLUGIN_OAUTH_CALLBACK",
                  pluginId,
                  providerToken: effectiveToken || null,
                  accessToken: effectiveToken || null,
                  username: externalUserMetadata?.username,
                  email: externalUserMetadata?.email,
                  avatarUrl: externalUserMetadata?.avatarUrl,
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
              } catch {}
            }, 800);
            return;
          }

          // 3. Se for na mesma janela (redirecionamento)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("griot-oauth-success", {
                detail: {
                  pluginId,
                  providerToken: effectiveToken,
                  accessToken: effectiveToken,
                  username: externalUserMetadata?.username,
                  email: externalUserMetadata?.email,
                  avatarUrl: externalUserMetadata?.avatarUrl,
                },
              }),
            );

            if (effectiveToken) {
              localStorage.setItem(
                "griot_pending_oauth_callback",
                JSON.stringify({
                  pluginId,
                  providerToken: effectiveToken,
                  accessToken: effectiveToken,
                  username: externalUserMetadata?.username,
                  email: externalUserMetadata?.email,
                  avatarUrl: externalUserMetadata?.avatarUrl,
                  timestamp: Date.now(),
                }),
              );
            }
          }

          setStatus("success");
          setStatusMessage("Autorização concluída! A voltar ao GRIOT...");
          setTimeout(() => {
            void navigate({ to: "/settings", replace: true });
          }, 1000);
          return;
        }

        // --- FLUXO DE LOGIN PRINCIPAL DO APP ---
        if (!providerToken) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.provider_token) {
            providerToken = data.session.provider_token;
          }
          if (!accessToken && data.session?.access_token) {
            accessToken = data.session.access_token;
          }
        }

        if (providerToken && typeof window !== "undefined") {
          try {
            localStorage.setItem("griot_latest_provider_token", providerToken);
          } catch {}
        }

        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage(
              {
                type: "GRIOT_PLUGIN_OAUTH_CALLBACK",
                providerToken: providerToken || null,
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
            } catch {}
          }, 800);
          return;
        }

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
