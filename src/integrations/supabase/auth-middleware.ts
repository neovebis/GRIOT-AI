import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, createSupabaseFetch } from "./config";

/**
 * Exige uma sessão válida. Sem token válido responde 401 — nunca continua
 * como "anonymous", o que antes deixava funções protegidas abertas.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;

    const request = getRequest();
    const authHeader = request?.headers?.get?.("authorization");

    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    }

    if (!token || token.split(".").length !== 3) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient<Database>(url, key, {
      global: {
        fetch: createSupabaseFetch(key),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (error || !sub) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: sub,
        claims: data.claims as Record<string, unknown>,
      },
    });
  },
);
