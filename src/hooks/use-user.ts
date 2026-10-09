/**
 * useCurrentUser Hook
 * Loads real Supabase Auth session, profile details and keeps local and cloud state synchronized.
 */

import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureGriotWorkspace } from "@/lib/griot-api";
import { ensureFreeAllowance } from "@/lib/payments.functions";
import { syncUserApisWithRemote } from "@/lib/user-apis";

export type UserProfileState = {
  user: User | null;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  loading: boolean;
  isAnonymous: boolean;
};

export function useCurrentUser(): UserProfileState {
  const grantFreeAllowance = useServerFn(ensureFreeAllowance);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("griot_user_name") || "";
    }
    return "";
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("griot_user_avatar") || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function syncAuth() {
      try {
        if (typeof window !== "undefined" && localStorage.getItem("griot_active_oauth_plugin")) {
          return;
        }

        const { data: authData } = await supabase.auth.getUser();
        const currentUser = authData?.user ?? null;

        if (!mounted) return;
        setUser(currentUser);

        if (currentUser) {
          if (currentUser.email && typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
            localStorage.setItem("griot_user_email", currentUser.email);
          }

          // Extract metadata from Supabase Auth
          const metaName =
            currentUser.user_metadata?.display_name ||
            currentUser.user_metadata?.name ||
            currentUser.user_metadata?.full_name;

          const metaAvatar =
            currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;

          // Real backend: make sure this user has a workspace + profile row
          // (self-heals accounts created before this existed, or created
          // outside the app's own sign-up flow, e.g. via magic link).
          void ensureGriotWorkspace()
            .then(() => grantFreeAllowance())
            .catch(() => undefined);
          void syncUserApisWithRemote().catch(() => undefined);

          // Query the real profile table
          // NOTE: not yet in the generated `Database` types (types.ts targets
          // an older schema) — cast until `types.ts` is regenerated from the
          // live "griot" project.
          const { data: profile } = await (supabase as any)
            .from("griot_user_profiles")
            .select("display_name, avatar_url")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (!mounted) return;

          const chosenName =
            profile?.display_name ||
            metaName ||
            (currentUser.email ? currentUser.email.split("@")[0] : null) ||
            (typeof window !== "undefined" ? localStorage.getItem("griot_user_name") : null);

          if (chosenName) {
            setDisplayName(chosenName);
            if (typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
              localStorage.setItem("griot_user_name", chosenName);
            }
          }

          const chosenAvatar =
            profile?.avatar_url ||
            metaAvatar ||
            (typeof window !== "undefined" ? localStorage.getItem("griot_user_avatar") : null);

          if (chosenAvatar) {
            setAvatarUrl(chosenAvatar);
            if (typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
              localStorage.setItem("griot_user_avatar", chosenAvatar);
            }
          }
        }
      } catch {
        // graceful offline fallback
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void syncAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (typeof window !== "undefined" && localStorage.getItem("griot_active_oauth_plugin")) {
        return;
      }
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        void ensureGriotWorkspace()
          .then(() => grantFreeAllowance())
          .catch(() => undefined);
        void syncUserApisWithRemote().catch(() => undefined);
        if (currentUser.email && typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
          localStorage.setItem("griot_user_email", currentUser.email);
        }
        const name =
          currentUser.user_metadata?.display_name ||
          currentUser.user_metadata?.name ||
          currentUser.user_metadata?.full_name ||
          (currentUser.email ? currentUser.email.split("@")[0] : "");
        if (name) {
          setDisplayName(name);
          if (typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
            localStorage.setItem("griot_user_name", name);
          }
        }
        const existingAvatar =
          typeof window !== "undefined" ? localStorage.getItem("griot_user_avatar") : null;
        const metaAvatar =
          currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

        // Só assume a foto do metadata/e-mail se não houver foto de perfil personalizada definida
        if (!existingAvatar && metaAvatar) {
          if (typeof window !== "undefined" && !localStorage.getItem("griot_active_oauth_plugin")) {
            setAvatarUrl(metaAvatar);
            localStorage.setItem("griot_user_avatar", metaAvatar);
          }
        }
        // Persist provider_token for plugin OAuth reuse
        // Supabase only provides this during the initial OAuth callback
        if (session?.provider_token && typeof window !== "undefined") {
          const provider = (currentUser.app_metadata?.provider || "").toLowerCase();
          if (provider) {
            localStorage.setItem(`griot_provider_token_${provider}`, session.provider_token);
          }
        }
      }
    });

    const handleAvatarUpdate = (e: CustomEvent<{ url: string }>) => {
      if (e.detail?.url) {
        setAvatarUrl(e.detail.url);
      }
    };
    window.addEventListener("griot_avatar_changed" as any, handleAvatarUpdate);

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
      window.removeEventListener("griot_avatar_changed" as any, handleAvatarUpdate);
    };
  }, [grantFreeAllowance]);

  const email =
    user?.email ||
    (typeof window !== "undefined" ? localStorage.getItem("griot_user_email") || "" : "");

  const finalDisplayName = displayName || (email ? email.split("@")[0] : "");

  return {
    user,
    email,
    displayName: finalDisplayName,
    avatarUrl,
    loading,
    isAnonymous: !user || user.id === "anonymous",
  };
}
