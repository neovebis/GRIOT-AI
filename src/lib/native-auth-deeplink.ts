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
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error && data.session?.user) {
            const user = data.session.user;
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
            } else {
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
