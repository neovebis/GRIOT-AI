import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";
import { supabase } from "@/integrations/supabase/client";
import { GRIOT_SUPABASE_URL, GRIOT_SUPABASE_ANON_KEY } from "@/lib/griot-api";
import { checkRateLimit, SECURITY_HEADERS } from "@/lib/security-headers";
import { isSafePublicUrl } from "@/lib/api-auth";

const MAX_BODY_BYTES = 256_000;
const MAX_TIMEOUT_MS = 90_000;

export const Route = createFileRoute("/api/runtime/execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const rateLimit = checkRateLimit(clientIp, 60, 60000);
        if (!rateLimit.allowed) {
          return json({ error: "Too many execution requests. Please try again later." }, 429);
        }

        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
          return json({ error: "Runtime payload too large." }, 413);
        }

        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token) return json({ error: "Authentication required." }, 401);

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return json({ error: "Invalid Supabase session." }, 401);

        const rawCustomRunnerUrl = request.headers.get("x-griot-custom-runner") || "";
        let customRunnerUrl = "";
        if (rawCustomRunnerUrl) {
          if (!isSafePublicUrl(rawCustomRunnerUrl)) {
            return json({ error: "Endereço de runner personalizado não permitido (SSRF mitigado)." }, 400);
          }
          customRunnerUrl = rawCustomRunnerUrl;
        }
        const customSecret = request.headers.get("x-griot-custom-secret") || "";

        const executorUrl =
          customRunnerUrl ||
          process.env.GRIOT_RUNTIME_EXECUTOR_URL ||
          import.meta.env.VITE_GRIOT_RUNTIME_EXECUTOR_URL ||
          "";
        const sharedSecret =
          customSecret || process.env.GRIOT_RUNTIME_SHARED_SECRET || "default-griot-secret";
        if (!executorUrl) {
          return json(
            {
              error:
                "GRIOT Google Cloud runner URL is not configured. Connect your GCP Cloud Run instance in Settings.",
            },
            503,
          );
        }

        const bodyText = await request.text();
        if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
          return json({ error: "Runtime payload too large." }, 413);
        }

        let body: unknown;
        try {
          body = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          return json({ error: "Invalid JSON payload." }, 400);
        }

        const payload = {
          ...(body && typeof body === "object" ? body : {}),
          actorId: data.user.id,
          actorEmail: data.user.email || undefined,
        } as Record<string, unknown>;

        const serialized = JSON.stringify(payload);
        const timestamp = String(Date.now());
        const signature = createHmac("sha256", sharedSecret)
          .update(`${timestamp}.${serialized}`)
          .digest("hex");

        let upstream: Response;
        try {
          upstream = await fetch(executorUrl.replace(/\/$/, "") + "/v1/actions/execute", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-griot-timestamp": timestamp,
              "x-griot-signature": signature,
              ...(GRIOT_SUPABASE_URL ? { "x-griot-supabase-url": GRIOT_SUPABASE_URL } : {}),
              ...(GRIOT_SUPABASE_ANON_KEY
                ? { "x-griot-supabase-key": GRIOT_SUPABASE_ANON_KEY }
                : {}),
            },
            body: serialized,
            signal: AbortSignal.timeout(MAX_TIMEOUT_MS),
          });
        } catch (err) {
          console.error("GRIOT runtime runner unavailable:", err);
          return json({ error: "GRIOT runtime runner unavailable." }, 502);
        }

        const responseText = await upstream.text();
        const contentType = upstream.headers.get("content-type") || "application/json";
        return new Response(responseText, {
          status: upstream.status,
          headers: {
            "content-type": contentType,
            "cache-control": "no-store",
            ...SECURITY_HEADERS,
          },
        });
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}
