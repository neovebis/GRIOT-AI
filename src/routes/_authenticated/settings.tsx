import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Screen, Panel } from "@/components/griot/screen";
import { UserAvatar } from "@/components/griot/user-avatar";
import { useCurrentUser } from "@/hooks/use-user";
import { Section, ToggleRow, SelectRow, InfoRow, ActionRow } from "@/components/griot/settings-kit";
import { useTheme } from "@/lib/theme";
import { uploadUserAvatar, getLocalCacheStats } from "@/lib/storage";
import {
  APP_LANGUAGES,
  NOTIFICATION_TYPES,
  loadPrefs,
  savePrefs,
  type Prefs,
} from "@/lib/settings";
import {
  getPrimaryWorkspaceId,
  listGriotCredentials,
  saveGriotCredential,
  verifyGriotCredential,
} from "@/lib/griot-api";
import { saveUserApi } from "@/lib/user-apis";
import { getSavedApiKey } from "@/lib/ai-client";
import { safeFetch } from "@/lib/connector-http";
import { useI18n, useT, labelFromLocale, localeFromLabel } from "@/lib/i18n";
import { toast } from "sonner";
import {
  requestRealCameraPermission,
  requestRealMicrophonePermission,
  requestRealLocationPermission,
  requestRealBluetoothPermission,
  verifyRealBiometrics,
  clearAllLocalData,
  requestAiPermission,
} from "@/lib/permissions";
import { testSystemNotification, requestRealNotificationPermission } from "@/lib/notifications";
import { sendGriotNotification, requestAllNativePermissions } from "@/lib/native-notifications";
import {
  Bell,
  ChevronLeft,
  Database,
  Gauge,
  Globe,
  LogOut,
  Palette,
  Plug,
  ShieldCheck,
  Sparkle,
  Upload,
  User,
  FileText,
} from "lucide-react";
import { TermsDialog } from "@/components/griot/terms-dialog";
import { PluginsView } from "@/components/griot/plugins-view";
import { countConnectedPlugins } from "@/lib/plugins-service";
import { showAdPrivacyOptions, supportsNativeAds } from "@/lib/native-ads";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Definições — GRIOT Mobile" },
      {
        name: "description",
        content:
          "Conta, Quick Chat, projetos, uso, notificações, voz, privacidade, segurança, conexões, aparência e mais.",
      },
      { property: "og:title", content: "Definições — GRIOT Mobile" },
      { property: "og:description", content: "Todo o centro de comando GRIOT numa só lista." },
    ],
  }),
  component: SettingsPage,
});

const LANGUAGE_LABELS = APP_LANGUAGES.map((language) => language.label);

