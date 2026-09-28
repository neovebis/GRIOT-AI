import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  Check,
  ChevronLeft,
  Clock,
  FileText,
  ImagePlus,
  Layers,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  ASSET_STATUS_LABEL,
  CAPSULE_TYPE_LIST,
  DECISION_STATUS_LABEL,
  entityTypeLabel,
  typeSpec,
  type AssetStatus,
  type CapsuleType,
  type DecisionStatus,
} from "@/lib/capsule-types";
import {
  createCapsule,
  decideDecision,
  getCanon,
  getCapsule,
  getTimeline,
  listAssets,
  listEntities,
  proposeDecision,
  registerAsset,
  searchCapsule,
  setPhase,
  supersedeDecision,
  upsertEntity,
} from "@/lib/capsule.functions";

type Tab = "canon" | "entities" | "assets" | "phases" | "history";

const PILL = "rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors duration-200";

export function CapsulePanel({
  open,
  onClose,
  capsuleId,
  conversationId,
  userId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  capsuleId: string | null;
  conversationId: string | null;
  userId: string;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("canon");

  return (
    <>
      <button
        aria-label={t("Fechar Cápsula")}
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-background/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className="fixed right-0 z-[61] flex w-[92%] max-w-[400px] flex-col overflow-hidden rounded-l-[26px] border border-hairline border-r-0 bg-surface/95 backdrop-blur-2xl"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 92px)",
          height:
            "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 172px)",
          transform: `translate3d(${open ? "0" : "102%"},0,0)`,
          transition: "transform 380ms var(--ease-griot)",
        }}
      >
        {capsuleId ? (
          <CapsuleWorkspace
            capsuleId={capsuleId}
            userId={userId}
            tab={tab}
            onTab={setTab}
            onClose={onClose}
          />
        ) : (
          <Activation conversationId={conversationId} onClose={onClose} onCreated={onCreated} />
        )}
      </aside>
    </>
  );
}

// --------------------------------------------------------------------- ativação

