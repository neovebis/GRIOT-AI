import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

let isInitialized = false;

/**
 * Inicializa o listener de deep linking do Capacitor para capturar
 * callbacks de autenticação OAuth (ex: com.griot.app://home#access_token=...)
 */
export function initNativeAuthDeepLink(onSuccess?: () => void) {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform() || isInitialized) {
    return;
  }

  isInitialized = true;

  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url) return;

    try {
      // Fecha a janela do navegador OAuth (Chrome Custom Tab)
      void Browser.close().catch(() => null);

      // Tratamento de URL com tokens (hash # ou query ?)
      let paramsString = "";
      if (url.includes("#")) {
        paramsString = url.split("#")[1];
      } else if (url.includes("?")) {
        paramsString = url.split("?")[1];
      }

      if (paramsString) {
        const params = new URLSearchParams(paramsString);
        let accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const code = params.get("code");
        let providerToken = params.get("provider_token");

        let authSession: any = null;

        // 1. Fluxo PKCE moderno (código de autorização)
        if (code) {
          try {
            const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (!codeErr && codeData?.session) {
              authSession = codeData.session;
              if (codeData.session.provider_token) {
                providerToken = codeData.session.provider_token;
              }
              if (codeData.session.access_token) {
                accessToken = codeData.session.access_token;
              }
            }
          } catch (codeErr) {
            console.warn("[DeepLink] Erro ao trocar código PKCE:", codeErr);
          }
        }

        // 2. Fluxo Implícito (access_token + refresh_token)
        if (!authSession && accessToken && refreshToken) {
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error && data.session) {
              authSession = data.session;
              if (data.session.provider_token && !providerToken) {
                providerToken = data.session.provider_token;
              }
            }
          } catch (sessionErr) {
            console.warn("[DeepLink] Erro ao aplicar sessão:", sessionErr);
          }
        }

        // 3. Persistência de tokens de provedor para plugins
        if (providerToken && typeof window !== "undefined") {
          try {
            localStorage.setItem("griot_latest_provider_token", providerToken);
          } catch {}
        }

        // 4. Disparo do evento nativo para plugins que aguardam autorização
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("griot-oauth-success", {
              detail: {
                providerToken: providerToken || accessToken,
                accessToken: accessToken || authSession?.access_token,
                session: authSession,
              },
            }),
          );

          if (providerToken || accessToken) {
            localStorage.setItem(
              "griot_pending_oauth_callback",
              JSON.stringify({
                providerToken: providerToken || accessToken,
                accessToken: accessToken || authSession?.access_token,
                timestamp: Date.now(),
              }),
            );
          }
        }

        if (authSession?.user) {
          const user = authSession.user;
          const userDisplayName =
            user.user_metadata?.display_name ||
            user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "";

          if (user.email) localStorage.setItem("griot_user_email", user.email);
          if (userDisplayName) localStorage.setItem("griot_user_name", userDisplayName);

          // Se for uma autorização de plugin (oauth-callback), NÃO recarrega nem força navegação para /home
          const isPluginCallback = url.includes("oauth-callback") || params.has("plugin");
          if (!isPluginCallback) {
            if (onSuccess) {
              onSuccess();
            } else if (window.location.pathname === "/auth" || window.location.pathname === "/") {
              window.location.href = "/home";
            }
          }
        }
      }
    } catch (err) {
      console.error("[DeepLink] Falha ao processar callback de auth:", err);
    }
  });
}

/**
 * Dispara o fluxo OAuth no ambiente móvel (abrindo Chrome Custom Tab)
 * ou na Web tradicional com redirecionamento de volta ao app.
 */
export async function startOAuthFlow(provider: "google" | "github") {
  const isNative = Capacitor.isNativePlatform();
  const redirectUri = isNative ? "com.griot.app://home" : window.location.origin + "/home";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: isNative,
    },
  });

  if (error) {
    throw error;
  }

  if (isNative && data?.url) {
    await Browser.open({
      url: data.url,
      windowName: "_self",
    });
  }
}
