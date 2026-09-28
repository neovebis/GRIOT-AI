import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { ThemeProvider } from "../lib/theme";
import { I18nProvider } from "../lib/i18n";
import { Toaster } from "sonner";
import { GriotMark } from "../components/griot/logo";
import { AiPermissionDialog } from "../components/griot/ai-permission-dialog";
import { TermsDialog } from "../components/griot/terms-dialog";
import { initNativeNotificationListeners } from "../lib/native-notifications";
import { initNativeBackButtonListener } from "../lib/native-back-button";
import {
  installExtensionErrorSuppression,
  EXTENSION_GUARD_INLINE_SCRIPT,
} from "../lib/error-guard";

// Prevent noise from injected browser extensions (e.g. Coinbase Wallet, MetaMask)
installExtensionErrorSuppression();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center select-none">
      <div className="flex flex-col items-center max-w-xs">
        <GriotMark className="size-16 mb-5 opacity-80" />
        <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
          Página não encontrada
        </h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground leading-relaxed">
          O ecrã que procuras não existe ou foi movido.
        </p>
        <Link
          to="/home"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-[14.5px] font-semibold text-black transition-transform active:scale-[0.98]"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center select-none">
      <div className="flex flex-col items-center max-w-xs">
        <GriotMark className="size-16 mb-5 opacity-90" />
        <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
          Algo correu mal
        </h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground leading-relaxed">
          Não foi possível carregar o ecossistema.
        </p>
        {error?.message && (
          <p className="mt-2.5 text-[11px] font-mono text-muted-foreground/60 break-all max-w-xs">
            {String(error.message)}
          </p>
        )}
        <div className="mt-6 flex flex-col w-full gap-2.5">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="flex w-full items-center justify-center rounded-2xl bg-white py-3 text-[14.5px] font-semibold text-black transition-transform active:scale-[0.98]"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => {
              void router.navigate({ to: "/home" });
              reset();
            }}
            className="flex w-full items-center justify-center rounded-2xl border border-hairline bg-surface py-3 text-[14px] font-medium text-foreground transition-transform active:scale-[0.98]"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "GRIOT Mobile — AI Ecosystem & Mobile Gateway" },
      {
        name: "description",
        content:
          "O teu ecossistema GRIOT, contigo: home, chat contínuo, Quick Deliberation Room, projetos, captura e control center.",
      },
      { name: "author", content: "GRIOT" },
      { name: "robots", content: "index, follow" },
      { property: "og:site_name", content: "GRIOT Mobile" },
      { property: "og:title", content: "GRIOT Mobile — AI Ecosystem & Mobile Gateway" },
      {
        property: "og:description",
        content: "O teu ecossistema GRIOT no bolso com orquestração de IA e execução isolada.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://griot.app/griot-mark.svg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "GRIOT Mobile" },
      { name: "twitter:description", content: "O teu ecossistema GRIOT, contigo." },
      { name: "twitter:image", content: "https://griot.app/griot-mark.svg" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/griot-mark.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/griot-mark.svg" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
    ],
    scripts: [
      {
        children: EXTENSION_GUARD_INLINE_SCRIPT,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "GRIOT Mobile",
          url: "https://griot.app",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Android, Web",
          description:
            "Pocket-sized AI orchestration platform allowing users to control multi-model AI agents and execute sandboxed code.",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: EXTENSION_GUARD_INLINE_SCRIPT,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  useEffect(() => {
    // Inicia o fade out suave do splash após 600ms
    const fadeTimer = setTimeout(() => {
      setSplashFading(true);
    }, 600);

    // Remove completamente do DOM após o fade
    const removeTimer = setTimeout(() => {
      setShowSplash(false);
    }, 1100);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    // Remove qualquer badge/elemento flutuante do Lovable injetado no DOM
    const removeLovableBadge = () => {
      const selectors = [
        "#lovable-badge",
        "[data-lovable-badge]",
        ".lovable-badge",
        "[class*='lovable-badge']",
        "a[href*='lovable.dev']",
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          const parent = el.closest("div[style*='z-index']") || el;
          parent.remove();
        });
      });
    };

    removeLovableBadge();
    const interval = setInterval(removeLovableBadge, 1000);

    // Inicializa receptor de ações das notificações nativas (Aprovar / Rejeitar)
    initNativeNotificationListeners();

    // Inicializa gestão nativa do botão 'Back' físico/gestual do Android
    initNativeBackButtonListener(() => {
      void router.navigate({ to: "/home" });
    });

    return () => clearInterval(interval);
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" />
          <AiPermissionDialog />
          <TermsDialog />

          {/* Splash screen com logo e fundo preto, com transição suave que nunca fica presa */}
          {showSplash && (
            <div
              onClick={() => setShowSplash(false)}
              className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#060608] transition-opacity duration-500 cursor-pointer select-none ${
                splashFading ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                <GriotMark className="size-32 rounded-[28px] max-w-[40vw] max-h-[40vw]" />
              </div>
            </div>
          )}
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
