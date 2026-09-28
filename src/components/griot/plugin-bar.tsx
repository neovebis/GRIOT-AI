import { Check, Loader2, Plug, X } from "lucide-react";
import { describeArgs, pluginById, type PluginCall } from "@/lib/plugins";
import { useT } from "@/lib/i18n";

export type PluginRequest = PluginCall & {
  connected: boolean;
  state: "asking" | "running" | "done" | "error";
  detail?: string;
};

export function PluginBar({
  request,
  onAllow,
  onDeny,
}: {
  request: PluginRequest;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const t = useT();
  const def = pluginById(request.id);
  if (!def) return null;
  const running = request.state === "running";

  return (
    <div className="rise overflow-hidden rounded-[22px] border border-hairline bg-surface/70 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold tracking-wide">
          {def.short}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">
            {request.connected ? t("Usar") : t("Ligar")} · {t(def.label)}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {describeArgs(request.args) || t(def.purpose)} · {def.vendor}
          </p>
        </div>

        {request.state === "asking" ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={t("Permitir")}
              onClick={onAllow}
              className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"
            >
              <Check className="size-4" />
            </button>
            <button
              aria-label={t("Recusar")}
              onClick={onDeny}
              className="grid size-8 place-items-center rounded-full bg-secondary active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary">
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : request.state === "error" ? (
              <X className="size-4 text-muted-foreground" />
            ) : (
              <Plug className="size-4" />
            )}
          </span>
        )}
      </div>

      {request.detail ? (
        <p className="border-t border-hairline px-4 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {request.detail}
        </p>
      ) : null}
    </div>
  );
}
