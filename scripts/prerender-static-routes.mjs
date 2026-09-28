process.env.NODE_ENV = "production";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function prerender() {
  const ssrPath = path.resolve(".output/server/index.mjs");
  if (!fs.existsSync(ssrPath)) {
    console.warn("SSR bundle not found at .output/server/index.mjs. Skipping prerender.");
    return;
  }

  const ssr = await import(pathToFileURL(ssrPath).href);
  const routes = [
    {
      urlPath: "/home",
      outputFiles: [
        ".output/public/index.html",
        ".output/public/home.html",
        ".output/public/home/index.html",
      ],
    },
    {
      urlPath: "/chat",
      outputFiles: [".output/public/chat.html", ".output/public/chat/index.html"],
    },
    {
      urlPath: "/projects",
      outputFiles: [".output/public/projects.html", ".output/public/projects/index.html"],
    },
    {
      urlPath: "/capture",
      outputFiles: [".output/public/capture.html", ".output/public/capture/index.html"],
    },
    {
      urlPath: "/control",
      outputFiles: [".output/public/control.html", ".output/public/control/index.html"],
    },
    {
      urlPath: "/settings",
      outputFiles: [".output/public/settings.html", ".output/public/settings/index.html"],
    },
    {
      urlPath: "/auth",
      outputFiles: [".output/public/auth.html", ".output/public/auth/index.html"],
    },
  ];

  console.log("Prerendering static HTML for Capacitor offline/standalone navigation...");

  for (const { urlPath, outputFiles } of routes) {
    try {
      const req = new Request(`http://localhost:3000${urlPath}`);
      const res = await ssr.default.fetch(req, { ASSETS: null }, { waitUntil: () => {} });
      const html = await res.text();

      if (
        res.status !== 200 ||
        html.includes("Algo correu mal") ||
        html.includes("This page didn't load") ||
        html.includes("Página não encontrada")
      ) {
        console.error(
          `Warning: prerender for ${urlPath} returned status ${res.status} or error page. Skipping write.`,
        );
        continue;
      }

      for (const outFile of outputFiles) {
        const fullOutPath = path.resolve(outFile);
        const dir = path.dirname(fullOutPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullOutPath, html, "utf8");
      }
      console.log(`✓ Prerendered ${urlPath} -> ${outputFiles.join(", ")}`);
    } catch (err) {
      console.error(`Failed to prerender ${urlPath}:`, err);
    }
  }

  console.log("Static prerender completed successfully!");
}

prerender().catch((err) => {
  console.error("Prerender error:", err);
  process.exit(1);
});
