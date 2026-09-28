import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/griot";
import { MessageCircle, Zap, Pin, Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export type Conversation = {
  id: string;
  scope: string;
  title: string | null;
  model: string;
  pinned: boolean;
  archived: boolean;
  updated_at: string;
  project_id?: string | null;
};

export async function listConversations(): Promise<Conversation[]> {
  const localMap: Record<string, Partial<Conversation>> = {};
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("griot_conversations_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id) localMap[item.id] = item;
          }
        }
      }
    } catch {}
  }

  let dbRows: any[] = [];
  try {
    const { data } = await (supabase as any)
      .from("griot_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(60);
    dbRows = data ?? [];
  } catch {}

  const mergedMap = new Map<string, Conversation>();

  for (const c of dbRows) {
    const loc = localMap[c.id] || {};
    const title = c.title || loc.title || "Conversa GRIOT";
    const inferredScope: "main" | "quick" =
      loc.scope === "quick" ||
      title.toLowerCase().startsWith("quick") ||
      title.toLowerCase().includes("quick")
        ? "quick"
        : (loc.scope as "main" | "quick") || "main";

    mergedMap.set(c.id, {
      id: c.id,
      scope: inferredScope,
      title,
      model: loc.model || "ModelOS",
      pinned: Boolean(loc.pinned),
      archived: Boolean(loc.archived),
      updated_at: c.updated_at || loc.updated_at || new Date().toISOString(),
    });
  }

  for (const id in localMap) {
    if (!mergedMap.has(id)) {
      const loc = localMap[id];
      const title = loc.title || (loc.scope === "quick" ? "Novo Quick" : "Conversa GRIOT");
      mergedMap.set(id, {
        id,
        scope: loc.scope === "quick" ? "quick" : "main",
        title,
        model: loc.model || "ModelOS",
        pinned: Boolean(loc.pinned),
        archived: Boolean(loc.archived),
        updated_at: loc.updated_at || new Date().toISOString(),
      });
    }
  }

  const all = Array.from(mergedMap.values()).filter((c) => !c.archived);

  return all.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

/** Barra lateral esquerda: conversas e quicks. */
export function ConversationDrawer({
  open,
  onClose,
  activeId,
  onSelect,
  onCreate,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onCreate: (scope: "main" | "quick") => void;
  refreshKey: number;
}) {
  const t = useT();
  const [items, setItems] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listConversations().then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  useEffect(() => {
    const handleUpdate = () => {
      void listConversations().then(setItems);
    };
    window.addEventListener("griot_conversations_changed", handleUpdate);
    return () => window.removeEventListener("griot_conversations_changed", handleUpdate);
  }, []);

  const chats = items.filter((item) => item.scope === "main");
  const quicks = items.filter((item) => item.scope === "quick");

  function Group({
    label,
    rows,
    Icon,
  }: {
    label: string;
    rows: Conversation[];
    Icon: typeof MessageCircle;
  }) {
    return (
      <div className="mb-5">
        <p className="px-1 pb-2 text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {t(label)}
        </p>
        {rows.length === 0 ? (
          <p className="px-1 text-[13px] text-muted-foreground">{t("Vazio")}</p>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  onSelect(row);
                  onClose();
                }}
                className={`flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 ${
                  row.id === activeId ? "bg-secondary" : "active:bg-secondary/60"
                }`}
              >
                <Icon className="size-[15px] shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {row.title ?? (row.scope === "quick" ? t("Quick") : t("Conversa"))}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {relativeTime(row.updated_at)}
                  </span>
                </span>
                {row.pinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        aria-label={t("Fechar barra lateral")}
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-background/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className="fixed inset-y-0 left-0 z-[61] w-[82%] max-w-[330px] border-r border-hairline bg-surface/95 backdrop-blur-2xl transition-transform duration-[380ms]"
        style={{
          transform: open ? "translateX(0)" : "translateX(-102%)",
          transitionTimingFunction: "var(--ease-griot)",
        }}
      >
        <div className="flex h-full flex-col px-3 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <div className="flex items-center justify-between px-1 pb-5">
            <span className="text-[17px] font-semibold tracking-tight">{t("Conversas")}</span>
            <button
              onClick={onClose}
              aria-label={t("Fechar")}
              className="grid size-8 place-items-center rounded-full bg-secondary active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Group label="Chat" rows={chats} Icon={MessageCircle} />
            <Group label="Quick" rows={quicks} Icon={Zap} />
          </div>

          <div className="flex gap-2 pt-3">
            <button
              onClick={() => {
                onCreate("main");
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary py-3 text-[13.5px] font-medium text-primary-foreground active:scale-[0.98]"
            >
              <Plus className="size-4" /> {t("Chat")}
            </button>
            <button
              onClick={() => {
                onCreate("quick");
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-hairline py-3 text-[13.5px] font-medium active:scale-[0.98]"
            >
              <Zap className="size-4" /> {t("Quick")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