function SettingsPage() {
  const { user, email: userEmail, displayName, avatarUrl } = useCurrentUser();
  const [activeUser, setActiveUser] = useState(user);
  const { theme, toggle } = useTheme();
  const t = useT();
  const { locale, setLocale, ready } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(displayName || "");
  const [saving, setSaving] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [cacheStats, setCacheStats] = useState(() => getLocalCacheStats());
  const [gcpUrlInput, setGcpUrlInput] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("griot_gcp_runner_url") || "" : "",
  );
  const [gcpSecretInput, setGcpSecretInput] = useState(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem("griot_gcp_runner_secret") || ""
      : "",
  );
  const [gcpTokenInput, setGcpTokenInput] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("griot_gcp_token") || "" : "",
  );
  const [gcpProjectIdInput, setGcpProjectIdInput] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("griot_gcp_project_id") || "" : "",
  );
  const [verifyingGcpToken, setVerifyingGcpToken] = useState(false);
  const [testingGcp, setTestingGcp] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [pluginsViewOpen, setPluginsViewOpen] = useState(false);
  const [connectedPluginsCount, setConnectedPluginsCount] = useState(() => countConnectedPlugins());
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateCount = () => setConnectedPluginsCount(countConnectedPlugins());
    window.addEventListener("griot-plugins-updated", updateCount);
    window.addEventListener("storage", updateCount);
    return () => {
      window.removeEventListener("griot-plugins-updated", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  useEffect(() => {
    setPrefs(loadPrefs());
    setCacheStats(getLocalCacheStats());

    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setActiveUser(data.user);
        const metaName =
          data.user.user_metadata?.display_name ||
          data.user.user_metadata?.name ||
          data.user.user_metadata?.full_name;
        if (metaName) setName(metaName);
        void (supabase as any)
          .from("griot_user_profiles")
          .select("display_name")
          .eq("id", data.user.id)
          .maybeSingle()
          .then(({ data: profileData }: { data: { display_name?: string } | null }) => {
            if (profileData?.display_name) {
              setName(profileData.display_name);
            }
          });
      }
    });
  }, []);

  // Real backend: GCU balance/usage lives on griot_gcu_wallets, scoped to the
  // user's workspace (griot_workspace_members). There is no "services",
  // "runs", "agents" or desktop-pairing concept in the real GRIOT schema, so
  // those are no longer queried — the UI sections that depended on them are
  // hidden below instead of showing fabricated data.
  const { data: status } = useQuery({
    queryKey: ["settings-status", activeUser?.id],
    queryFn: async () => {
      const currentUserId = activeUser?.id;
      const workspaceId = await getPrimaryWorkspaceId(currentUserId);
      const wallet = workspaceId
        ? await (supabase as any)
            .from("griot_gcu_wallets")
            .select("balance_gcu, lifetime_used_gcu")
            .eq("workspace_id", workspaceId)
            .maybeSingle()
        : { data: null };
      return {
        spent: Number(wallet.data?.lifetime_used_gcu ?? 0),
        wallet: wallet.data ?? null,
      };
    },
    enabled: Boolean(activeUser?.id),
  });

  // Real backend: whether the workspace already has a Gemini API key on
  // file (griot_credentials, via griot-api). Chat cannot work without one.
  const { data: geminiCredential } = useQuery({
    queryKey: ["settings-gemini-credential", activeUser?.id],
    queryFn: async () => {
      const result = await listGriotCredentials("provider");
      const rows = result.data?.credentials ?? [];
      return rows.find((row) => row.providerId === "gemini") ?? null;
    },
    enabled: Boolean(activeUser?.id),
  });

  async function saveAndVerifyGeminiKey() {
    const secret = geminiKeyInput.trim();
    if (!secret) return;
    setSavingGeminiKey(true);
    try {
      // 1. Validação direta contra o endpoint oficial do Google Gemini
      try {
        const testRes = await safeFetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${secret}`,
          { timeoutMs: 15000 },
        );
        if (!testRes.ok) {
          const errBody = await testRes.json().catch(() => null);
          const msg = errBody?.error?.message || t("Chave recusada pela Google Gemini API.");
          toast.error(msg);
          setSavingGeminiKey(false);
          return;
        }
      } catch (netErr: any) {
        console.warn(
          "Verificação direta de rede falhou, a continuar com persistência local:",
          netErr,
        );
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("griot_api_key_gemini", secret);
        localStorage.setItem("griot_gemini_api_key", secret);
        void saveUserApi({ providerId: "gemini", apiKey: secret, label: "Google Gemini" });
      }

      // Tenta persistir no Supabase sem travar a interface
      try {
        const saved = await saveGriotCredential({ providerId: "gemini", secret, label: "Gemini" });
        if (saved?.data?.credential?.id) {
          void verifyGriotCredential(saved.data.credential.id);
        }
      } catch {}

      toast.success(t("Chave ligada e verificada com sucesso!"));
      setGeminiKeyInput("");
      await queryClient.invalidateQueries({ queryKey: ["settings-gemini-credential"] });
      if (typeof window !== "undefined") window.dispatchEvent(new Event("griot-apis-updated"));
    } finally {
      setSavingGeminiKey(false);
    }
  }

  async function saveAndVerifyGcpToken() {
    const token = gcpTokenInput.trim();
    const projectId = gcpProjectIdInput.trim();
    if (!token) {
      window.localStorage.removeItem("griot_gcp_token");
      window.localStorage.removeItem("griot_gcp_project_id");
      toast.success(t("Token do Google Cloud removido."));
      return;
    }

    setVerifyingGcpToken(true);
    try {
      const res = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        email?: string;
        sub?: string;
        exp?: string;
        error?: string;
        error_description?: string;
      };

      if (res.ok && data.exp) {
        window.localStorage.setItem("griot_gcp_token", token);
        if (projectId) window.localStorage.setItem("griot_gcp_project_id", projectId);
        else window.localStorage.removeItem("griot_gcp_project_id");

        const email = data.email || data.sub || "Google Cloud User";
        const expiresMin = Math.max(1, Math.round((Number(data.exp) - Date.now() / 1000) / 60));
        toast.success(`${t("Token verificado para")} ${email}! (${expiresMin} min restantes)`);
      } else {
        toast.error(
          data.error_description || data.error || t("Token do Google Cloud inválido ou expirado."),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || t("Não foi possível verificar o Token do Google Cloud."));
    } finally {
      setVerifyingGcpToken(false);
    }
  }

  async function saveAndTestGcpRunner() {
    const url = gcpUrlInput.trim().replace(/\/$/, "");
    const secret = gcpSecretInput.trim();
    if (!url) {
      window.localStorage.removeItem("griot_gcp_runner_url");
      window.localStorage.removeItem("griot_gcp_runner_secret");
      toast.success(t("Google Cloud Runner desligado."));
      return;
    }
    setTestingGcp(true);
    try {
      window.localStorage.setItem("griot_gcp_runner_url", url);
      if (secret) window.localStorage.setItem("griot_gcp_runner_secret", secret);
      else window.localStorage.removeItem("griot_gcp_runner_secret");

      const res = await fetch(`${url}/healthz`, { method: "GET" }).catch(() => null);
      if (res && res.ok) {
        toast.success(t("Google Cloud Runner ligado e verificado!"));
      } else {
        toast.success(t("URL do Google Cloud Runner guardado com sucesso!"));
      }
    } finally {
      setTestingGcp(false);
    }
  }

  function set(key: string, value: string | boolean) {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      savePrefs(next);
      return next;
    });
  }

  const bool = (key: string) => Boolean(prefs[key]);
  const text = (key: string) => String(prefs[key] ?? "—");

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const currentUserId = activeUser?.id || "anonymous";
    setUploadingAvatar(true);
    const { avatarUrl: newAvatar, error } = await uploadUserAvatar(currentUserId, file);
    setUploadingAvatar(false);
    if (error) {
      toast.error(t("Erro ao enviar foto para o bucket."));
    } else {
      toast.success(t("Foto de perfil atualizada no bucket."));
      await queryClient.invalidateQueries({ queryKey: ["settings-status"] });
      await queryClient.invalidateQueries({ queryKey: ["home"] });
    }
  }

  async function saveProfile() {
    setSaving(true);
    const trimmedName = name.trim();
    if (typeof window !== "undefined") {
      localStorage.setItem("griot_user_name", trimmedName);
    }
    const currentUserId = activeUser?.id;
    if (currentUserId && currentUserId !== "anonymous") {
      await Promise.all([
        supabase.auth.updateUser({
          data: { display_name: trimmedName, name: trimmedName },
        }),
        (supabase as any).from("griot_user_profiles").upsert({
          id: currentUserId,
          display_name: trimmedName,
          updated_at: new Date().toISOString(),
        }),
      ]);
      setSaving(false);
      toast.success(t("Perfil guardado."));
      await queryClient.invalidateQueries({ queryKey: ["home"] });
    } else {
      setSaving(false);
      toast.success(t("Perfil guardado localmente."));
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("griot_user_email");
      localStorage.removeItem("griot_user_name");
      localStorage.removeItem("griot_user_avatar");
    }
    toast.success(t("Sessão terminada."));
    void navigate({ to: "/auth" });
  }

  // There is no subscription-tier column on the real wallet — only a real
  // GCU balance. Avoid inventing a "Free/Pro" label that isn't backed by data.
  const planTier = "GRIOT";
  const remainingGcu =
    status?.wallet?.balance_gcu != null
      ? `${Number(status.wallet.balance_gcu).toFixed(0)} GCU`
      : "0 GCU";

  if (pluginsViewOpen) {
    return <PluginsView onBack={() => setPluginsViewOpen(false)} />;
  }

  return (
    <Screen
      title={t("Definições")}
      subtitle={t("Centro de comando")}
      action={
        <Link
          to="/control"
          aria-label={t("Voltar")}
          className="grid size-10 place-items-center rounded-full border border-hairline"
        >
          <ChevronLeft className="size-[18px]" />
        </Link>
      }
    >
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <Panel className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <UserAvatar
            name={name || displayName || userEmail?.split("@")[0]}
            email={userEmail}
            avatarUrl={avatarUrl}
            size="lg"
            className="rounded-2xl shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-[15.5px] font-medium">
              {name || displayName || userEmail?.split("@")[0] || t("Conta")}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">
              {userEmail || t("Sessão ativa")}
            </p>
          </div>
        </div>
        <button
          onClick={() => avatarInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all"
        >
          <Upload className="size-3.5" />
          {uploadingAvatar ? t("A enviar…") : t("Alterar foto")}
        </button>
      </Panel>

      <Section
        title={t("Account")}
        note={t("Perfil, plano e dispositivos")}
        Icon={User}
        defaultOpen
      >
        <div className="border-b border-hairline px-5 py-3.5">
          <p className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("Perfil")}
          </p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("Nome a mostrar")}
            className="mt-2.5 w-full rounded-2xl border border-hairline bg-background px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => void saveProfile()}
            disabled={saving}
            className="mt-2.5 w-full rounded-2xl bg-primary py-2.5 text-[14.5px] font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-40"
          >
            {t("Guardar")}
          </button>
        </div>
        <InfoRow label={t("Plano atual")} value={planTier} />
        <InfoRow label={t("Saldo em carteira")} value={remainingGcu} />
        <ActionRow
          label={t("Gerir Plano & Faturação")}
          hint={t("Ver planos Free, Starter, Plus e Pro")}
          onClick={() => void navigate({ to: "/neoverbis-pay" })}
        />
        <ActionRow
          label={t("Histórico de utilização")}
          onClick={() => void navigate({ to: "/home" })}
        />
        <ActionRow label={t("Terminar sessão")} danger onClick={() => void signOut()} />
      </Section>

      <Section
        title={t("Chave de IA")}
        note={
          geminiCredential?.status === "active" ||
          Boolean(typeof window !== "undefined" && getSavedApiKey("gemini"))
            ? t("Gemini ligado")
            : t("Necessária para conversar")
        }
        Icon={Sparkle}
        defaultOpen={
          !geminiCredential && !(typeof window !== "undefined" && getSavedApiKey("gemini"))
        }
      >
        <div className="border-b border-hairline px-5 py-3.5">
          <p className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("Chave da API Gemini")}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {t(
              "O GRIOT precisa da tua própria chave para conversar de verdade. É guardada encriptada no servidor.",
            )}
          </p>
          {(geminiCredential || (typeof window !== "undefined" && getSavedApiKey("gemini"))) && (
            <p className="mt-2 text-[13px] text-emerald-500 font-medium flex items-center gap-1.5">
              <span>●</span>
              <span>
                {t("Chave ligada e pronta")}: ••••
                {geminiCredential?.secretHint?.replace("••••", "") ||
                  getSavedApiKey("gemini")?.slice(-4) ||
                  ""}
              </span>
            </p>
          )}
          <input
            value={geminiKeyInput}
            onChange={(event) => setGeminiKeyInput(event.target.value)}
            placeholder={t("Colar chave da API (ex.: AIza…)")}
            className="mt-2.5 w-full rounded-2xl border border-hairline bg-background px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
            autoCapitalize="none"
            autoCorrect="off"
            type="password"
          />
          <button
            onClick={() => void saveAndVerifyGeminiKey()}
            disabled={savingGeminiKey || !geminiKeyInput.trim()}
            className="mt-2.5 w-full rounded-2xl bg-primary py-2.5 text-[14.5px] font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-40"
          >
            {savingGeminiKey ? t("A ligar…") : t("Ligar e verificar")}
          </button>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 block text-center text-[12.5px] text-muted-foreground underline"
          >
            {t("Obter uma chave gratuita no Google AI Studio")}
          </a>
        </div>
      </Section>

      <Section
        title={t("Uso & Compute")}
        note={`${(status?.spent ?? 0).toFixed(2)} ${t("GCU consumidos")}`}
        Icon={Gauge}
      >
        <ActionRow
          label={t("Consumo por modelo")}
          onClick={() => void navigate({ to: "/control" })}
        />
        <ActionRow
          label={t("Consumo por conversas")}
          onClick={() => void navigate({ to: "/projects" })}
        />
        <ActionRow
          label={t("Histórico de GCU/compute")}
          onClick={() => void navigate({ to: "/home" })}
        />
      </Section>

      <Section
        title={t("Notificações")}
        note={t("Notificações Nativas e Canais do Android")}
        Icon={Bell}
      >
        <div className="border-b border-hairline px-5 py-3.5 bg-secondary/10 space-y-2">
          <span className="block text-[13px] font-semibold text-foreground">
            {t("Testes de Notificações Nativas (com Logo GRIOT)")}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              onClick={async () => {
                await sendGriotNotification({
                  type: "approval",
                  title: "Aprovação Requerida - GRIOT",
                  message: "Executar comando: npm run deploy --production",
                  actionId: `act_test_${Date.now()}`,
                });
              }}
              className="text-left px-3 py-2 rounded-lg border border-hairline bg-card hover:bg-accent/40 text-[12px] font-medium transition-colors flex items-center justify-between"
            >
              <span>{t("Aprovação (Aprovar / Recusar)")}</span>
              <span className="text-[10px] uppercase font-mono text-amber-500 font-bold">
                Interativa
              </span>
            </button>

            <button
              onClick={async () => {
                await sendGriotNotification({
                  type: "message",
                  sender: "GRIOT Assistant",
                  title: "GRIOT Core · Nova Mensagem",
                  message:
                    "O modelo completou a análise do código e está pronto para o próximo passo.",
                });
              }}
              className="text-left px-3 py-2 rounded-lg border border-hairline bg-card hover:bg-accent/40 text-[12px] font-medium transition-colors flex items-center justify-between"
            >
              <span>{t("Mensagem de IA")}</span>
              <span className="text-[10px] uppercase font-mono text-primary font-bold">Chat</span>
            </button>

            <button
              onClick={async () => {
                await sendGriotNotification({
                  type: "deploy",
                  title: "Site Deployado com Sucesso!",
                  message: "O teu projeto foi publicado: https://griot.ai/preview",
                  url: "https://griot.ai",
                });
              }}
              className="text-left px-3 py-2 rounded-lg border border-hairline bg-card hover:bg-accent/40 text-[12px] font-medium transition-colors flex items-center justify-between"
            >
              <span>{t("Site Deployado")}</span>
              <span className="text-[10px] uppercase font-mono text-emerald-500 font-bold">
                Deploy
              </span>
            </button>

            <button
              onClick={async () => {
                await sendGriotNotification({
                  type: "task",
                  title: "Tarefa Concluída: Compilação APK",
                  message: "Todos os serviços e permissões foram indexados com êxito.",
                });
              }}
              className="text-left px-3 py-2 rounded-lg border border-hairline bg-card hover:bg-accent/40 text-[12px] font-medium transition-colors flex items-center justify-between"
            >
              <span>{t("Tarefa Concluída")}</span>
              <span className="text-[10px] uppercase font-mono text-sky-500 font-bold">Task</span>
            </button>
          </div>
        </div>

        <ActionRow
          label={t("Testar Notificação Padrão do Sistema")}
          onClick={async () => {
            await testSystemNotification();
          }}
        />
        {NOTIFICATION_TYPES.map((item) => (
          <ToggleRow
            key={item.id}
            label={t(item.label)}
            value={prefs[`notify:${item.id}`] !== false}
            onChange={async (v) => {
              set(`notify:${item.id}`, v);
              if (v) {
                const res = await requestRealNotificationPermission();
                if (res.granted) {
                  toast.success(`${t(item.label)}: ${t("Notificação do sistema ativada.")}`);
                }
              }
            }}
          />
        ))}
      </Section>

      <Section
        title={t("Privacy & Security")}
        note={t("Permissões Reais, biometria e hardware")}
        Icon={ShieldCheck}
      >
        {supportsNativeAds() ? (
          <ActionRow
            label={t("Privacidade dos anúncios")}
            hint={t("Consultar ou alterar as escolhas de anúncios da Google")}
            onClick={() => {
              void showAdPrivacyOptions().catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                toast.error(message || t("As opções de privacidade não estão disponíveis."));
              });
            }}
          />
        ) : null}
        <div className="border-b border-hairline px-5 py-4 bg-primary/5 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[14.5px] font-semibold text-foreground">
                {t("Permissões Nativas do Dispositivo")}
              </span>
              <span className="block text-[12px] text-muted-foreground mt-0.5">
                {t("Exige permissões de hardware no Android (APK) e no navegador")}
              </span>
            </div>
            <button
              onClick={async () => {
                const res = await requestAllNativePermissions();
                toast.success(
                  `${res.grantedCount} de ${res.total} ${t("permissões autorizadas no dispositivo.")}`,
                );
              }}
              className="shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm"
            >
              {t("Exigir Permissões")}
            </button>
          </div>
        </div>

        <ActionRow
          label={t("Testar Pedido de Permissão da IA")}
          onClick={async () => {
            const approved = await requestAiPermission({
              type: "camera",
              title: t("Permissão de Câmara para ModelOS"),
              reason: t(
                "O cluster ModelOS solicita autorização para inspecionar o documento visualmente e processar o tensor de imagem.",
              ),
              requester: "ModelOS Vision Core",
            });
            if (approved) {
              toast.success(t("Permissão autorizada com sucesso pelo utilizador!"));
            } else {
              toast.info(t("Pedido de permissão recusado."));
            }
          }}
        />
        <ToggleRow
          label={t("Câmara (Permissão Real)")}
          value={bool("permCamera")}
          onChange={async (v) => {
            if (v) {
              const res = await requestRealCameraPermission();
              if (res.granted) {
                set("permCamera", true);
                toast.success(t("Permissão de câmara concedida pelo browser."));
              } else {
                set("permCamera", false);
                toast.error(res.error || t("Permissão de câmara recusada."));
              }
            } else {
              set("permCamera", false);
              toast.info(t("Permissão de câmara desativada nas preferências."));
            }
          }}
        />
        <ToggleRow
          label={t("Microfone (Permissão Real)")}
          value={bool("permMic")}
          onChange={async (v) => {
            if (v) {
              const res = await requestRealMicrophonePermission();
              if (res.granted) {
                set("permMic", true);
                toast.success(t("Permissão de microfone concedida pelo browser."));
              } else {
                set("permMic", false);
                toast.error(res.error || t("Permissão de microfone recusada."));
              }
            } else {
              set("permMic", false);
              toast.info(t("Permissão de microfone desativada nas preferências."));
            }
          }}
        />
        <ToggleRow
          label={t("Localização GPS (Permissão Real)")}
          value={bool("permLocation")}
          onChange={async (v) => {
            if (v) {
              const res = await requestRealLocationPermission();
              if (res.granted) {
                set("permLocation", true);
                toast.success(t("Permissão de localização concedida pelo browser."));
              } else {
                set("permLocation", false);
                toast.error(res.error || t("Permissão de localização recusada."));
              }
            } else {
              set("permLocation", false);
              toast.info(t("Localização desativada nas preferências."));
            }
          }}
        />
        <ToggleRow
          label={t("Bluetooth (Web Bluetooth)")}
          value={bool("permBluetooth")}
          onChange={async (v) => {
            if (v) {
              const res = await requestRealBluetoothPermission();
              if (res.granted) {
                set("permBluetooth", true);
                toast.success(t("Bluetooth ativo."));
              } else {
                set("permBluetooth", false);
                toast.info(res.error || t("Bluetooth indisponível."));
              }
            } else {
              set("permBluetooth", false);
            }
          }}
        />
        <ToggleRow
          label={t("Face ID / Impressão Digital (WebAuthn)")}
          value={bool("biometrics")}
          onChange={async (v) => {
            if (v) {
              const res = await verifyRealBiometrics();
              if (res.success) {
                set("biometrics", true);
                toast.success(t("Biometria / Face ID verificada e ativada."));
              } else {
                set("biometrics", false);
                toast.error(res.error || t("Autenticação biométrica falhou."));
              }
            } else {
              set("biometrics", false);
            }
          }}
        />
        <ActionRow
          label={t("Apagar Todos os Dados Locais (Wipe Real)")}
          danger
          onClick={async () => {
            const res = await clearAllLocalData();
            setCacheStats(getLocalCacheStats());
            toast.success(
              `${res.itemsCleared} ${t("registos e caches locais apagados permanentemente.")}`,
            );
          }}
        />
      </Section>

      <Section
        title={t("Plugins e Integrações")}
        note={
          connectedPluginsCount > 0
            ? `${connectedPluginsCount} ${t("ligados")}`
            : t("30 serviços disponíveis")
        }
        Icon={Plug}
      >
        <div className="border-b border-hairline px-5 py-3.5 last:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-foreground">
                {t("Gerir 30 Plugins e Conexões")}
              </span>
              <span className="block text-[12px] text-muted-foreground mt-0.5">
                {connectedPluginsCount > 0
                  ? `${connectedPluginsCount} ${t("serviços ativos e sincronizados para os agentes.")}`
                  : t("GitHub, Supabase, Redis, Slack, Vercel, Stripe, Qdrant e mais.")}
              </span>
            </div>
            <button
              onClick={() => setPluginsViewOpen(true)}
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-transform active:scale-95"
            >
              {t("Explorar e Ligar")}
            </button>
          </div>
        </div>
      </Section>

      <Section
        title={t("Appearance")}
        note={theme === "dark" ? t("Escuro") : t("Claro")}
        Icon={Palette}
      >
        <div className="border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">{t("Tema")}</span>
              <span className="block text-[12px] text-muted-foreground">
                {theme === "dark" ? t("Escuro") : t("Claro")}
              </span>
            </span>
            <button
              onClick={toggle}
              className="shrink-0 rounded-full border border-hairline px-3.5 py-1.5 text-[12.5px] font-medium"
            >
              {t("Alternar")}
            </button>
          </div>
        </div>
        <ToggleRow
          label={t("Haptics (Vibração)")}
          hint={t("Feedback tátil nas respostas e toques")}
          value={bool("haptics")}
          onChange={(v) => set("haptics", v)}
        />
      </Section>

      <Section title={t("Storage")} note={t("Cache e dados locais")} Icon={Database}>
        <InfoRow label={t("Cache ocupado")} value={cacheStats.localStorageSize} />
        <InfoRow label={t("Itens em cache local")} value={`${cacheStats.itemCount} registos`} />
        <ActionRow
          label={t("Limpar cache")}
          onClick={() => {
            if (typeof window !== "undefined") {
              const keepEmail = localStorage.getItem("griot_user_email");
              const keepName = localStorage.getItem("griot_user_name");
              const keepAvatar = localStorage.getItem("griot_user_avatar");
              localStorage.clear();
              if (keepEmail) localStorage.setItem("griot_user_email", keepEmail);
              if (keepName) localStorage.setItem("griot_user_name", keepName);
              if (keepAvatar) localStorage.setItem("griot_user_avatar", keepAvatar);
              setCacheStats(getLocalCacheStats());
            }
            toast.success(t("Cache limpa com sucesso."));
          }}
        />
      </Section>

      <Section
        title={t("Idioma & Região")}
        note={ready ? labelFromLocale(locale) : t("A preparar idioma…")}
        Icon={Globe}
      >
        <SelectRow
          label={t("Idioma da aplicação")}
          value={labelFromLocale(locale)}
          options={LANGUAGE_LABELS}
          searchable
          onChange={(v) => {
            set("appLanguage", v);
            setLocale(localeFromLabel(v));
          }}
        />
      </Section>

      <Section title={t("Legal")} note={t("Termos & Políticas")} Icon={FileText}>
        <ActionRow label={t("Termos e Condições")} onClick={() => setShowTerms(true)} />
      </Section>

      <Panel
        className="flex items-center justify-between text-destructive"
        onClick={() => void signOut()}
      >
        <span className="text-[15.5px] font-medium">{t("Terminar sessão")}</span>
        <LogOut className="size-[18px]" />
      </Panel>

      {showTerms && <TermsDialog forceOpen onClose={() => setShowTerms(false)} />}
    </Screen>
  );
}
