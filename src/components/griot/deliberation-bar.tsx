/**
 * GRIOT AI Deliberation Room Bar Component
 * Rendered at the center of Quick Mode in Chat. Pure GRIOT monochrome design.
 */

import { useState } from "react";
import {
  DELIBERATION_MISSIONS,
  DELIBERATION_ROLES,
  type DeliberationMissionId,
  type DeliberationRoleId,
} from "@/lib/runtime/deliberation-room";
import { useT } from "@/lib/i18n";
import { getUserSavedApis } from "@/lib/user-apis";
import { getAiLogo, getModelDisplayName } from "@/components/griot/brand-icons";
import {
  Brain,
  Check,
  ChevronDown,
  FlaskConical,
  Lightbulb,
  Search,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  brain: Brain,
  search: Search,
  lightbulb: Lightbulb,
  shield: Shield,
  swords: Swords,
  wrench: Wrench,
  "trending-up": TrendingUp,
  "flask-conical": FlaskConical,
  target: Target,
};

function RoleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name];
  if (Icon) return <Icon className={className} />;
  return <Brain className={className} />;
}

export interface DeliberationBarProps {
  activeMission: DeliberationMissionId;
  roleEngines: Record<DeliberationRoleId, string>;
  onSelectMission: (mission: DeliberationMissionId) => void;
  onChangeRoleEngine: (role: DeliberationRoleId, engineId: string) => void;
}

const DEFAULT_ENGINES = [
  { id: "gemini:gemini-2.5-flash", label: "Google Gemini 2.5 Flash", short: "Gemini 2.5" },
  { id: "openai:gpt-4o", label: "OpenAI GPT-4o", short: "GPT-4o" },
  { id: "deepseek:deepseek-r1", label: "DeepSeek R1", short: "DeepSeek R1" },
  { id: "claude:claude-3-7-sonnet", label: "Anthropic Claude 3.7", short: "Claude 3.7" },
  { id: "xai:grok-2", label: "xAI Grok 2", short: "Grok 2" },
  { id: "zhipu:glm-4-plus", label: "GLM / Zhipu AI", short: "GLM-4" },
  { id: "xiaomi:mimo-v2", label: "Xiaomi MiMo V2", short: "MiMo-V2" },
  { id: "bedrock:amazon.nova-pro-v1:0", label: "AWS Bedrock Nova", short: "Nova Pro" },
  { id: "azure:gpt-4o", label: "Azure OpenAI", short: "Azure GPT" },
  { id: "cohere:command-r-plus", label: "Cohere Command R+", short: "Command R+" },
  { id: "together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Together AI Llama 3.3", short: "Together" },
  { id: "replicate:meta/meta-llama-3-70b-instruct", label: "Replicate Llama 3", short: "Replicate" },
  { id: "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct", label: "Fireworks AI", short: "Fireworks" },
  { id: "lmstudio:local-model", label: "LM Studio Local", short: "LM Studio" },
  { id: "localai:gpt-4", label: "LocalAI Instance", short: "LocalAI" },
];