function Activation({
  conversationId,
  onClose,
  onCreated,
}: {
  conversationId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const create = useServerFn(createCapsule);
  const [name, setName] = useState("");
  const [type, setType] = useState<CapsuleType>("story");
  const [busy, setBusy] = useState(false);

  async function activate() {
    if (!name.trim()) {
      toast.error(t("Dá um nome à Cápsula."));
      return;
    }
    setBusy(true);
    try {
      const capsule = await create({ data: { name: name.trim(), type } });
      // A associação conversa→cápsula é mantida em memória/estado:
      // a tabela de conversas do servidor não tem coluna para cápsulas.
      void conversationId;
      onCreated(capsule.id);
      toast.success(t("Cápsula ativa."));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title={t("Cápsula")} subtitle={t("Ainda não existe")} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
          {t(
            "Ativa a Cápsula para esta conversa passar a ter memória estruturada: Canon, entidades, ficheiros e fases.",
          )}
        </p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Nome do projeto")}
          maxLength={120}
          className="mb-2 w-full rounded-xl bg-secondary px-3 py-2 text-[13.5px] outline-none"
        />
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {CAPSULE_TYPE_LIST.map((spec) => (
            <button
              key={spec.id}
              onClick={() => setType(spec.id)}
              className={`rounded-[16px] border px-3 py-2.5 text-left transition-colors duration-200 ${
                type === spec.id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-hairline"
              }`}
            >
              <span className="block text-[12.5px] font-medium">{t(spec.label)}</span>
              <span className="block text-[10.5px] opacity-70">{t(spec.hint)}</span>
            </button>
          ))}
        </div>
        <button
          disabled={busy}
          onClick={() => void activate()}
          className="w-full rounded-xl bg-primary py-2.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("A criar…") : t("Ativar Cápsula")}
        </button>
      </div>
    </>
  );
}

function Header({
  title,
  subtitle,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <button
        onClick={onBack}
        aria-label={onBack ? t("Voltar") : title}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
      >
        {onBack ? <ChevronLeft className="size-4" /> : <Boxes className="size-[16px]" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">{title}</span>
        {subtitle ? (
          <span className="block truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <button
        onClick={onClose}
        aria-label={t("Fechar")}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// -------------------------------------------------------------------- workspace

function CapsuleWorkspace({
  capsuleId,
  userId,
  tab,
  onTab,
  onClose,
}: {
  capsuleId: string;
  userId: string;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const fetchCapsule = useServerFn(getCapsule);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const doSearch = useServerFn(searchCapsule);

  const capsule = useQuery({
    queryKey: ["capsule", capsuleId],
    queryFn: () => fetchCapsule({ data: { capsuleId } }),
  });

  const search = useQuery({
    queryKey: ["capsule-search", capsuleId, query],
    queryFn: () => doSearch({ data: { capsuleId, query } }),
    enabled: searching && query.trim().length > 1,
  });

  const spec = typeSpec(capsule.data?.capsule.type);
  const phase = capsule.data?.phases.find(
    (row) => row.id === capsule.data?.capsule.current_phase_id || row.status === "current",
  );

  const tabs = useMemo(
    () =>
      [
        ["canon", t("Canon"), Layers],
        ["entities", t("Entidades"), Users],
        ["assets", t("Ficheiros"), FileText],
        ["phases", t("Fases"), Check],
        ["history", t("Histórico"), Clock],
      ] as const,
    [t],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["capsule"] });
    void queryClient.invalidateQueries({ queryKey: ["capsule-canon", capsuleId] });
    void queryClient.invalidateQueries({ queryKey: ["capsule-entities", capsuleId] });
    void queryClient.invalidateQueries({ queryKey: ["capsule-assets", capsuleId] });
    void queryClient.invalidateQueries({ queryKey: ["capsule-timeline", capsuleId] });
  }

  return (
    <>
      <Header
        title={capsule.data?.capsule.name ?? t("Cápsula")}
        subtitle={`${t(spec.label)}${phase ? ` · ${phase.title}` : ""}`}
        onClose={onClose}
      />

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearching(event.target.value.trim().length > 1);
            }}
            placeholder={t("Procurar em toda a Cápsula")}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
              aria-label={t("Limpar")}
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </div>

      {!searching ? (
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 no-scrollbar">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`flex shrink-0 items-center gap-1 ${PILL} ${
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              <Icon className="size-3" /> {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        {searching ? (
          <SearchResults data={search.data} loading={search.isLoading} />
        ) : tab === "canon" ? (
          <CanonTab capsuleId={capsuleId} sections={spec.sections} onChanged={invalidate} />
        ) : tab === "entities" ? (
          <EntitiesTab capsuleId={capsuleId} type={spec.id} onChanged={invalidate} />
        ) : tab === "assets" ? (
          <AssetsTab capsuleId={capsuleId} userId={userId} onChanged={invalidate} />
        ) : tab === "phases" ? (
          <PhasesTab
            capsuleId={capsuleId}
            phases={capsule.data?.phases ?? []}
            onChanged={invalidate}
          />
        ) : (
          <HistoryTab capsuleId={capsuleId} />
        )}
      </div>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="pt-3 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>;
}

// ------------------------------------------------------------------------ canon

const STATUS_STYLE: Record<string, string> = {
  canonical: "bg-primary text-primary-foreground",
  proposed: "bg-secondary text-foreground",
  rejected: "bg-secondary text-muted-foreground line-through",
  superseded: "bg-secondary text-muted-foreground",
  draft: "bg-secondary text-muted-foreground",
};

function CanonTab({
  capsuleId,
  sections,
  onChanged,
}: {
  capsuleId: string;
  sections: string[];
  onChanged: () => void;
}) {
  const t = useT();
  const fetchCanon = useServerFn(getCanon);
  const propose = useServerFn(proposeDecision);
  const decide = useServerFn(decideDecision);
  const supersede = useServerFn(supersedeDecision);
  const [filter, setFilter] = useState<DecisionStatus | "all">("canonical");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [section, setSection] = useState(sections[0] ?? "Geral");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");

  const canon = useQuery({
    queryKey: ["capsule-canon", capsuleId, filter],
    queryFn: () =>
      fetchCanon({
        data: { capsuleId, ...(filter === "all" ? {} : { status: [filter] }) },
      }),
  });

  const add = useMutation({
    mutationFn: () =>
      propose({
        data: {
          capsuleId,
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          section,
          proposedBy: "user" as const,
          autoApprove: true,
        },
      }),
    onSuccess: (result) => {
      setCreating(false);
      setTitle("");
      setDescription("");
      if (result.conflicts.length > 0) {
        toast.warning(`${t("Possível conflito com")} “${result.conflicts[0]!.existing.title}”`);
      } else {
        toast.success(t("Adicionado ao Canon."));
      }
      void canon.refetch();
      onChanged();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const act = useMutation({
    mutationFn: (input: { decisionId: string; action: "approve" | "reject" | "restore" }) =>
      decide({
        data: {
          capsuleId,
          decisionId: input.decisionId,
          action: input.action,
          ...(input.action === "reject" ? { reason: t("Rejeitado pelo utilizador") } : {}),
        },
      }),
    onSuccess: (result) => {
      const blocking = result.issues.filter((issue) => issue.severity === "error");
      if (blocking.length > 0) toast.error(blocking[0]!.message);
      else void canon.refetch();
      onChanged();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const replace = useMutation({
    mutationFn: (input: { decisionId: string; title: string }) =>
      supersede({ data: { capsuleId, decisionId: input.decisionId, title: input.title } }),
    onSuccess: () => {
      setReplacing(null);
      setReplacement("");
      toast.success(t("Canon atualizado."));
      void canon.refetch();
      onChanged();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <>
      <div className="mb-2 flex gap-1 overflow-x-auto no-scrollbar">
        {(["canonical", "proposed", "rejected", "superseded", "all"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`shrink-0 ${PILL} ${
              filter === id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {id === "all" ? t("Tudo") : t(DECISION_STATUS_LABEL[id])}
          </button>
        ))}
      </div>

      {creating ? (
        <div className="mb-3 rounded-[18px] border border-hairline p-2.5">
          <div className="mb-2 flex flex-wrap gap-1">
            {sections.map((option) => (
              <button
                key={option}
                onClick={() => setSection(option)}
                className={`${PILL} ${
                  section === option ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("A decisão, numa frase")}
            maxLength={300}
            className="mb-1.5 w-full rounded-xl bg-secondary px-3 py-2 text-[13.5px] outline-none"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder={t("Detalhe (opcional)")}
            className="w-full resize-none rounded-xl bg-secondary px-3 py-2 text-[13px] outline-none"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              disabled={add.isPending}
              onClick={() => add.mutate()}
              className="flex-1 rounded-xl bg-primary py-2 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("Guardar em Canon")}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-xl bg-secondary px-3 py-2 text-[12.5px]"
            >
              {t("Cancelar")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-hairline py-2.5 text-[12.5px] font-medium active:bg-secondary"
        >
          <Plus className="size-3.5" /> {t("Nova decisão")}
        </button>
      )}

      {canon.isLoading ? (
        <Empty text={t("A carregar…")} />
      ) : (canon.data?.decisions.length ?? 0) === 0 ? (
        <Empty
          text={t("Sem decisões aqui. O Canon é a fonte da verdade: só entra o que aprovares.")}
        />
      ) : (
        <div className="space-y-1.5">
          {canon.data!.decisions.map((row) => (
            <div key={row.id} className="rounded-[18px] border border-hairline px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`${PILL} ${STATUS_STYLE[row.status] ?? "bg-secondary"}`}>
                  {t(DECISION_STATUS_LABEL[row.status as DecisionStatus] ?? row.status)}
                </span>
                {row.section ? (
                  <span className="text-[10.5px] text-muted-foreground">{row.section}</span>
                ) : null}
              </div>
              <p className="text-[13.5px] leading-snug font-medium">{row.title}</p>
              {row.description ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {row.description}
                </p>
              ) : null}
              {row.status === "rejected" && row.reason ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("Motivo")}: {row.reason}
                </p>
              ) : null}

              {replacing === row.id ? (
                <div className="mt-2">
                  <input
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                    placeholder={t("Nova versão desta decisão")}
                    className="mb-1.5 w-full rounded-xl bg-secondary px-3 py-2 text-[12.5px] outline-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      disabled={replace.isPending || replacement.trim().length < 2}
                      onClick={() =>
                        replace.mutate({ decisionId: row.id, title: replacement.trim() })
                      }
                      className="flex-1 rounded-xl bg-primary py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {t("Substituir")}
                    </button>
                    <button
                      onClick={() => setReplacing(null)}
                      className="rounded-xl bg-secondary px-3 py-1.5 text-[12px]"
                    >
                      {t("Cancelar")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.status === "proposed" || row.status === "draft" ? (
                    <button
                      onClick={() => act.mutate({ decisionId: row.id, action: "approve" })}
                      className={`${PILL} bg-primary text-primary-foreground`}
                    >
                      {t("Aprovar")}
                    </button>
                  ) : null}
                  {row.status === "canonical" ? (
                    <button onClick={() => setReplacing(row.id)} className={`${PILL} bg-secondary`}>
                      {t("Substituir")}
                    </button>
                  ) : null}
                  {row.status === "rejected" || row.status === "superseded" ? (
                    <button
                      onClick={() => act.mutate({ decisionId: row.id, action: "restore" })}
                      className={`${PILL} bg-secondary`}
                    >
                      {t("Repor em Canon")}
                    </button>
                  ) : null}
                  {row.status !== "rejected" ? (
                    <button
                      onClick={() => act.mutate({ decisionId: row.id, action: "reject" })}
                      className={`${PILL} bg-secondary text-muted-foreground`}
                    >
                      {t("Rejeitar")}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------- entidades

function EntitiesTab({
  capsuleId,
  type,
  onChanged,
}: {
  capsuleId: string;
  type: CapsuleType;
  onChanged: () => void;
}) {
  const t = useT();
  const fetchEntities = useServerFn(listEntities);
  const upsert = useServerFn(upsertEntity);
  const spec = typeSpec(type);
  const [entityType, setEntityType] = useState<string>(spec.entityTypes[0]?.id ?? "note");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const entities = useQuery({
    queryKey: ["capsule-entities", capsuleId, entityType],
    queryFn: () => fetchEntities({ data: { capsuleId, entityType } }),
  });

  const fieldSpec = spec.entityTypes.find((row) => row.id === entityType)?.fields ?? [];

  const save = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          capsuleId,
          ...(editing ? { entityId: editing } : {}),
          name: name.trim(),
          entityType,
          ...(description.trim() ? { description: description.trim() } : {}),
          properties: Object.fromEntries(
            Object.entries(fields).filter(([, value]) => value.trim().length > 0),
          ),
        },
      }),
    onSuccess: () => {
      setCreating(false);
      setEditing(null);
      setName("");
      setDescription("");
      setFields({});
      void entities.refetch();
      onChanged();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <>
      <div className="mb-2 flex gap-1 overflow-x-auto no-scrollbar">
        {spec.entityTypes.map((option) => (
          <button
            key={option.id}
            onClick={() => setEntityType(option.id)}
            className={`shrink-0 ${PILL} ${
              entityType === option.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      {creating || editing ? (
        <div className="mb-3 rounded-[18px] border border-hairline p-2.5">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("Nome")}
            className="mb-1.5 w-full rounded-xl bg-secondary px-3 py-2 text-[13.5px] outline-none"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder={t("Descrição")}
            className="mb-1.5 w-full resize-none rounded-xl bg-secondary px-3 py-2 text-[13px] outline-none"
          />
          {fieldSpec.map((field) => (
            <input
              key={field}
              value={fields[field] ?? ""}
              onChange={(event) =>
                setFields((current) => ({ ...current, [field]: event.target.value }))
              }
              placeholder={t(field)}
              className="mb-1.5 w-full rounded-xl bg-secondary px-3 py-1.5 text-[12.5px] outline-none"
            />
          ))}
          <div className="mt-1 flex gap-1.5">
            <button
              disabled={save.isPending || name.trim().length === 0}
              onClick={() => save.mutate()}
              className="flex-1 rounded-xl bg-primary py-2 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("Guardar")}
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              className="rounded-xl bg-secondary px-3 py-2 text-[12.5px]"
            >
              {t("Cancelar")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-hairline py-2.5 text-[12.5px] font-medium active:bg-secondary"
        >
          <Plus className="size-3.5" /> {t("Nova")}{" "}
          {t(entityTypeLabel(type, entityType)).toLowerCase()}
        </button>
      )}

      {(entities.data?.entities.length ?? 0) === 0 ? (
        <Empty text={t("Nada aqui ainda.")} />
      ) : (
        <div className="space-y-1.5">
          {entities.data!.entities.map((row) => {
            const props = (row.properties ?? {}) as Record<string, string>;
            return (
              <button
                key={row.id}
                onClick={() => {
                  setEditing(row.id);
                  setName(row.name);
                  setDescription(row.description ?? "");
                  setFields(props);
                }}
                className="w-full rounded-[18px] border border-hairline px-3 py-2.5 text-left active:bg-secondary"
              >
                <p className="text-[13.5px] font-medium">{row.name}</p>
                {row.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
                {Object.keys(props).length > 0 ? (
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                    {Object.entries(props)
                      .slice(0, 3)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------- ficheiros

function AssetsTab({
  capsuleId,
  userId,
  onChanged,
}: {
  capsuleId: string;
  userId: string;
  onChanged: () => void;
}) {
  const t = useT();
  const fetchAssets = useServerFn(listAssets);
  const register = useServerFn(registerAsset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const assets = useQuery({
    queryKey: ["capsule-assets", capsuleId],
    queryFn: async () => {
      const result = await fetchAssets({ data: { capsuleId } });
      const entries: Record<string, string> = {};
      for (const asset of result.assets) {
        if (!asset.mime_type?.startsWith("image/")) continue;
        const { data } = await supabase.storage
          .from("captures")
          .createSignedUrl(asset.storage_path, 3600);
        if (data?.signedUrl) entries[asset.id] = data.signedUrl;
      }
      setUrls((current) => ({ ...current, ...entries }));
      return result;
    },
  });

  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("Ficheiro demasiado grande (máx. 20 MB)."));
      return;
    }
    setBusy(true);
    const path = `${userId}/capsule/${capsuleId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("captures").upload(path, file);
    if (error) {
      setBusy(false);
      toast.error(t("Não foi possível enviar o ficheiro."));
      return;
    }
    try {
      await register({
        data: {
          capsuleId,
          name: file.name,
          storagePath: path,
          mimeType: file.type || "application/octet-stream",
          status: "reference" as const,
        },
      });
      void assets.refetch();
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <button
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-hairline py-2.5 text-[12.5px] font-medium active:bg-secondary disabled:opacity-50"
      >
        <ImagePlus className="size-3.5" /> {busy ? t("A enviar…") : t("Adicionar ficheiro")}
      </button>

      {(assets.data?.assets.length ?? 0) === 0 ? (
        <Empty text={t("Sem ficheiros. Imagens, PDFs e áudio ficam ligados a esta Cápsula.")} />
      ) : (
        <div className="space-y-1.5">
          {assets.data!.assets.map((row) => (
            <div key={row.id} className="rounded-[18px] border border-hairline p-2.5">
              {urls[row.id] ? (
                <img
                  src={urls[row.id]}
                  alt={row.title ?? row.name}
                  loading="lazy"
                  className="mb-2 max-h-40 w-full rounded-xl object-cover"
                />
              ) : null}
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {row.title ?? row.name}
                </span>
                <span className={`${PILL} bg-secondary text-muted-foreground`}>
                  {t(ASSET_STATUS_LABEL[row.status as AssetStatus] ?? row.status)}
                </span>
              </div>
              {row.description ? (
                <p className="mt-1 text-[12px] text-muted-foreground">{row.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------------------- fases

function PhasesTab({
  capsuleId,
  phases,
  onChanged,
}: {
  capsuleId: string;
  phases: { id: string; title: string; status: string; position: number }[];
  onChanged: () => void;
}) {
  const t = useT();
  const change = useServerFn(setPhase);
  const mutate = useMutation({
    mutationFn: (input: { phaseId: string; status: "pending" | "current" | "completed" }) =>
      change({ data: { capsuleId, ...input } }),
    onSuccess: onChanged,
    onError: (error) => toast.error((error as Error).message),
  });

  if (phases.length === 0) return <Empty text={t("Sem fases definidas.")} />;

  return (
    <div className="space-y-1.5">
      {phases.map((phase) => (
        <div
          key={phase.id}
          className="flex items-center gap-2 rounded-[18px] border border-hairline px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 text-[13px]">{phase.title}</span>
          {(["pending", "current", "completed"] as const).map((status) => (
            <button
              key={status}
              onClick={() => mutate.mutate({ phaseId: phase.id, status })}
              className={`${PILL} ${
                phase.status === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {status === "pending"
                ? t("Por fazer")
                : status === "current"
                  ? t("Atual")
                  : t("Feita")}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------- histórico

function HistoryTab({ capsuleId }: { capsuleId: string }) {
  const t = useT();
  const fetchTimeline = useServerFn(getTimeline);
  const timeline = useQuery({
    queryKey: ["capsule-timeline", capsuleId],
    queryFn: () => fetchTimeline({ data: { capsuleId } }),
  });

  if ((timeline.data?.activity.length ?? 0) === 0) {
    return <Empty text={t("Ainda sem histórico.")} />;
  }
  return (
    <div className="space-y-1">
      {timeline.data!.activity.map((row) => (
        <div key={row.id} className="border-b border-hairline py-2 last:border-0">
          <p className="text-[12.5px]">{row.summary}</p>
          <p className="text-[10.5px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString("pt-PT")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------ procura

function SearchResults({
  data,
  loading,
}: {
  data:
    | {
        decisions: { id: string; title: string; status: string }[];
        entities: { id: string; name: string; entity_type: string }[];
        assets: { id: string; name: string; title: string | null }[];
        messages: { id: string; content: string }[];
      }
    | undefined;
  loading: boolean;
}) {
  const t = useT();
  if (loading) return <Empty text={t("A procurar…")} />;
  if (!data) return <Empty text={t("Escreve para procurar.")} />;
  const total =
    data.decisions.length + data.entities.length + data.assets.length + data.messages.length;
  if (total === 0) return <Empty text={t("Sem resultados.")} />;

  return (
    <div className="space-y-3">
      {data.decisions.length > 0 ? (
        <Group label={t("Canon")}>
          {data.decisions.map((row) => (
            <p key={row.id} className="text-[12.5px]">
              {row.title}
            </p>
          ))}
        </Group>
      ) : null}
      {data.entities.length > 0 ? (
        <Group label={t("Entidades")}>
          {data.entities.map((row) => (
            <p key={row.id} className="text-[12.5px]">
              {row.name}
            </p>
          ))}
        </Group>
      ) : null}
      {data.assets.length > 0 ? (
        <Group label={t("Ficheiros")}>
          {data.assets.map((row) => (
            <p key={row.id} className="text-[12.5px]">
              {row.title ?? row.name}
            </p>
          ))}
        </Group>
      ) : null}
      {data.messages.length > 0 ? (
        <Group label={t("Conversa")}>
          {data.messages.map((row) => (
            <p key={row.id} className="line-clamp-2 text-[12.5px] text-muted-foreground">
              {row.content}
            </p>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="space-y-1 rounded-[18px] border border-hairline px-3 py-2">{children}</div>
    </div>
  );
}
