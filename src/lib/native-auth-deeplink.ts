import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { ensurePrimaryGriotSessionRestored } from "./plugin-oauth";

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

        // Detecta se é autorização de plugin ou autenticação principal do app
        const isPluginCallback = Boolean(
          url.includes("oauth-callback") ||
          params.has("plugin") ||
          (typeof window !== "undefined" && localStorage.getItem("griot_active_oauth_plugin"))
        );
        const pluginId =
          params.get("plugin") ||
          (typeof window !== "undefined" ? localStorage.getItem("griot_active_oauth_plugin") : null) ||
          "github";

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

        // Se for PLUGIN: isolamento total para NUNCA substituir a conta GRIOT
        if (isPluginCallback) {
          const effectiveToken = providerToken || accessToken;
          const externalUser = authSession?.user;
          const externalUsername =
            externalUser?.user_metadata?.user_name ||
            externalUser?.user_metadata?.preferred_username ||
            externalUser?.user_metadata?.name ||
            externalUser?.email?.split("@")[0];
          const externalAvatar =
            externalUser?.user_metadata?.avatar_url ||
            externalUser?.user_metadata?.picture;
          const externalEmail = externalUser?.email;

          // 3. Persistência de tokens para o plugin
          if (effectiveToken && typeof window !== "undefined") {
            try {
              localStorage.setItem(`griot_provider_token_${pluginId}`, effectiveToken);
              localStorage.setItem("griot_latest_provider_token", effectiveToken);
            } catch {}
          }

          // 4. RESTAURAÇÃO CRÍTICA DO PERFIL E SESSÃO PRINCIPAL DO GRIOT:
          // NUNCA substitui o e-mail, nome ou foto de perfil do utilizador GRIOT pela conta do plugin!
          await ensurePrimaryGriotSessionRestored();

          // 5. Disparo do evento nativo para plugins que aguardam autorização (com os metadados do plugin)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("griot-oauth-success", {
                detail: {
                  pluginId,
                  providerToken: effectiveToken,
                  accessToken: effectiveToken,
                  username: externalUsername,
                  avatarUrl: externalAvatar,
                  email: externalEmail,
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
                  username: externalUsername,
                  avatarUrl: externalAvatar,
                  email: externalEmail,
                  timestamp: Date.now(),
                }),
              );
            }
          }

          return; // Concluído! Não executa a lógica de login principal do app abaixo.
        }

        // --- FLUXO DE LOGIN PRINCIPAL DO APP (com.griot.app://home) ---
        if (providerToken && typeof window !== "undefined") {
          try {
            localStorage.setItem("griot_latest_provider_token", providerToken);
          } catch {}
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

          if (onSuccess) {
            onSuccess();
          } else if (window.location.pathname === "/auth" || window.location.pathname === "/") {
            window.location.href = "/home";
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
