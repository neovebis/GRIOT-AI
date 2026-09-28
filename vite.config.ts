// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

/**
 * Compatibility transform for provider model IDs that were removed by Google.
 * Keep the source/API surface stable while ensuring both browser and SSR builds
 * never emit retired Gemini 2.0/1.5 model identifiers.
 */
const geminiModelCompat = {
  name: "griot-gemini-model-compat",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!/[\\/]src[\\/].*\\.(?:ts|tsx|js|jsx)$/.test(id)) return null;
    if (!code.includes("gemini-2.0-flash") && !code.includes("gemini-1.5-flash")) return null;

    const transformed = code
      .replaceAll("gemini-2.0-flash", "gemini-3.7-flash")
      .replaceAll("gemini-1.5-flash", "gemini-3.1-flash-lite");

    return transformed === code ? null : { code: transformed, map: null };
  },
};

const mobileAiEntry = fileURLToPath(
  new URL("./src/lib/ai-client-mobile-entry.ts", import.meta.url),
);
const jsxDevCompatEntry = fileURLToPath(
  new URL("./src/lib/jsx-dev-runtime-compat.ts", import.meta.url),
);

export default defineConfig({
  vite: {
    plugins: [geminiModelCompat],
    resolve: {
      alias: [
        {
          find: /^@\/lib\/ai-client$/,
          replacement: mobileAiEntry,
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: jsxDevCompatEntry,
        },
      ],
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
    },
    build: {
      rolldownOptions: {
        onwarn(warning: any, defaultHandler: any) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            warning.message?.includes('"use client"') ||
            warning.message?.includes("'use client'")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
      rollupOptions: {
        onwarn(warning: any, defaultHandler: any) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            warning.message?.includes('"use client"') ||
            warning.message?.includes("'use client'")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
    environments: {
      client: {
        build: {
          rolldownOptions: {
            onwarn(warning: any, defaultHandler: any) {
              if (
                warning.code === "MODULE_LEVEL_DIRECTIVE" ||
                warning.message?.includes('"use client"') ||
                warning.message?.includes("'use client'")
              ) {
                return;
              }
              defaultHandler(warning);
            },
          },
          rollupOptions: {
            onwarn(warning: any, defaultHandler: any) {
              if (
                warning.code === "MODULE_LEVEL_DIRECTIVE" ||
                warning.message?.includes('"use client"') ||
                warning.message?.includes("'use client'")
              ) {
                return;
              }
              defaultHandler(warning);
            },
          },
        },
      },
      ssr: {
        build: {
          rolldownOptions: {
            onwarn(warning: any, defaultHandler: any) {
              if (
                warning.code === "MODULE_LEVEL_DIRECTIVE" ||
                warning.message?.includes('"use client"') ||
                warning.message?.includes("'use client'")
              ) {
                return;
              }
              defaultHandler(warning);
            },
          },
          rollupOptions: {
            onwarn(warning: any, defaultHandler: any) {
              if (
                warning.code === "MODULE_LEVEL_DIRECTIVE" ||
                warning.message?.includes('"use client"') ||
                warning.message?.includes("'use client'")
              ) {
                return;
              }
              defaultHandler(warning);
            },
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