export function DeliberationBar({
  activeMission,
  roleEngines,
  onSelectMission,
  onChangeRoleEngine,
}: DeliberationBarProps) {
  const t = useT();
  const [missionOpen, setMissionOpen] = useState(false);
  const [roleSelectOpen, setRoleSelectOpen] = useState<DeliberationRoleId | null>(null);

  const userApis = getUserSavedApis();
  const savedEngines = userApis.map((a) => ({
    id: a.id,
    label: a.label,
    short: a.label.replace(/^Google\s+|^OpenAI\s+|^Anthropic\s+/i, ""),
    providerId: a.providerId,
    model: a.model,
  }));
  const defaultMapped = DEFAULT_ENGINES.map((d) => ({
    ...d,
    providerId: d.id.split(":")[0],
    model: d.id.split(":")[1],
  }));

  const availableEngines = [
    ...savedEngines,
    ...defaultMapped.filter((d) => !savedEngines.some((s) => s.providerId === d.providerId)),
  ];

  const currentMissionObj =
    DELIBERATION_MISSIONS.find((m) => m.id === activeMission) || DELIBERATION_MISSIONS[0];

  return (
    <div className="w-full px-3 py-2.5">
      {/* Top Row: Mission Selector (sem a frase quebrada) */}
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={() => setMissionOpen(!missionOpen)}
          className="flex w-full items-center justify-between rounded-2xl bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-foreground transition-transform active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 truncate">
            <RoleIcon
              name={currentMissionObj.icon}
              className="size-4 text-foreground/80 shrink-0"
            />
            <span className="truncate">{t(currentMissionObj.label)}</span>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </div>

      {/* Mission Modal Selector */}
      {missionOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setMissionOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-card border border-border/50 p-3.5 shadow-2xl rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2.5 border-b border-border/40">
              <p className="text-[13px] font-semibold text-foreground">
                {t("Escolher Missão da Sala")}
              </p>
              <button
                type="button"
                onClick={() => setMissionOpen(false)}
                className="grid size-7 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-2 space-y-1 max-h-[55vh] overflow-y-auto no-scrollbar">
              {DELIBERATION_MISSIONS.map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => {
                    onSelectMission(mission.id);
                    setMissionOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                    activeMission === mission.id
                      ? "bg-white/[0.08] font-medium text-foreground"
                      : "hover:bg-white/[0.04] text-foreground/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RoleIcon name={mission.icon} className="size-4 text-foreground/80 shrink-0" />
                    <div>
                      <p className="font-medium leading-none">{t(mission.label)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
                        {t(mission.description)}
                      </p>
                    </div>
                  </div>
                  {activeMission === mission.id && (
                    <Check className="size-4 text-foreground shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Row: Active 4 Roles Bar */}
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 w-full">
        {(["strategist", "analyst", "innovator", "critic"] as DeliberationRoleId[]).map(
          (roleId, idx) => {
            const role = DELIBERATION_ROLES[roleId];
            const assignedEngine =
              roleEngines[roleId] || availableEngines[idx % availableEngines.length]?.id;
            const engineObj =
              availableEngines.find((e) => e.id === assignedEngine) || availableEngines[0];
            const RoleLogo = getAiLogo(engineObj?.providerId || engineObj?.model || assignedEngine);

            return (
              <button
                key={roleId}
                type="button"
                onClick={() => setRoleSelectOpen(roleId)}
                className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-secondary px-1 py-2 text-center transition-all hover:bg-secondary/80 active:scale-[0.97] group"
              >
                <div className="grid size-6.5 place-items-center rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/10 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                  <RoleLogo className="size-4 text-foreground" />
                </div>
                <span className="mt-1 text-[10px] font-semibold text-foreground truncate w-full px-0.5">
                  {role.label}
                </span>
                <span className="mt-0.5 text-[8.5px] text-muted-foreground/80 truncate w-full px-0.5 font-mono">
                  {engineObj?.short || "Gemini"}
                </span>
              </button>
            );
          },
        )}
      </div>

      {/* Role Engine Selector Centered Modal */}
      {roleSelectOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setRoleSelectOpen(null)}
        >
          <div
            className="w-full max-w-xs overflow-hidden rounded-3xl bg-card border border-border/50 p-3.5 shadow-2xl rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                {(() => {
                  const currentEngine = roleEngines[roleSelectOpen] || availableEngines[0]?.id;
                  const currentObj = availableEngines.find((e) => e.id === currentEngine);
                  const HeaderLogo = getAiLogo(currentObj?.providerId || currentObj?.model || currentEngine);
                  return (
                    <div className="grid size-6 place-items-center rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
                      <HeaderLogo className="size-4 text-foreground" />
                    </div>
                  );
                })()}
                <p className="text-[13px] font-semibold text-foreground">
                  {DELIBERATION_ROLES[roleSelectOpen].label}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                Motor IA
              </span>
            </div>

            <div className="mt-2 space-y-1 max-h-[45vh] overflow-y-auto no-scrollbar">
              {availableEngines.map((opt) => {
                const currentEngine = roleEngines[roleSelectOpen] || availableEngines[0]?.id;
                const isSelected = currentEngine === opt.id;
                const EngineLogo = getAiLogo(opt.providerId || opt.model || opt.id);

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChangeRoleEngine(roleSelectOpen, opt.id);
                      setRoleSelectOpen(null);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                      isSelected
                        ? "bg-secondary text-foreground font-medium"
                        : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="grid size-5.5 place-items-center rounded-lg bg-black/[0.04] dark:bg-white/[0.06] shrink-0">
                        <EngineLogo className="size-3.5 text-foreground" />
                      </div>
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {isSelected && <Check className="size-3.5 text-foreground shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setRoleSelectOpen(null)}
              className="mt-3 w-full rounded-xl bg-secondary py-2 text-center text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-transform"
            >
              {t("Fechar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
