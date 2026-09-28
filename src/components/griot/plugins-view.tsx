import { useState, useEffect, useMemo } from "react";
import { useT } from "@/lib/i18n";
import {
  ChevronLeft,
  Search,
  ExternalLink,
  Check,
  X,
  Sliders,
  Plug,
  Trash2,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Loader2,
  Star,
  Plus,
  Zap,
} from "lucide-react";
import {
  PLUGINS_LIST,
  getConnectedPlugins,
  connectPluginUnified,
  disconnectPluginUnified,
  removePluginCredentialUnified,
  getPluginCredentials,
  setPrimaryPluginCredential,
  type PluginDefinition,
  type PluginCategory,
  type ConnectedPluginData,
  type PluginCredential,
} from "@/lib/plugins-service";
import { validatePluginCredentials } from "@/lib/plugin-validators";
import {
  startPluginOAuthFlow,
  detectActiveUserSessionProvider,
  getPluginOAuthSpec,
} from "@/lib/plugin-oauth";
import * as BrandIcons from "@/components/griot/brand-icons";
import { ConfirmationModal } from "@/components/griot/confirmation-modal";
import { toast } from "sonner";

interface PluginsViewProps {
  onBack: () => void;
}

export function PluginsView({ onBack }: PluginsViewProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory>("all");
  const [connectedMap, setConnectedMap] = useState<Record<string, ConnectedPluginData>>(() =>
    getConnectedPlugins(),
  );
  const [configuringPlugin, setConfiguringPlugin] = useState<PluginDefinition | null>(null);
  const [pluginToDisconnect, setPluginToDisconnect] = useState<PluginDefinition | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [inputLabel, setInputLabel] = useState("");
  const [inputAccount, setInputAccount] = useState("");
  const [inputEndpoint, setInputEndpoint] = useState("");
  const [inputIsPrimary, setInputIsPrimary] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<"oauth" | "manual">("oauth");
  const [isAuthorizingOAuth, setIsAuthorizingOAuth] = useState(false);
  const [detectedSession, setDetectedSession] = useState<{
    hasMatchingSession: boolean;
    providerName: string;
    userEmail?: string;
    userName?: string;
    avatarUrl?: string;
    providerToken?: string;
  } | null>(null);

  const refreshConnections = () => {
    setConnectedMap(getConnectedPlugins());
  };

  useEffect(() => {
    const handleUpdate = () => refreshConnections();
    window.addEventListener("griot-plugins-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("griot-plugins-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const connectedCount = useMemo(() => {
    return Object.values(connectedMap).filter((p) => p.connected).length;
  }, [connectedMap]);

  const filteredPlugins = useMemo(() => {
    return PLUGINS_LIST.filter((plugin) => {
      const matchCategory = selectedCategory === "all" || plugin.category === selectedCategory;
      const matchSearch =
        search.trim() === "" ||
        plugin.name.toLowerCase().includes(search.toLowerCase()) ||
        plugin.description.toLowerCase().includes(search.toLowerCase()) ||
        plugin.categoryLabel.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, search]);

  const handleOpenConfig = async (plugin: PluginDefinition) => {
    const creds = getPluginCredentials(plugin.id);
    const hasCreds = creds.length > 0;
    setInputKey("");
    setInputLabel("");
    setInputAccount("");
    setInputEndpoint("");
    setInputIsPrimary(!hasCreds);
    setShowAddAccountForm(!hasCreds);
    setValidationError(null);
    setIsValidating(false);
    setIsAuthorizingOAuth(false);
    setAuthTab(plugin.supportsOAuth ? "oauth" : "manual");
    setConfiguringPlugin(plugin);

    if (plugin.supportsOAuth) {
      const session = await detectActiveUserSessionProvider(plugin.id);
      setDetectedSession(session);
    } else {
      setDetectedSession(null);
    }
  };

  const handleStartOAuth = async () => {
    if (!configuringPlugin) return;
    setIsAuthorizingOAuth(true);
    setValidationError(null);

    await startPluginOAuthFlow(configuringPlugin.id, {
      onSuccess: (result) => {
        setIsAuthorizingOAuth(false);
        toast.success(
          t(
            `⚡ Conectado à conta ${result.username ? `@${result.username}` : configuringPlugin.name} via OAuth com sucesso!`,
          ),
        );
        refreshConnections();
        setShowAddAccountForm(false);
      },
      onError: (errMsg) => {
        setIsAuthorizingOAuth(false);
        setValidationError(errMsg);
        toast.error(errMsg);
      },
    });
  };

  const handleConnectWithActiveSession = async () => {
    if (!configuringPlugin || !detectedSession?.providerToken) return;
    setIsAuthorizingOAuth(true);
    setValidationError(null);

    try {
      const token = detectedSession.providerToken;
      const validation = await validatePluginCredentials(configuringPlugin.id, { apiKey: token });
      if (!validation.valid) {
        setValidationError(validation.message || "A API recusou o token da sessão ativa.");
        toast.error(validation.message || "A API recusou o token da sessão ativa.");
        setIsAuthorizingOAuth(false);
        return;
      }

      const username = detectedSession.userName || validation.details?.username;
      await connectPluginUnified(configuringPlugin.id, {
        apiKey: token,
        accountName: username || detectedSession.userEmail,
        label: username
          ? `${configuringPlugin.name} (@${username})`
          : `${configuringPlugin.name} (Sessão GRIOT)`,
        verifiedAt: new Date().toISOString(),
        validationStatus: "verified",
        validationMessage: `⚡ Conexão Avançada Ativa vinculada à tua sessão do GRIOT.`,
        isPrimary: true,
        authMethod: "oauth",
        username,
        avatarUrl: detectedSession.avatarUrl,
        projects: validation.details?.projects,
      });

      toast.success(t(`⚡ Plugin conectado com sucesso à tua conta @${username || ""}!`));
      refreshConnections();
      setShowAddAccountForm(false);
      setIsAuthorizingOAuth(false);
    } catch (err: any) {
      setIsAuthorizingOAuth(false);
      setValidationError(err.message || "Erro ao conectar com a sessão ativa.");
    }
  };

  const handleSetPrimary = (credId: string) => {
    if (!configuringPlugin) return;
    setPrimaryPluginCredential(configuringPlugin.id, credId);
    toast.success(t("Conta definida como principal."));
    refreshConnections();
  };

  const handleRemoveCredential = async (credId: string) => {
    if (!configuringPlugin) return;
    await removePluginCredentialUnified(configuringPlugin.id, credId);
    toast.success(t("Credencial removida."));
    refreshConnections();
  };

  const handleSaveConnection = async () => {
    if (!configuringPlugin) return;
    const key = inputKey.trim();
    if (!key && configuringPlugin.authType !== "oauth" && configuringPlugin.id !== "slack") {
      setValidationError(t("Insere uma chave de API ou token válido."));
      toast.error(t("Insere uma chave de API ou token válido."));
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const result = await validatePluginCredentials(configuringPlugin.id, {
        apiKey: key,
        accountName: inputAccount.trim(),
        customEndpoint: inputEndpoint.trim(),
      });

      if (!result.valid) {
        setValidationError(result.message);
        toast.error(result.message);
        setIsValidating(false);
        return;
      }

      await connectPluginUnified(configuringPlugin.id, {
        label: inputLabel.trim() || undefined,
        apiKey: key || "connected_oauth",
        accountName: inputAccount.trim() || result.details?.username || undefined,
        customEndpoint: inputEndpoint.trim() || result.details?.customEndpoint || undefined,
        projectRef: result.details?.detectedRef || inputAccount.trim() || undefined,
        projects: result.details?.projects,
        verifiedAt: new Date().toISOString(),
        validationStatus: "verified",
        validationMessage: result.message,
        isPrimary: inputIsPrimary,
      });

      toast.success(
        result.message || t(`${configuringPlugin.name} ligado e validado com sucesso!`),
      );
      refreshConnections();
      setShowAddAccountForm(false);
      setInputKey("");
      setInputLabel("");
      setInputAccount("");
      setConfiguringPlugin(null);
    } catch (err: any) {
      const msg = err.message || "Erro inesperado ao validar credenciais.";
      setValidationError(msg);
      toast.error(msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleForceSaveConnection = async () => {
    if (!configuringPlugin) return;
    const key = inputKey.trim();
    if (!key && configuringPlugin.authType !== "oauth" && configuringPlugin.id !== "slack") {
      toast.error(t("Insere uma chave de API ou token."));
      return;
    }

    await connectPluginUnified(configuringPlugin.id, {
      label: inputLabel.trim() || undefined,
      apiKey: key || "connected_direct",
      accountName: inputAccount.trim() || undefined,
      customEndpoint:
        inputEndpoint.trim() ||
        (inputAccount.trim() ? `https://${inputAccount.trim()}.supabase.co` : undefined),
      projectRef: inputAccount.trim() || undefined,
      verifiedAt: new Date().toISOString(),
      validationStatus: "verified",
      validationMessage: "⚡ Conexão direta ativada com o token fornecido.",
      isPrimary: inputIsPrimary,
    });

    toast.success(t(`${configuringPlugin.name} ligado com sucesso!`));
    refreshConnections();
    setShowAddAccountForm(false);
    setInputKey("");
    setInputLabel("");
    setInputAccount("");
    setConfiguringPlugin(null);
  };

  const handleDisconnect = async (plugin: PluginDefinition) => {
    await disconnectPluginUnified(plugin.id);
    toast.success(t(`${plugin.name} desligado.`));
    refreshConnections();
  };

  const renderLogo = (logoName: string, className = "size-7") => {
    const iconEntries = Object.entries(BrandIcons).filter(
      ([key, value]) => key.endsWith("Logo") && typeof value === "function",
    ) as [string, React.ComponentType<{ className?: string }>][];
    const icons: Record<string, React.ComponentType<{ className?: string }>> = Object.fromEntries(iconEntries);
    const Component = icons[logoName];
    if (Component) {
      return <Component className={className} />;
    }
    return <Plug className={className} />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground animate-fade-in pb-28">
      {/* Top Header */}
      <div className="sticky top-0 z-30 border-b border-hairline/80 bg-background/95 backdrop-blur-md px-4 pt-[calc(max(env(safe-area-inset-top,0px),24px)+0.5rem)] pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={t("Voltar às Definições")}
            className="grid size-9 place-items-center rounded-full border border-hairline bg-surface text-foreground transition-transform active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] font-semibold tracking-tight">
              {t("Plugins e Integrações")}
            </h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {connectedCount} {t("de")} {PLUGINS_LIST.length} {t("conectados")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11.5px] font-medium text-foreground">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span>{connectedCount} ativos</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Procurar plugins (GitHub, Supabase, Redis, Slack...)")}
            className="w-full rounded-2xl border border-hairline bg-surface py-2.5 pl-9 pr-9 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Categories Tab Bar */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(
            [
              { id: "all", label: t("Todos") },
              { id: "dev_cloud", label: t("Dev & Cloud") },
              { id: "database", label: t("Bases de Dados") },
              { id: "productivity", label: t("Produtividade") },
              { id: "ai_tools", label: t("IA & Design") },
            ] as const
          ).map((cat) => {
            const active = selectedCategory === cat.id;
            const count =
              cat.id === "all"
                ? PLUGINS_LIST.length
                : PLUGINS_LIST.filter((p) => p.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-hairline/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plugins Grid */}
      <div className="p-4 space-y-3">
        {filteredPlugins.length === 0 ? (
          <div className="rounded-2xl border border-hairline/80 bg-surface/50 p-8 text-center my-6">
            <Search className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-2 text-[14px] font-medium">{t("Nenhum plugin encontrado")}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t("Tenta outro termo de pesquisa ou muda de categoria.")}
            </p>
          </div>
        ) : (
          filteredPlugins.map((plugin) => {
            const isConn = Boolean(connectedMap[plugin.id]?.connected);
            const connData = connectedMap[plugin.id];

            return (
              <div
                key={plugin.id}
                className={`relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 ${
                  isConn
                    ? "border-emerald-500/30 bg-surface shadow-[0_2px_12px_rgba(16,185,129,0.04)]"
                    : "border-hairline bg-surface/60 hover:bg-surface"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* Real SVG Logo in polished circular avatar */}
                  <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-hairline bg-background shadow-xs">
                    {renderLogo(plugin.logoName, "size-6")}
                    {isConn && (
                      <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-500 ring-2 ring-background shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-semibold text-foreground">
                        {plugin.name}
                      </h3>
                      <span className="rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {plugin.categoryLabel}
                      </span>
                    </div>

                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2">
                      {plugin.description}
                    </p>

                    {/* Status hint if connected */}
                    {isConn && (
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <ShieldCheck className="size-3.5" />
                          <span>{t("Ligado e Validado")}</span>
                          {connData?.authMethod === "oauth" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Zap className="size-2.5 fill-current text-amber-500" />
                              {t("Avançado (OAuth)")}
                            </span>
                          )}
                          {connData?.secretHint && connData?.authMethod !== "oauth" && (
                            <span className="text-muted-foreground/70 font-mono text-[11px]">
                              ({connData.secretHint})
                            </span>
                          )}
                        </div>
                        {(connData?.username || connData?.accountName || connData?.projectRef) && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                            {connData?.avatarUrl && (
                              <img
                                src={connData.avatarUrl}
                                alt=""
                                className="size-3.5 rounded-full object-cover"
                              />
                            )}
                            <span className="opacity-70">Conta / Ref:</span>
                            <span className="font-semibold text-foreground/90">
                              {connData.username
                                ? `@${connData.username}`
                                : connData.accountName || connData.projectRef}
                            </span>
                          </div>
                        )}
                        {connData?.projects && connData.projects.length > 0 && (
                          <div className="text-[10.5px] text-muted-foreground/80">
                            {connData.projects.length} {t("projeto(s) detetado(s) na conta")}
                          </div>
                        )}
                        {connData?.validationMessage &&
                          connData.validationMessage.includes("Aviso") && (
                            <div className="mt-1 rounded-lg bg-amber-500/10 p-1.5 text-[10.5px] text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                              ⚠️{" "}
                              {connData.validationMessage.split("⚠️")[1]?.trim() ||
                                connData.validationMessage}
                            </div>
                          )}
                      </div>
                    )}

                    {!isConn && plugin.supportsOAuth && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
                        <span>{t("Suporta Login com Conta (1-Clique)")}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isConn ? (
                      <>
                        <button
                          onClick={() => handleOpenConfig(plugin)}
                          className="grid size-8 place-items-center rounded-full border border-hairline text-foreground/80 hover:bg-secondary active:scale-95"
                          title={t("Configurar")}
                        >
                          <Sliders className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPluginToDisconnect(plugin)}
                          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-colors"
                          title={t("Desligar")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConfig(plugin)}
                        className="rounded-full bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-transform active:scale-95"
                      >
                        {t("Ligar")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Conexão e Configuração do Plugin */}
      {configuringPlugin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-hairline bg-card p-5 shadow-2xl rise">
            <div className="flex items-center justify-between border-b border-hairline pb-3.5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-2xl border border-hairline bg-surface">
                  {renderLogo(configuringPlugin.logoName, "size-5")}
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground">
                    {configuringPlugin.name}
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    {configuringPlugin.categoryLabel}
                  </p>
                </div>
              </div>
              <button
                disabled={isValidating}
                onClick={() => setConfiguringPlugin(null)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {configuringPlugin.description}
              </p>

              {/* Banner de Erro de Validação */}
              {validationError && (
                <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-destructive animate-fade-in text-[12.5px]">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <div className="leading-snug flex-1">{validationError}</div>
                  </div>
                  <div className="pt-2 border-t border-destructive/20 flex items-center justify-between">
                    <span className="text-[11.5px] text-muted-foreground">
                      {t("O teu token é real?")}
                    </span>
                    <button
                      type="button"
                      onClick={handleForceSaveConnection}
                      className="text-[11.5px] font-semibold text-foreground underline underline-offset-2 hover:opacity-85 active:scale-95"
                    >
                      {t("Guardar mesmo assim")}
                    </button>
                  </div>
                </div>
              )}

              {/* Tabs de Seleção de Autenticação se o plugin suportar OAuth */}
              {configuringPlugin.supportsOAuth && (
                <div className="flex rounded-2xl bg-surface/90 p-1 border border-hairline">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab("oauth");
                      setValidationError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold transition-all ${
                      authTab === "oauth"
                        ? "bg-background text-foreground shadow-xs border border-hairline"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{t("Login com a Conta")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab("manual");
                      setValidationError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold transition-all ${
                      authTab === "manual"
                        ? "bg-background text-foreground shadow-xs border border-hairline"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{t("Chave Manual / Token")}</span>
                  </button>
                </div>
              )}

              {/* PAINEL OAUTH: Autenticação com Login / 1-Clique na Conta */}
              {configuringPlugin.supportsOAuth && authTab === "oauth" && (
                <div className="space-y-3.5 animate-fade-in">
                  {/* Se detetar sessão ativa do utilizador nesta plataforma */}
                  {detectedSession?.hasMatchingSession && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        {detectedSession.avatarUrl ? (
                          <img
                            src={detectedSession.avatarUrl}
                            alt=""
                            className="size-9 rounded-full ring-1 ring-amber-500/40 object-cover"
                          />
                        ) : (
                          <div className="size-9 rounded-full bg-amber-500/20 grid place-items-center text-amber-600 dark:text-amber-400 font-bold text-sm">
                            {detectedSession.userName?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold text-foreground truncate">
                              @{detectedSession.userName || "utilizador"}
                            </span>
                            <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              {t("Sessão Ativa")}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-muted-foreground truncate">
                            {detectedSession.userEmail}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11.5px] text-muted-foreground leading-snug">
                        {t(
                          "Estás autenticado no GRIOT com esta conta. Podes conectá-la diretamente para autorização instantânea.",
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handleConnectWithActiveSession}
                        disabled={isAuthorizingOAuth}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white py-2.5 text-[12.5px] font-semibold shadow-xs transition-transform disabled:opacity-50"
                      >
                        {isAuthorizingOAuth && (
                          <Loader2 className="size-3.5 animate-spin" />
                        )}
                        <span>{t("Conectar com a Conta Ativa")}</span>
                      </button>
                    </div>
                  )}

                  {/* Card Principal de Autorização OAuth */}
                  <div className="rounded-2xl border border-hairline bg-surface/60 p-4 space-y-3.5">
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline bg-background shadow-xs">
                        {renderLogo(configuringPlugin.logoName, "size-6")}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-semibold text-foreground">
                          {t(`Conectar Conta ${configuringPlugin.name}`)}
                        </h4>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                          {t(
                            "Autoriza o GRIOT com 1-clique diretamente na tua conta. Sem copiar ou gerir chaves manuais.",
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartOAuth}
                      disabled={isAuthorizingOAuth}
                      className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99] py-3 text-[13.5px] font-semibold shadow-xs transition-all disabled:opacity-50"
                    >
                      {isAuthorizingOAuth ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span>{t("A abrir autorização na janela segura...")}</span>
                        </>
                      ) : (
                        <span>{t(`Entrar e Autorizar com ${configuringPlugin.name}`)}</span>
                      )}
                    </button>

                    {/* Lista de Capacidades Avançadas */}
                    <div className="space-y-2 pt-2 border-t border-hairline/60">
                      <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                        {t("O que o GRIOT pode fazer com esta conexão:")}
                      </span>
                      <div className="space-y-1.5 text-[12px] text-muted-foreground">
                        {(
                          configuringPlugin.advancedCapabilities || [
                            "Acesso avançado seguro e direto via OAuth 2.0",
                            "Operações de leitura e escrita autorizadas",
                            "Sincronização bidirecional em tempo real com os agentes",
                            "Sem expiração manual de chaves",
                          ]
                        ).map((cap, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="leading-snug">{cap}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Preset Link para GitHub */}
                    {configuringPlugin.id === "github" && (
                      <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[11.5px]">
                        <span className="text-muted-foreground">
                          {t("Ou prefere criar um Personal Token?")}
                        </span>
                        <a
                          href="https://github.com/settings/tokens/new?description=GRIOT%20Mobile%20Advanced%20OAuth&scopes=repo,workflow,read:org,read:user,user:email,gist"
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline flex items-center gap-1"
                        >
                          <span>{t("Token c/ Escopos Prontos")}</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PAINEL MANUAL / GESTÃO DE CONTAS */}
              {(!configuringPlugin.supportsOAuth || authTab === "manual") && (
                <>
                  {/* Lista de Contas Conectadas */}
                  {(() => {
                    const creds = getPluginCredentials(configuringPlugin.id);
                    if (creds.length === 0) return null;
                    return (
                      <div className="space-y-2 rounded-2xl border border-hairline bg-surface/60 p-3">
                        <div className="flex items-center justify-between pb-1 border-b border-hairline/60">
                          <span className="text-[11.5px] font-semibold text-foreground uppercase tracking-wider">
                            {t("Contas Conectadas")} ({creds.length})
                          </span>
                          {!showAddAccountForm && (
                            <button
                              type="button"
                              onClick={() => {
                                setInputKey("");
                                setInputLabel("");
                                setInputAccount("");
                                setInputIsPrimary(false);
                                setShowAddAccountForm(true);
                              }}
                              className="flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                            >
                              <Plus className="size-3" />
                              <span>{t("Nova conta")}</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {creds.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-hairline/60 bg-background/80 p-2.5 text-[12.5px]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-foreground truncate">
                                    {c.label}
                                  </span>
                                  {c.isPrimary && (
                                    <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-500">
                                      <Star className="size-2.5 fill-current" />
                                      {t("Principal")}
                                    </span>
                                  )}
                                  {c.authMethod === "oauth" && (
                                    <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                      <Zap className="size-2.5 fill-current" />
                                      OAuth
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {c.username ? `@${c.username}` : c.secretHint}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {!c.isPrimary && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetPrimary(c.id)}
                                    title={t("Definir como Principal")}
                                    className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95"
                                  >
                                    {t("Tornar Principal")}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCredential(c.id)}
                                  title={t("Remover")}
                                  className="rounded-lg p-1 text-muted-foreground hover:text-destructive active:scale-95"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Formulário de Adição de Conta Manual */}
                  {showAddAccountForm && (
                    <div className="space-y-3 pt-1 animate-fade-in">
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">
                          {t("Nome / Etiqueta da Conta (ex: Pessoal, Equipa Dev, Empresa)")}
                        </label>
                        <input
                          type="text"
                          value={inputLabel}
                          onChange={(e) => setInputLabel(e.target.value)}
                          placeholder={t("Ex.: Pedro Dev ou Empresa Neoverbis")}
                          className="w-full rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">
                          {configuringPlugin.id === "supabase"
                            ? t("Personal Access Token (sbp_...) ou Chave JWT")
                            : configuringPlugin.authType === "webhook"
                              ? t("Webhook URL")
                              : t("Chave de API / Token de Acesso")}
                        </label>
                        <input
                          type="password"
                          value={inputKey}
                          onChange={(e) => {
                            setInputKey(e.target.value);
                            if (validationError) setValidationError(null);
                          }}
                          placeholder={
                            configuringPlugin.id === "supabase"
                              ? "sbp_xxxxxxxxxxxx (Recomendado) ou eyJhbGciOi..."
                              : configuringPlugin.placeholder
                          }
                          className="w-full rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground font-mono"
                        />
                        {configuringPlugin.id === "supabase" && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {t(
                              "Dica: Usa o Personal Access Token (sbp_...) para permissão total de criação de tabelas e queries SQL PostgreSQL diretas.",
                            )}
                          </p>
                        )}
                        {configuringPlugin.id === "github" && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {t(
                              "Dica: Gera um Personal Access Token com o escopo 'repo' marcado em github.com/settings/tokens para ver repositórios privados e criar/gravar ficheiros.",
                            )}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">
                          {configuringPlugin.id === "supabase"
                            ? t("Project Ref ou URL do Projeto (Opcional com token sbp_)")
                            : configuringPlugin.id === "redis" || configuringPlugin.id === "upstash"
                              ? t("REST URL do Upstash / Redis (ex: https://xxx.upstash.io)")
                              : t("Identificador da Conta ou Workspace (Opcional)")}
                        </label>
                        <input
                          type="text"
                          value={inputAccount}
                          onChange={(e) => {
                            setInputAccount(e.target.value);
                            if (validationError) setValidationError(null);
                          }}
                          placeholder={
                            configuringPlugin.id === "supabase"
                              ? t("Ex.: meu-projeto-ref ou https://xyz.supabase.co")
                              : configuringPlugin.id === "redis" ||
                                  configuringPlugin.id === "upstash"
                                ? "https://xxx.upstash.io"
                                : t("Ex.: org-principal, equipa-dev")
                          }
                          className="w-full rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={inputIsPrimary}
                          onChange={(e) => setInputIsPrimary(e.target.checked)}
                          className="size-4 rounded accent-primary"
                        />
                        <span className="text-[12.5px] text-foreground font-medium">
                          {t("Definir como conta Principal (padrão de execução)")}
                        </span>
                      </label>
                    </div>
                  )}
                </>
              )}

              {configuringPlugin.docsUrl && (
                <a
                  href={configuringPlugin.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  <ExternalLink className="size-3" />
                  <span>
                    {t("Onde obter credenciais do")} {configuringPlugin.name}
                  </span>
                </a>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-hairline pt-3.5">
              {Boolean(connectedMap[configuringPlugin.id]?.connected) && (
                <button
                  type="button"
                  disabled={isValidating}
                  onClick={() => {
                    const p = configuringPlugin;
                    setConfiguringPlugin(null);
                    setPluginToDisconnect(p);
                  }}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-destructive hover:bg-destructive/10 active:scale-95 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t("Desligar")}</span>
                </button>
              )}
              <button
                type="button"
                disabled={isValidating}
                onClick={() => {
                  if (showAddAccountForm && getPluginCredentials(configuringPlugin.id).length > 0) {
                    setShowAddAccountForm(false);
                  } else {
                    setConfiguringPlugin(null);
                  }
                }}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {showAddAccountForm && getPluginCredentials(configuringPlugin.id).length > 0
                  ? t("Voltar")
                  : t("Concluído")}
              </button>
              {showAddAccountForm && (!configuringPlugin.supportsOAuth || authTab === "manual") && (
                <button
                  type="button"
                  disabled={isValidating}
                  onClick={handleSaveConnection}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-xs transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{t("A Validar na API...")}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-3.5" />
                      <span>{t("Validar e Ligar")}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Desligar Plugin */}
      <ConfirmationModal
        open={Boolean(pluginToDisconnect)}
        title={t("Desligar plugin?")}
        description={
          pluginToDisconnect
            ? t(
                `Tens a certeza de que desejas desligar o plugin "${pluginToDisconnect.name}"? As ferramentas e integrações deste serviço deixarão de estar disponíveis para os agentes.`,
              )
            : ""
        }
        confirmLabel={t("Desligar")}
        cancelLabel={t("Cancelar")}
        variant="destructive"
        icon={<Trash2 className="size-5" />}
        onConfirm={() => {
          if (pluginToDisconnect) {
            handleDisconnect(pluginToDisconnect);
            setPluginToDisconnect(null);
          }
        }}
        onClose={() => setPluginToDisconnect(null)}
      />
    </div>
  );
}
