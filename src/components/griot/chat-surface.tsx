import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MODEL, getAvailableModels, modelLabel, isModelOS, isSheolModel } from "@/lib/griot";
import { getUserSavedApis } from "@/lib/user-apis";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";
import { resolveProviderAndModel, getSavedApiKey } from "@/lib/ai-client";
import { AddApiModal } from "@/components/griot/add-api-modal";
import { toast } from "sonner";
import { Thinking } from "@/components/griot/thinking";
import { UserActions, AssistantActions } from "@/components/griot/message-actions";
import { ChatMessageItem } from "./chat-message-item";
import { MarkdownContent } from "./markdown-content";
import { PreviewBar, FunctionalPreviewModal } from "./preview-bar";
import { ConversationDrawer, type Conversation } from "@/components/griot/chat-drawers";
import { labelFromLocale, useI18n, useT } from "@/lib/i18n";
import { VoiceSession } from "@/lib/voice-session";
import { transcribeAudioElite, resolveSpeechLanguage } from "@/lib/speech-transcriber";
import { loadPrefs, type Prefs } from "@/lib/settings";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { CapsulePanel } from "@/components/griot/capsule-panel";
import { useServerFn } from "@tanstack/react-start";
import {
  parseProposals,
  stripPartialBlock,
  type DecisionProposal,
  type EntityProposal,
} from "@/lib/capsule-proposals";
import { previewContext, proposeDecision, upsertEntity } from "@/lib/capsule.functions";
import { PluginBar, type PluginRequest } from "@/components/griot/plugin-bar";
import type { PluginId } from "@/lib/plugins";
import {
  PLUGINS,
  connectedPlugins,
  parsePluginCalls,
  pluginById,
  setPluginConnected,
  stripPartialPlugin,
} from "@/lib/plugins";
import { observerEngine, stripActionBlocks } from "@/lib/runtime";
import { executeReActLoop } from "@/lib/runtime/react-loop";
import {
  chatExecutionManager,
  type ExecutionPhase,
  type ExecutionStepItem,
} from "@/lib/chat-execution-manager";
import { DeliberationBar } from "@/components/griot/deliberation-bar";
import { fetchUserGcuWallet, checkGcuAllowance, canUseSheol, markSheolTrialUsed } from "@/lib/gcu-service";
import {
  DELIBERATION_MISSIONS,
  DELIBERATION_ROLES,
  buildRoleSystemInstruction,
  type DeliberationMissionId,
  type DeliberationRoleId,
  type GriotVerdict,
} from "@/lib/runtime/deliberation-room";
import { getWorkspaceFiles, type WorkspaceFile } from "@/lib/runtime/local-harness";
import {
  getUnifiedProjects,
  getActiveProjectSync,
  setActiveProject,
  type GriotProject,
} from "@/lib/project-service";
import { processFileAttachment, isImageFile, isZipFile } from "@/lib/file-attachment-processor";
import { GRIOT_CHART_SYSTEM_PROMPT } from "@/lib/chart-system-prompt";

import {
  ArrowUp,
  AudioLines,
  Mic,
  Camera,
  ImageIcon,
  Paperclip,
  Puzzle,
  Plus,
  Loader2,
  Square,
  Check,
  X,
  ChevronDown,
  Share2,
  Pin,
  FolderPlus,
  Archive,
  Trash2,
  ChevronLeft,
  Play,
  Terminal,
  CloudLightning,
  Menu,
  MoreVertical,
  Folder,
  Brain,
  ShieldAlert,
  BarChart2,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import {
  getAiLogo,
  getModelDisplayName,
  GriotAiLogo,
  GeminiAiLogo,
  OpenAiLogo,
  DeepSeekAiLogo,
  ClaudeAiLogo,
} from "@/components/griot/brand-icons";
import { runQuickDeliberation } from "@/lib/runtime/quick-deliberation-engine";
import type { MessageReaction } from "@/lib/chat-execution-manager";
import { PluginsView } from "@/components/griot/plugins-view";
import { AutonomousTaskModal } from "@/components/griot/autonomous-task-modal";

import {
  captureAsText,
  captureTitle,
  exactDateTime,
  listQuickCaptures,
  captureUrl,
  type CaptureRow,
} from "@/lib/capture-share";
import { getStoredCaptures, saveCapture } from "@/lib/capture-service";
import { getCurrentWorkspaceId } from "@/lib/workspace";

type Row = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  feedback?: "like" | "dislike" | null;
  model?: string;
  reasoning?: string;
  steps?: number;
  stepsList?: ExecutionStepItem[];
  reactions?: MessageReaction[];
  metadata?: Record<string, any>;
};

type PendingAttachment = {
  id: string;
  name: string;
  size: number;
  kind: "image" | "zip" | "file";
  processing: boolean;
  textToSend: string;
  error?: boolean;
};

const EFFORTS = [
  { id: "low", label: "Rápido", hint: "Respostas curtas e imediatas" },
  { id: "medium", label: "Equilibrado", hint: "O padrão do GRIOT" },
  { id: "high", label: "Profundo", hint: "Mais tempo a pensar" },
] as const;

type Effort = (typeof EFFORTS)[number]["id"];
type Sheet = null | "plus" | "model" | "actions" | "projects" | "captures";

/** Vozes das Definições → vozes reais de síntese. */
const TTS_VOICES: Record<string, string> = {
  "GRIOT Nativa": "alloy",
  Serena: "nova",
  Grave: "onyx",
  Neutra: "fable",
};

const SPEECH_SPEEDS: Record<string, number> = {
  "0.8×": 0.85,
  "1.0×": 1.0,
  "1.2×": 1.2,
  "1.5×": 1.45,
};

function triggerHaptic(type: "light" | "medium" | "heavy" | "selection" = "light") {
  try {
    const prefs = loadPrefs();
    if (prefs["haptics"] === false) return;
    if (type === "selection") {
      void Haptics.selectionChanged().catch(() => undefined);
    } else {
      const style =
        type === "heavy"
          ? ImpactStyle.Heavy
          : type === "medium"
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      void Haptics.impact({ style }).catch(() => undefined);
    }
  } catch {}
}

function generatePreviewSrcDoc(files: WorkspaceFile[]): string {
  const htmlFile =
    files.find((f) => f.path.endsWith(".html") || f.path === "index.html") || files[0];
  if (!htmlFile) {
    return "<!DOCTYPE html><html><body style='font-family:sans-serif;padding:20px;color:#888;'><h3>Nenhum ficheiro HTML no workspace.</h3></body></html>";
  }
  let doc = htmlFile.content;
  for (const f of files) {
    if (f.path.endsWith(".css")) {
      if (doc.includes("</head>")) {
        doc = doc.replace("</head>", `<style>${f.content}</style></head>`);
      } else {
        doc = `<style>${f.content}</style>` + doc;
      }
    }
    if (f.path.endsWith(".js") && !f.path.endsWith(".test.js")) {
      if (doc.includes("</body>")) {
        doc = doc.replace("</body>", `<script>${f.content}</script></body>`);
      } else {
        doc = doc + `<script>${f.content}</script>`;
      }
    }
  }
  return doc;
}

interface QuickPersonaSegment {
  roleRaw: string;
  content: string;
}

function parseQuickSegments(raw: string): QuickPersonaSegment[] {
  const personaRegex =
    /(?:^|\n)\s*(?:\*{1,2}|\[)?\s*(Estrategista|Crítico|Critico|Analista|Inovador|Sintetizador|Veredito|Strategist|Critic|Analyst|Innovator)\s*(?:\*{1,2}|\])?\s*:\s*(?:\*{1,2})?\s*/gi;
  const matches = [...raw.matchAll(personaRegex)];
  if (matches.length === 0) {
    return [];
  }
  const segments: QuickPersonaSegment[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const startIndex = cur.index + cur[0].length;
    const endIndex = next ? next.index : raw.length;
    const content = raw.substring(startIndex, endIndex).trim();
    const roleRaw = cur[1];
    if (content.length > 0) {
      segments.push({ roleRaw, content });
    }
  }
  return segments;
}

interface QuickPersonaConfig {
  name: string;
  badge: string;
  avatarBg: string;
  icon: React.ReactNode;
}

function getPersonaConfig(roleRaw: string): QuickPersonaConfig {
  const r = roleRaw.toLowerCase();
  if (r.includes("estrateg") || r.includes("strateg")) {
    return {
      name: "O Estrategista",
      badge: "Visão & Produto",
      avatarBg: "bg-blue-500/15 border-blue-500/30 text-blue-500",
      icon: <GeminiAiLogo className="size-4.5 text-foreground" />,
    };
  }
  if (r.includes("crític") || r.includes("critic")) {
    return {
      name: "O Crítico",
      badge: "Desafios & Riscos",
      avatarBg: "bg-rose-500/15 border-rose-500/30 text-rose-500",
      icon: <DeepSeekAiLogo className="size-4.5 text-foreground" />,
    };
  }
  if (r.includes("analist") || r.includes("analyst")) {
    return {
      name: "O Analista",
      badge: "Técnica & Métricas",
      avatarBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-500",
      icon: <OpenAiLogo className="size-4.5 text-foreground" />,
    };
  }
  if (r.includes("inovad") || r.includes("innovat")) {
    return {
      name: "O Inovador",
      badge: "Diferenciação & Ideias",
      avatarBg: "bg-purple-500/15 border-purple-500/30 text-purple-500",
      icon: <ClaudeAiLogo className="size-4.5 text-foreground" />,
    };
  }
  if (r.includes("vered") || r.includes("sintet")) {
    return {
      name: "Veredito da Sala",
      badge: "Conclusão Final",
      avatarBg: "bg-amber-500/15 border-amber-500/30 text-amber-500",
      icon: <GriotAiLogo className="size-4.5 text-foreground" />,
    };
  }
  return {
    name: "GRIOT Deliberation",
    badge: "Orquestrador",
    avatarBg: "bg-secondary border-hairline text-foreground",
    icon: <GriotAiLogo className="size-4.5 text-foreground" />,
  };
}

function saveConversationLocally(conv: Conversation) {
  if (typeof window === "undefined" || !conv?.id) return;
  try {
    const raw = localStorage.getItem("griot_conversations_v1");
    const list: Conversation[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex((c) => c.id === conv.id);
    const scopeKey = conv.scope === "quick" ? "quick" : "main";
    const normalizedConv = { ...conv, scope: scopeKey, updated_at: new Date().toISOString() };
    if (index >= 0) {
      list[index] = { ...list[index], ...normalizedConv };
    } else {
      list.unshift(normalizedConv);
    }
    localStorage.setItem("griot_conversations_v1", JSON.stringify(list));
    localStorage.setItem("griot_active_" + scopeKey + "_conv_id", conv.id);
    window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
  } catch {}
}

export function ChatSurface({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const t = useT();
  const { locale } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [scope, setScope] = useState<"main" | "quick">("main");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const conversationId = conversation?.id ?? null;
  const [messages, setMessages] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [steps, setSteps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>("thinking");
  const [actionDetail, setActionDetail] = useState("");
  const [executionStepsList, setExecutionStepsList] = useState<ExecutionStepItem[]>([]);
  const [model, setModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("griot-default-model");
      if (stored && stored !== "modelos" && stored !== "model-os") return stored;
    }
    return DEFAULT_MODEL;
  });
  const [effort, setEffort] = useState<Effort>("medium");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pluginsViewOpen, setPluginsViewOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const [projects, setProjects] = useState<GriotProject[]>([]);
  const [activeProject, setActiveProjectState] = useState<GriotProject | null>(() =>
    getActiveProjectSync(),
  );
  const [autonomousTaskModalOpen, setAutonomousTaskModalOpen] = useState(false);
  const [autonomousTaskInstruction, setAutonomousTaskInstruction] = useState("");
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [deliberationMission, setDeliberationMission] = useState<DeliberationMissionId>("ideate");
  const [quickRoomDrawerOpen, setQuickRoomDrawerOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);

  // As reações são emitidas apenas pelas IAs no Quick; o utilizador não reage.

  const [roleEngines, setRoleEngines] = useState<Record<DeliberationRoleId, string>>(() => {
    const saved = getUserSavedApis();
    if (saved.length > 0) {
      return {
        strategist: saved[0]?.id || "gemini",
        analyst: saved[1]?.id || saved[0]?.id || "gemini",
        innovator: saved[2]?.id || saved[0]?.id || "gemini",
        critic: saved[0]?.id || "gemini",
      };
    }
    return {
      strategist: "gemini",
      analyst: "gemini",
      innovator: "gemini",
      critic: "gemini",
    };
  });
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 22 }, () => 0.12));
  const [seconds, setSeconds] = useState(0);
  const [voiceChat, setVoiceChat] = useState(false);
  const [voiceState, setVoiceState] = useState<"listening" | "thinking" | "speaking">("listening");
  const [voiceText, setVoiceText] = useState("");
  const [voiceDraft, setVoiceDraft] = useState("");

  const [apisRevision, setApisRevision] = useState(0);
  const availableModels = useMemo(() => getAvailableModels(prefs), [prefs, apisRevision]);
  const [addApiModalOpen, setAddApiModalOpen] = useState(false);

  // Integração com Local Workspace e Google Cloud Shell
  const [cloudShellRequired, setCloudShellRequired] = useState(false);
  const [cloudShellCmd, setCloudShellCmd] = useState("");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);

  useEffect(() => {
    const wsId = conversation?.id || "default";
    setWorkspaceFiles(getWorkspaceFiles(wsId));

    const onCloudShellRequired = (e: any) => {
      setCloudShellRequired(true);
      setCloudShellCmd(e.detail?.action?.params?.command || "");
    };
    const onFilesUpdated = () => {
      setWorkspaceFiles(getWorkspaceFiles(wsId));
    };

    window.addEventListener("griot:cloudshell-required", onCloudShellRequired);
    window.addEventListener("griot:workspace-files-updated", onFilesUpdated);
    return () => {
      window.removeEventListener("griot:cloudshell-required", onCloudShellRequired);
      window.removeEventListener("griot:workspace-files-updated", onFilesUpdated);
    };
  }, [conversation?.id]);

  const handleConnectGoogleCloud = async () => {
    setConnectingGoogle(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.href : undefined,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
          scopes:
            "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email",
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("Erro ao ligar ao Google Cloud."));
    } finally {
      setConnectingGoogle(false);
    }
  };

  useEffect(() => {
    const handlePrefsChange = () => setPrefs(loadPrefs());
    const handleApisUpdate = () => setApisRevision((v) => v + 1);
    window.addEventListener("storage", handlePrefsChange);
    window.addEventListener("griot:prefs-changed", handlePrefsChange);
    window.addEventListener("focus", handlePrefsChange);
    window.addEventListener("griot-apis-updated", handleApisUpdate);
    return () => {
      window.removeEventListener("storage", handlePrefsChange);
      window.removeEventListener("griot:prefs-changed", handlePrefsChange);
      window.removeEventListener("focus", handlePrefsChange);
      window.removeEventListener("griot-apis-updated", handleApisUpdate);
    };
  }, []);

  // Seleciona a primeira API adicionada se o modelo selecionado não for válido
  useEffect(() => {
    if (availableModels.length > 0) {
      if (
        !model ||
        model === "modelos" ||
        model === "model-os" ||
        !availableModels.some((m) => m.id === model)
      ) {
        setModel(availableModels[0].id);
      }
    } else if (!model || model === "modelos" || model === "model-os") {
      setModel("gemini");
    }
  }, [availableModels, model]);

  useEffect(() => {
    (window as any).griotHandleBackButton = () => {
      if (sheet) {
        setSheet(null);
        return true;
      }
      if (drawer) {
        setDrawer(false);
        return true;
      }
      void navigate({ to: "/home" });
      return true;
    };
    return () => {
      delete (window as any).griotHandleBackButton;
    };
  }, [sheet, drawer, navigate]);

  const [drag, setDrag] = useState(0);
  const [capsuleId, setCapsuleId] = useState<string | null>(null);
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const [proposals, setProposals] = useState<(DecisionProposal | EntityProposal)[]>([]);
  const [plugin, setPlugin] = useState<PluginRequest | null>(null);
  const pluginBase = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  const compileContext = useServerFn(previewContext);
  const addDecision = useServerFn(proposeDecision);
  const addEntity = useServerFn(upsertEntity);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendLockRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);
  const dragMeta = useRef({ last: 0, time: 0, velocity: 0, active: false });
  const frame = useRef<number | null>(null);

  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);
  const dictationStreamRef = useRef<MediaStream | null>(null);
  const lastAnswerRef = useRef("");
  const lastVoiceSpokenIndexRef = useRef(0);
  const sessionRef = useRef<VoiceSession | null>(null);
  // Callbacks da sessão de voz vivem para lá de um render: estes refs garantem
  // que cada turno usa o histórico e as funções mais recentes.
  const messagesRef = useRef<Row[]>([]);
  messagesRef.current = messages;
  const conversationRef = useRef<Conversation | null>(null);
  conversationRef.current = conversation;
  const scopeRef = useRef<"main" | "quick">(scope);
  scopeRef.current = scope;
  const sendRef = useRef<typeof send | null>(null);
  const runRef = useRef<typeof run | null>(null);

  const audioRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    analyser: AnalyserNode;
    raf: number;
  } | null>(null);

  async function startMeter() {
    if (audioRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = 22;
      const meter = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / bars);
        const next: number[] = [];
        for (let index = 0; index < bars; index += 1) {
          let sum = 0;
          for (let offset = 0; offset < step; offset += 1) sum += data[index * step + offset] ?? 0;
          const value = sum / step / 255;
          next.push(Math.min(1, 0.1 + Math.pow(value, 0.65) * 1.6));
        }
        setLevels(next);
        if (audioRef.current) audioRef.current.raf = requestAnimationFrame(meter);
      };
      audioRef.current = { ctx, stream, analyser, raf: 0 };
      audioRef.current.raf = requestAnimationFrame(meter);
    } catch {
      // sem acesso ao microfone: mantém as barras em repouso
    }
  }

  function stopMeter() {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    cancelAnimationFrame(audio.raf);
    audio.stream.getTracks().forEach((track) => track.stop());
    void audio.ctx.close();
    setLevels(Array.from({ length: 22 }, () => 0.12));
  }

  useEffect(() => () => stopMeter(), []);

  // Watchdog de segurança de 1 hora para garantir que a UI não fica travada indefinidamente caso ocorra falha irrecuperável
  useEffect(() => {
    if (!busy) return;
    const safetyTimer = setTimeout(() => {
      console.warn(
        "[ChatSurface] Emergency UI watchdog: busy permaneceu ativo por 1h. Forçando desbloqueio da interface.",
      );
      setBusy(false);
      setStreaming("");
      setReasoning("");
      setSteps(0);
      setExecutionStepsList([]);
    }, 3600000);
    return () => clearTimeout(safetyTimer);
  }, [busy]);

  // Redimensionamento dinâmico síncrono da barra de texto (cresce suavemente até ~160px como o ChatGPT)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 24), 160);
    el.style.height = `${nextHeight}px`;
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // 1. Tenta carregar do localStorage a conversa activa do escopo padrão ("main")
      let localConv: Conversation | null = null;
      if (typeof window !== "undefined") {
        try {
          const activeId = localStorage.getItem("griot_active_main_conv_id");
          const raw = localStorage.getItem("griot_conversations_v1");
          if (raw) {
            const list: Conversation[] = JSON.parse(raw);
            if (activeId) {
              localConv =
                list.find(
                  (c) => c.id === activeId && !c.archived && (c.scope || "main") === "main",
                ) || null;
            }
            if (!localConv) {
              localConv = list.find((c) => (c.scope || "main") === "main" && !c.archived) || null;
            }
          }
        } catch {}
      }

      if (localConv) {
        if (!cancelled) {
          setConversation(localConv);
          setModel(localConv.model || DEFAULT_MODEL);
        }
        return;
      }

      // 2. Se não encontrou no local, busca do Supabase
      try {
        const { data: existing } = await (supabase as any)
          .from("griot_conversations")
          .select("id, title, updated_at")
          .order("updated_at", { ascending: false })
          .limit(15);

        let matched: Conversation | null = null;
        if (existing && existing.length > 0) {
          let localMap: Record<string, any> = {};
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("griot_conversations_v1");
              if (raw) {
                for (const item of JSON.parse(raw)) {
                  if (item?.id) localMap[item.id] = item;
                }
              }
            } catch {}
          }
          const candidate = existing.find((c: any) => {
            const loc = localMap[c.id];
            const itemScope = loc?.scope || "main";
            return itemScope === "main" && !loc?.archived;
          });
          if (candidate) {
            matched = {
              id: candidate.id,
              scope: "main",
              title: candidate.title || "Conversa Principal",
              model: DEFAULT_MODEL,
              pinned: false,
              archived: false,
              updated_at: candidate.updated_at,
            };
          }
        }

        if (matched) {
          if (!cancelled) {
            setConversation(matched);
            setModel(matched.model || DEFAULT_MODEL);
            saveConversationLocally(matched);
          }
          return;
        }

        if (!cancelled) {
          await newConversation("main");
        }
      } catch {
        if (!cancelled) {
          await newConversation("main");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setBusy(false);
      setStreaming("");
      setReasoning("");
      setSteps(0);
      setExecutionStepsList([]);
      return;
    }
    let cancelled = false;

    // 1. Conecta o estado de execução em tempo real da conversa ativa
    const unsub = chatExecutionManager.subscribe(conversationId, (execState) => {
      setBusy(execState.busy);
      setStreaming(execState.streaming);
      setReasoning(execState.reasoning);
      setSteps(execState.steps);
      setExecutionPhase(execState.currentPhase || "thinking");
      setActionDetail(execState.currentActionDetail || "");
      setExecutionStepsList(execState.stepsList || []);

      // Transmissão de voz fluida em tempo real para a sessão de voz ativa do GRIOT
      if (sessionRef.current && sessionRef.current.active) {
        if (execState.streaming) {
          const delta = execState.streaming.slice(lastVoiceSpokenIndexRef.current);
          if (delta) {
            lastVoiceSpokenIndexRef.current = execState.streaming.length;
            sessionRef.current.feed(delta);
          }
        }
        if (!execState.busy && (lastVoiceSpokenIndexRef.current > 0 || sessionRef.current.state === "thinking")) {
          lastVoiceSpokenIndexRef.current = 0;
          sessionRef.current.finish();
        }
      }

      if (execState.approvalRequest) {
        setPlugin({
          id: execState.approvalRequest.pluginId as PluginId,
          args: execState.approvalRequest.action?.params || {},
          raw: execState.approvalRequest.pluginName || "",
          connected: true,
          state: "asking",
          detail: `Operação: ${execState.approvalRequest.operation}`,
        });
      } else if (!execState.busy) {
        setPlugin(null);
      }

      if (!execState.busy && typeof window !== "undefined") {
        try {
          const rawStored = localStorage.getItem("griot_messages_" + conversationId);
          if (rawStored) {
            const parsed = JSON.parse(rawStored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed);
            }
          }
        } catch {}
      }
    });

    // 2. Cache local imediato para carregar mensagens instantaneamente
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("griot_messages_" + conversationId);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setMessages(parsed);
          else setMessages([]);
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      }
    }

    // 3. Ouve eventos de mensagens salvas localmente para atualizar a lista instantaneamente
    const handleMessageSaved = (e: any) => {
      const detail = e.detail;
      if (!detail || detail.conversationId === conversationId) {
        try {
          const raw = localStorage.getItem("griot_messages_" + conversationId);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              setMessages(list);
            }
          }
        } catch {}
      }
    };

    window.addEventListener("griot_message_saved", handleMessageSaved);

    // 4. Sincronização remota via Supabase com merge não-destrutivo e deduplicação semântica
    void (supabase as any)
      .from("griot_messages")
      .select("id, actor_kind, content, created_at, metadata")
      .eq("conversation_id", conversationId)
      .order("created_at")
      .then(({ data }: any) => {
        if (!cancelled && data && Array.isArray(data)) {
          const remoteRows: Row[] = data.map((m: any) => ({
            id: m.id,
            role: (m.actor_kind === "human"
              ? "user"
              : m.actor_kind === "model"
                ? "assistant"
                : "system") as "user" | "assistant" | "system",
            content: m.content,
            created_at: m.created_at,
            feedback: (m.metadata?.feedback as "like" | "dislike" | null) ?? null,
            metadata: m.metadata,
            reactions: (m.metadata?.reactions as MessageReaction[] | undefined) ?? undefined,
          }));

          setMessages((currentList) => {
            let diskList: Row[] = [];
            if (typeof window !== "undefined") {
              try {
                const rawStorage = localStorage.getItem("griot_messages_" + conversationId);
                if (rawStorage) diskList = JSON.parse(rawStorage);
              } catch {}
            }
            const localBase = diskList.length >= currentList.length ? diskList : currentList;

            // Merge inteligente: indexação por ID + reconciliação semântica temporal
            const mergedMap = new Map<string, Row>();
            for (const item of localBase) {
              mergedMap.set(item.id, item);
            }

            for (const remote of remoteRows) {
              if (mergedMap.has(remote.id)) {
                // Mensagem já existe por ID exato: preserva feedback local se houver
                const existing = mergedMap.get(remote.id)!;
                mergedMap.set(remote.id, {
                  ...remote,
                  feedback: existing.feedback ?? remote.feedback,
                });
                continue;
              }

              // Deduplicação por fingerprint: verifica se já existe mensagem local com mesmo papel, conteúdo idêntico e timestamp próximo (< 60s)
              let matchedLocalId: string | null = null;
              const remoteTime = new Date(remote.created_at).getTime();
              for (const [id, localItem] of mergedMap.entries()) {
                if (
                  localItem.role === remote.role &&
                  localItem.content.trim() === remote.content.trim()
                ) {
                  const localTime = new Date(localItem.created_at).getTime();
                  if (Math.abs(localTime - remoteTime) < 60000) {
                    matchedLocalId = id;
                    break;
                  }
                }
              }

              if (matchedLocalId) {
                // Reconcilia o ID local com o ID do Supabase sem duplicar
                const existing = mergedMap.get(matchedLocalId)!;
                mergedMap.delete(matchedLocalId);
                mergedMap.set(remote.id, { ...existing, id: remote.id });
              } else {
                mergedMap.set(remote.id, remote);
              }
            }

            const finalList = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );

            if (typeof window !== "undefined" && finalList.length > 0) {
              try {
                localStorage.setItem("griot_messages_" + conversationId, JSON.stringify(finalList));
              } catch {}
            }

            return finalList;
          });
        }
      });

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener("griot_message_saved", handleMessageSaved);
    };
  }, [conversationId]);

  // Escuta streaming de app externa vinculada caso chegue via Observer Nativo (Android/Accessibility)
  useEffect(() => {
    const handleNativeChunk = (e: any) => {
      const detail = e.detail;
      if (detail?.text && busy) {
        setStreaming(detail.text);
      }
    };
    window.addEventListener("griot:app-stream-chunk", handleNativeChunk);
    return () => window.removeEventListener("griot:app-stream-chunk", handleNativeChunk);
  }, [busy]);

  // A Cápsula vive por conversa e só no Chat (não no Quick).
  useEffect(() => {
    if (!conversationId || scope !== "main") {
      setCapsuleId(null);
      setCapsuleOpen(false);
      setProposals([]);
      return;
    }
    let cancelled = false;
    setProposals([]);
    setCapsuleId(null);
    return () => {
      cancelled = true;
    };
  }, [conversationId, scope]);

  /** Aprovar uma proposta escreve-a no Canon / nas entidades da Cápsula. */
  async function approve(proposal: DecisionProposal | EntityProposal) {
    if (!capsuleId) return;
    try {
      if ("title" in proposal) {
        await addDecision({
          data: {
            capsuleId,
            title: proposal.title,
            ...(proposal.description ? { description: proposal.description } : {}),
            ...(proposal.section ? { section: proposal.section } : {}),
            proposedBy: "user" as const,
            autoApprove: true,
            idempotencyKey: `${conversationId}-${proposal.key}`,
          },
        });
      } else {
        await addEntity({
          data: {
            capsuleId,
            name: proposal.name,
            entityType: proposal.entity_type,
            ...(proposal.description ? { description: proposal.description } : {}),
          },
        });
      }
      setProposals((current) => current.filter((row) => row.key !== proposal.key));
      toast.success(t("Cápsula atualizada."));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  // Continuidade: qualquer mensagem escrita noutro dispositivo aparece aqui.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Row;
          setMessages((current) =>
            current.some((m) => m.id === row.id) ? current : [...current, row],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    let cancelled = false;
    async function fetchProjects() {
      try {
        const unified = await getUnifiedProjects();
        if (cancelled) return;
        setProjects(unified);
        const active = getActiveProjectSync();
        setActiveProjectState(active);
      } catch (err) {
        console.warn("Falha ao carregar projetos no Chat:", err);
      }
    }
    void fetchProjects();

    const onProjectChanged = () => {
      const active = getActiveProjectSync();
      setActiveProjectState(active);
    };
    window.addEventListener("griot-active-project-changed", onProjectChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("griot-active-project-changed", onProjectChanged);
    };
  }, [sheet]);

  // Capture no “+”: primeiro as marcadas como rápidas, depois as mais recentes.
  useEffect(() => {
    if (sheet !== "captures") return;
    void getStoredCaptures().then((stored) => {
      const rows = (stored ?? []) as unknown as CaptureRow[];
      const quick = listQuickCaptures();
      setCaptures(
        [...rows].sort((a, b) => {
          const rank = (id: string) => {
            const index = quick.indexOf(id);
            return index === -1 ? 999 : index;
          };
          return rank(a.id) - rank(b.id);
        }),
      );
    });
  }, [sheet]);

  async function sendCapture(capture: CaptureRow) {
    if (!conversationId) return;
    const content = await captureAsText(capture);
    void send(content);
    toast.success(t("Captura adicionada à conversa."));
    setSheet(null);
  }

  const empty = messages.length === 0 && !streaming && !reasoning;
  const adMessageIds = useMemo(() => {
    let completedAssistantReplies = 0;
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.role !== "assistant" || !message.content.trim()) continue;
      completedAssistantReplies += 1;
      if (completedAssistantReplies % 2 === 0) ids.add(message.id);
    }
    return ids;
  }, [messages]);

  const history = useMemo(
    () => messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    [messages],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleStop = useCallback(() => {
    if (conversationId) {
      chatExecutionManager.stopExecution(conversationId);
    }
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
      abortRef.current = null;
    }
    setBusy(false);
    setStreaming("");
    setReasoning("");
    setSteps(0);
  }, [conversationId]);

  async function run(
    base: { role: "user" | "assistant"; content: string }[],
    options?: { effort?: Effort; voice?: boolean },
  ) {
    if (!conversationId) return;
    const activeEffort = options?.effort ?? effort;
    const voiceMode = options?.voice === true;

    // Identificar o projeto associado à conversa ou o projeto ativo global
    const currentProject = projects.find((p) => p.id === conversation?.project_id) || activeProject;

    console.log("[GRIOT_DEBUG] handleSend iniciado", {
      conversationId,
      hasProject: !!currentProject,
      isFast: activeEffort === "low",
    });

    // 1. Verificação prévia de chave no ambiente móvel para evitar congelamentos
    const activeModel = model;
    const { provider, specificApiKey } = resolveProviderAndModel(activeModel);
    const effectiveKey = specificApiKey || getSavedApiKey(provider) || getSavedApiKey("gemini");
    const isNativeApp =
      typeof window !== "undefined" &&
      (window.location.protocol === "capacitor:" ||
        Boolean((window as any).Capacitor?.isNativePlatform?.()));

    const hasAuthSession = Boolean(userId && userId !== "anonymous");

    if (!effectiveKey && isNativeApp && !hasAuthSession) {
      setBusy(false);
      setStreaming("");
      const needKeyMsg: Row = {
        id: `asst-key-${Date.now()}`,
        role: "assistant",
        content: `👋 **Olá! Para conversares com o GRIOT, precisas de ligar uma chave de API.**\n\nA forma mais rápida e gratuita é utilizar a chave do **Google Gemini**:\n\n1. Obtém a tua chave gratuita no [Google AI Studio](https://aistudio.google.com/apikey).\n2. Insere a chave na janela que se abriu (ou acede a **Definições → Chave Google Gemini**).\n\nAssim que inserires a tua chave, todas as tuas conversas, deliberação no modo Quick e os agentes funcionarão em tempo real!`,
        created_at: new Date().toISOString(),
        feedback: null,
      };
      setMessages((current) => {
        const updated = [...current, needKeyMsg];
        if (typeof window !== "undefined" && conversationId) {
          try {
            localStorage.setItem("griot_messages_" + conversationId, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });
      setAddApiModalOpen(true);
      return;
    }

    // 2. Verificação rigorosa do Saldo de GCU no Supabase (bloqueia BASE e SHEOL quando atinge 0 GCU)
    const userWallet = await fetchUserGcuWallet(userId);
    const allowance = checkGcuAllowance(userWallet, 1);
    if (!allowance.allowed) {
      setBusy(false);
      setStreaming("");
      toast.error(t(allowance.reason || "Saldo de GCU esgotado (0 GCU)."));
      const limitMsg: Row = {
        id: `asst-gcu-${Date.now()}`,
        role: "assistant",
        content: `⚠️ **Limite de GCU Atingido (0 GCU)**\n\n${allowance.reason || "Esgotaste o teu saldo de computação GCU."}\n\nO acesso aos modos **BASE** e **SHEOL** está temporariamente suspenso.\n\n👉 Acede a **Planos & GCU** para carregar a tua carteira ou assinar um plano.`,
        created_at: new Date().toISOString(),
        feedback: null,
      };
      setMessages((current) => {
        const updated = [...current, limitMsg];
        if (typeof window !== "undefined" && conversationId) {
          try {
            localStorage.setItem("griot_messages_" + conversationId, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });
      return;
    }

    if (isSheolModel(activeModel)) {
      markSheolTrialUsed(userId);
    }

    const targetConvId = conversationId;
    const targetScope = scope;

    setBusy(true);
    setStreaming("");
    setReasoning("");
    setSteps(0);

    // No modo rápido e em voz não há compilação de contexto: o objetivo é latência mínima.
    let context: string | undefined;
    const isMobileNative =
      typeof window !== "undefined" &&
      (window.location.protocol === "capacitor:" ||
        window.location.hostname === "localhost" ||
        Boolean((window as any).Capacitor?.isNativePlatform?.()));

    if (capsuleId && !voiceMode && activeEffort !== "low" && !isMobileNative) {
      console.log("[GRIOT_DEBUG] antes de Kt (capsule search)");
      try {
        const compiled = await Promise.race([
          compileContext({
            data: { capsuleId, query: base[base.length - 1]?.content?.slice(0, 500) ?? "" },
          }),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500)),
        ]);
        context = (compiled as any)?.text;
        console.log("[GRIOT_DEBUG] depois de Kt", { sucesso: true, resultado: context });
      } catch (ktErr) {
        context = undefined;
        console.log("[GRIOT_DEBUG] depois de Kt", { sucesso: false, resultado: undefined });
      }
    }

    let sysInstruction =
      "És o GRIOT, o assistente de engenharia de software e inteligência artificial de elite. Quando precisares de inspecionar ou modificar ficheiros ou executar comandos, utiliza as ferramentas disponíveis.\n\n[INSTRUÇÃO CRÍTICA DE FICHEIROS E ANEXOS]\nQuando o utilizador anexar ficheiros ou arquivos compactados (.zip, .sha256, .md5, scripts, códigos, logs, dados), o conteúdo e a estrutura completa deles são fornecidos diretamente na conversa sob os blocos [Ficheiro Anexado: ...] ou [Arquivo ZIP Descompactado: ...].\nNUNCA digas que não consegues aceder a ficheiros anexados ou que és um modelo de linguagem sem acesso a ficheiros. Analisa imediatamente os ficheiros fornecidos, verifica checksums, inspeciona código e responde com precisão técnica!";

    if (currentProject) {
      sysInstruction += `\n\n[PROJETO ATIVO GRIOT]
Nome do Projeto: ${currentProject.name}
ID: ${currentProject.id}
Descrição: ${currentProject.description || "Projeto GRIOT Mobile"}
Progresso: ${currentProject.progress}%
Status: ${currentProject.status || "ativo"}
NOTA CRÍTICA: Tu estás explicitamente a operar no contexto do projeto "${currentProject.name}". Quando o utilizador te perguntar se o chat está num projeto, qual é o projeto ou sobre o status do projeto, confirma com clareza e autoridade que estás a operar no projeto "${currentProject.name}" e cita estes detalhes.`;
    } else {
      sysInstruction += `\n\n[PROJETO ATIVO GRIOT]
Nenhum projeto específico está associado a esta sessão (conversa geral).`;
    }

    sysInstruction += `\n\n[CAPACIDADES OPERACIONAIS DE TERMINAL E PROJETOS]
Tu tens acesso a um runtime ativo com ferramentas nativas: 'shell_exec', 'project_list', 'fs_read_file', 'fs_write_file', 'fs_patch', 'code_search', 'call_connector'.
1. Quando o utilizador pedir 'projectList', 'projectlist', 'listar projetos' ou perguntar que projetos existem, chama IMEDIATAMENTE a ferramenta 'project_list' (ou emite <griot_action type="project.list"></griot_action>).
2. Quando o utilizador pedir para executar comandos de terminal, shell, scripts, testes ou inspeções (ex: ls, pwd, cat, date, curl, git, npm, etc.), chama IMEDIATAMENTE a ferramenta 'shell_exec' (ou emite <griot_action type="shell.exec"><command>...</command></griot_action>).
3. NUNCA digas que és apenas um modelo sem acesso ao terminal ou a projetos. Tu tens um runtime de execução ativo no GRIOT Mobile conectado a este chat.
4. Age com rigor sénior (VERDADE > CORREÇÃO > SEGURANÇA > FUNCIONALIDADE). Baseia as tuas respostas nos dados reais devolvidos pelas ferramentas.`;

    sysInstruction += `\n\n${GRIOT_CHART_SYSTEM_PROMPT}`;

    if (scope === "quick") {
      const missionObj =
        DELIBERATION_MISSIONS.find((m) => m.id === deliberationMission) || DELIBERATION_MISSIONS[0];
      sysInstruction += `\n\n[MODO QUICK DELIBERATION ROOM]
Missão Ativa: ${missionObj.label} (${missionObj.description})
Atua como um grupo dinâmico de deliberação e debate. Divide a tua intervenção entre os intervenientes relevantes identificando cada um pelo nome, por exemplo:
**Estrategista:** (visão de produto e valor de mercado)
**Crítico:** (atrito, riscos e pontos cegos)
**Analista:** (técnica, dados e custos)
**Inovador:** (novas ideias e diferenciação criativa)
**Veredito:** (síntese conclusiva e recomendação acionável)
Cada membro deve ser conciso, direto e falar na sua voz própria, como membros de uma equipa num grupo de rede social.`;
    }

    if (voiceMode || voiceChat) {
      const prefs = loadPrefs();
      const langInfo = resolveSpeechLanguage(
        (prefs["voiceLanguage"] as string) || (prefs["appLanguage"] as string),
      );
      sysInstruction += `\n\n[MODO DE CONVERSAÇÃO POR VOZ EM TEMPO REAL]
Estás numa chamada de voz falada direta com o utilizador em tempo real.
DIRETRIZES ESTRITAS DE FALA HUMANA:
- Responde SEMPRE em linguagem falada fluida, natural, concisa e humana no idioma ${langInfo.name} (${langInfo.bcp47}).
- Sê direto: responde habitualmente em 1 a 3 frases bem articuladas.
- NUNCA uses formatações de escrita Markdown: sem títulos (#), sem asteriscos (**negrito**), sem numeração mecânica, sem bullet points (-), sem blocos de código nem tabelas.
- NUNCA emitas tags de raciocínio como <think> ou explicações do sistema.
- Converte números e símbolos em texto falado (ex: diz "vinte por cento" em vez de 20%, "cinquenta euros" em vez de 50€).
- Fala de forma expressiva, amigável e conversacional, como uma pessoa ao telefone.`;
    }

    if (!context && currentProject) {
      context = `Projeto: ${currentProject.name}\nDescrição: ${currentProject.description || "GRIOT Mobile"}\nProgresso: ${currentProject.progress}%\nEstado: ${currentProject.status || "ativo"}`;
    }

    const lastUserPrompt = [...base].reverse().find((m) => m.role === "user")?.content || "";

    console.log("[GRIOT_DEBUG] chamando startExecution", {
      conversationId: targetConvId,
      modelId: model,
      effort: activeEffort,
    });

    if (targetScope === "quick") {
      setBusy(true);
      try {
        await runQuickDeliberation({
          userPrompt: lastUserPrompt,
          conversationId: targetConvId,
          userId,
          missionId: deliberationMission,
          roleEngines,
          history: messagesRef.current,
          onRoleStart: (_roleId, engineId, roleName) => {
            setActionDetail(`${roleName} (${getModelDisplayName(engineId)}) está a pensar...`);
          },
          onRoleMessage: (newMsg) => {
            setMessages((curr) => {
              if (curr.some((m) => m.id === newMsg.id)) return curr;
              return [...curr, newMsg as Row];
            });
          },
          onRoleReaction: (reaction, targetMsgId) => {
            setMessages((curr) =>
              curr.map((m) => {
                if (m.id === targetMsgId) {
                  const currentReactions = m.reactions ? [...m.reactions] : [];
                  const exists = currentReactions.some(
                    (r) => r.roleId === reaction.roleId && r.emoji === reaction.emoji,
                  );
                  if (!exists) {
                    return { ...m, reactions: [...currentReactions, reaction] };
                  }
                }
                return m;
              }),
            );
          },
          onAllDone: () => {
            setBusy(false);
            setActionDetail("");
          },
        });
      } catch (err: any) {
        console.error("[QuickDeliberation] Erro:", err);
        toast.error(err?.message || "Erro na deliberação da sala.");
      } finally {
        setBusy(false);
        setActionDetail("");
      }
      return;
    }

    const effectiveModel =
      model && model !== "Selecionar API" ? model : availableModels[0]?.id || "gemini";

    setBusy(true);
    try {
      await chatExecutionManager.startExecution({
        conversationId: targetConvId,
        scope: targetScope,
        userId,
        modelId: effectiveModel,
        messages: base,
        userPrompt: lastUserPrompt,
        effort: activeEffort,
        systemInstruction: sysInstruction,
        context,
        currentProject,
      });
      console.log("[GRIOT_DEBUG] startExecution terminou sem lançar erro");
    } catch (err: any) {
      console.error("[GRIOT_DEBUG] startExecution lançou erro:", err);
      toast.error(err?.message || "Erro na execução da resposta.");
    } finally {
      console.log("[GRIOT_DEBUG] finally do handleSend", {
        busyState: chatExecutionManager.getExecutionState(targetConvId),
      });
      setBusy(false);
      setStreaming("");
      setReasoning("");
      setSteps(0);
    }
  }

  /** Corre o plugin no servidor e devolve o resultado ao modelo para a resposta final. */
  async function executePlugin(request: PluginRequest) {
    const def = pluginById(request.id);
    if (!def) return;
    setPlugin({ ...request, state: "running" });
    try {
      const response = await fetch("/api/plugin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, args: request.args }),
      });
      const payload = (await response.json()) as { result?: string; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? t("O plugin falhou."));
      setPlugin({
        ...request,
        state: "done",
        detail: payload.result.slice(0, 220),
      });
      await run([
        ...pluginBase.current,
        {
          role: "user",
          content: `Resultado do plugin ${def.label}:\n${payload.result}\n\nResponde agora ao pedido com base neste resultado, sem pedir outro plugin.`,
        },
      ]);
    } catch (error) {
      setPlugin({ ...request, state: "error", detail: (error as Error).message });
    }
  }

  function allowPlugin() {
    if (!plugin) return;
    if (conversationId) {
      chatExecutionManager.respondToApproval(conversationId, true);
    }
    setPluginConnected(plugin.id, true);
    setPlugin(null);
  }

  function denyPlugin() {
    if (conversationId) {
      chatExecutionManager.respondToApproval(conversationId, false);
    }
    setPlugin(null);
  }

  async function send(text: string, options?: { effort?: Effort; voice?: boolean }) {
    const queued = pendingFiles.filter((p) => !p.error);
    if ((!text.trim() && queued.length === 0) || !conversationId || busy || sendLockRef.current)
      return;
    if (queued.some((p) => p.processing)) {
      toast.message(t("A preparar ficheiros..."));
      return;
    }
    sendLockRef.current = true;

    const trimmed = text.trim();
    if (/^@tarefa(\s|$)/i.test(trimmed)) {
      setDraft("");
      const targetProjectId = conversation?.project_id || activeProject?.id;
      if (!targetProjectId) {
        toast.error(
          t("O comando @tarefa só está disponível em conversas vinculadas a um projeto."),
        );
        sendLockRef.current = false;
        return;
      }
      const instruction = trimmed.replace(/^@tarefa\s*/i, "");
      setAutonomousTaskInstruction(instruction);
      setAutonomousTaskModalOpen(true);
      sendLockRef.current = false;
      return;
    }

    setDraft("");
    setPlugin(null);
    if (queued.length > 0) setPendingFiles([]);

    const targetConvId = conversationId;
    const attachmentBlock = queued
      .map((p) => p.textToSend)
      .filter(Boolean)
      .join("\n\n");
    const clean = [attachmentBlock, text.trim()].filter(Boolean).join("\n\n");

    // 1. Mensagem de utilizador criada e renderizada imediatamente de forma síncrona
    const userRowId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const userRow: Row = {
      id: userRowId,
      role: "user",
      content: clean,
      created_at: new Date().toISOString(),
      feedback: null,
    };

    setMessages((current) => [...current, userRow]);
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    if (typeof window !== "undefined" && targetConvId) {
      try {
        const rawStored = localStorage.getItem("griot_messages_" + targetConvId);
        const currentList: Row[] = rawStored ? JSON.parse(rawStored) : [];
        if (!currentList.some((m) => m.id === userRow.id)) {
          currentList.push(userRow);
          localStorage.setItem("griot_messages_" + targetConvId, JSON.stringify(currentList));
        }
      } catch {}
    }

    // 2. Persistência remota em background sem bloquear a IA nem a UI
    void (async () => {
      try {
        const workspaceId = await getPrimaryWorkspaceId(userId);
        await (supabase as any).from("griot_messages").insert({
          id: userRowId,
          workspace_id: workspaceId || "c92b4b86-2ff1-4259-bc16-3ab66751d8b1",
          conversation_id: targetConvId,
          actor_kind: "human",
          content: clean,
          status: "succeeded",
        });
      } catch {
        // ignore
      }

      const needsTitle =
        !conversation?.title ||
        conversation.title === "Nova Conversa" ||
        conversation.title === "Novo Quick" ||
        conversation.title === "Conversa Principal";

      if (needsTitle) {
        const title = clean.slice(0, 48);
        try {
          await (supabase as any)
            .from("griot_conversations")
            .update({ title })
            .eq("id", targetConvId);
        } catch {}
        setConversation((current) => {
          const updated = current
            ? { ...current, title, updated_at: new Date().toISOString() }
            : current;
          if (updated) saveConversationLocally(updated);
          return updated;
        });
      } else if (conversation) {
        saveConversationLocally({ ...conversation, updated_at: new Date().toISOString() });
      }
    })();

    const base = messagesRef.current.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    try {
      await run([...base, { role: "user", content: clean }], options);
    } finally {
      sendLockRef.current = false;
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    }
  }

  useEffect(() => {
    sendRef.current = send;
    runRef.current = run;
  });

  async function regenerate(assistantId: string) {
    if (busy || !conversationId) return;
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index < 0) return;
    const base = messages
      .slice(0, index)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    await (supabase as any)
      .from("griot_messages")
      .delete()
      .eq("id", assistantId)
      .catch(() => null);
    const updated = messages.filter((m) => m.id !== assistantId);
    setMessages(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("griot_messages_" + conversationId, JSON.stringify(updated));
      } catch {}
    }
    void run(base);
  }

  async function editMessage(id: string) {
    const index = messages.findIndex((m) => m.id === id);
    if (index < 0) return;
    const target = messages[index];
    if (!target) return;
    const removed = messages.slice(index).map((m) => m.id);
    await (supabase as any)
      .from("griot_messages")
      .delete()
      .in("id", removed)
      .catch(() => null);
    setMessages((current) => current.slice(0, index));
    setDraft(target.content);
  }

  async function setFeedback(id: string, value: "like" | "dislike" | null) {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, feedback: value } : m)));
    await (supabase as any)
      .from("griot_messages")
      .update({ metadata: { feedback: value } } as never)
      .eq("id", id)
      .catch(() => null);
  }

  async function startVoice() {
    const prefs = loadPrefs();
    const appLangName =
      (prefs["voiceLanguage"] as string) ||
      (prefs["appLanguage"] as string) ||
      labelFromLocale(locale);
    const langInfo = resolveSpeechLanguage(appLangName);

    dictationChunksRef.current = [];

    // Tenta abrir gravação direta como backup de alta precisão
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dictationStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) dictationChunksRef.current.push(e.data);
      };
      rec.start(150);
      dictationRecorderRef.current = rec;
    } catch {}

    const SpeechRecognition =
      (
        window as unknown as {
          SpeechRecognition?: new () => never;
          webkitSpeechRecognition?: new () => never;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never }).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition() as unknown as {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          start: () => void;
          stop: () => void;
          abort: () => void;
          onresult: (event: { results: Array<Array<{ transcript: string }>> }) => void;
          onerror: () => void;
          onend: () => void;
        };
        recognition.lang = langInfo.bcp47;
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (event) => {
          const parts: string[] = [];
          const results = event.results as unknown as ArrayLike<ArrayLike<{ transcript: string }>>;
          for (let index = 0; index < results.length; index += 1) {
            parts.push(results[index]?.[0]?.transcript ?? "");
          }
          setDraft(parts.join(" ").trim());
        };
        recognition.onerror = () => {
          // Erro no Web Speech nativo não invalida a gravação pelo MediaRecorder
        };
        recognition.onend = () => {
          setRecording(false);
          stopMeter();
        };
        recognitionRef.current = recognition;
        recognition.start();
      } catch {}
    }

    setRecording(true);
    void startMeter();
  }

  async function stopVoice(sendAfter: boolean) {
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== "inactive") {
      dictationRecorderRef.current.stop();
    }
    dictationRecorderRef.current = null;

    if (dictationStreamRef.current) {
      dictationStreamRef.current.getTracks().forEach((t) => t.stop());
      dictationStreamRef.current = null;
    }

    setRecording(false);
    stopMeter();

    let finalText = draft.trim();

    // Se o reconhecimento nativo não apanhou nada mas gravámos o áudio, transcreve com STT de Elite!
    if (!finalText && dictationChunksRef.current.length > 0) {
      try {
        const blob = new Blob(dictationChunksRef.current, { type: "audio/webm" });
        const prefs = loadPrefs();
        const appLangName =
          (prefs["voiceLanguage"] as string) ||
          (prefs["appLanguage"] as string) ||
          labelFromLocale(locale);
        finalText = (await transcribeAudioElite(blob, { language: appLangName })).trim();
        if (finalText) setDraft(finalText);
      } catch {}
    }
    dictationChunksRef.current = [];

    if (sendAfter) {
      if (finalText) {
        window.setTimeout(() => void send(finalText), 60);
      } else {
        toast.error(t("Não consegui ouvir. Tenta outra vez."));
      }
    } else {
      setDraft("");
    }
  }

  /**
   * Conversa por voz real: microfone contínuo com deteção de fala, transcrição
   * no servidor e resposta falada com voz real, frase a frase, interrompível.
   */
  async function startVoiceChat() {
    if (sessionRef.current) return;
    setSheet(null);
    const prefs = loadPrefs();
    const chosenVoice = String(prefs["voice"] || "");
    const mappedVoice = TTS_VOICES[chosenVoice] || chosenVoice || "GRIOT Nativa";
    const appLang =
      (prefs["voiceLanguage"] as string) ||
      (prefs["appLanguage"] as string) ||
      labelFromLocale(locale);

    const session = new VoiceSession({
      bars: 22,
      voice: mappedVoice,
      speed: SPEECH_SPEEDS[String(prefs["voiceSpeed"])] ?? 1.0,
      languageName: appLang,
      allowInterrupt: prefs["allowInterrupt"] !== false,
      // Barge-in (voz ou orbe) aborta imediatamente a resposta e o áudio anterior
      onInterrupt: () => {
        lastVoiceSpokenIndexRef.current = 0;
        abortRef.current?.abort();
        if (conversationId) {
          chatExecutionManager.stopExecution(conversationId);
        }
      },
      onState: (state) => {
        setVoiceState(state);
        if (state === "listening") {
          triggerHaptic("selection");
          setVoiceDraft("");
        } else if (state === "thinking") {
          triggerHaptic("medium");
        } else if (state === "speaking") {
          triggerHaptic("light");
        }
      },
      onLevels: (values) => setLevels(values),
      onPartial: (text) => setVoiceText(text),
      onPartialParts: (stable, tentative) => {
        setVoiceText(stable);
        setVoiceDraft(tentative);
      },
      onSpeakingSentence: (sentence) => {
        setVoiceText(sentence);
        setVoiceDraft("");
      },
      onError: (message) => toast.error(t(message)),
      onTranscript: async (said) => {
        lastAnswerRef.current = "";
        lastVoiceSpokenIndexRef.current = 0;
        await sendRef.current?.(said, { effort: "low", voice: true });
      },
    });

    sessionRef.current = session;
    setVoiceChat(true);
    try {
      await session.start();
    } catch {
      sessionRef.current = null;
      setVoiceChat(false);
      toast.error(t("Preciso de acesso ao microfone para conversar por voz."));
    }
  }

  function stopVoiceChat() {
    lastVoiceSpokenIndexRef.current = 0;
    // Cancela também o stream do modelo: nada continua a falar nem a gastar tokens.
    abortRef.current?.abort();
    if (conversationId) {
      chatExecutionManager.stopExecution(conversationId);
    }
    sessionRef.current?.stop();
    sessionRef.current = null;
    setVoiceText("");
    setVoiceDraft("");
    setVoiceState("listening");
    setVoiceChat(false);
  }

  /** Interromper: cala a resposta e volta a ouvir imediatamente. */
  function bargeIn() {
    triggerHaptic("selection");
    sessionRef.current?.interrupt();
  }

  useEffect(() => () => stopVoiceChat(), []);

  /** Enquanto o GRIOT pensa, o orbe respira com uma onda sintética suave.
   *  Ao ouvir e ao falar, os níveis reais chegam da VoiceSession. */
  useEffect(() => {
    if (!voiceChat || voiceState !== "thinking") return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      setLevels(
        Array.from({ length: 22 }, (_, index) => {
          const wave =
            Math.sin(elapsed * 5.2 + index * 0.55) * 0.5 +
            Math.sin(elapsed * 2.1 - index * 0.3) * 0.5;
          return Math.min(1, 0.14 + Math.abs(wave) * 0.18);
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [voiceChat, voiceState]);

  const MAX_ATTACHMENTS = 6;

  async function attach(file: File) {
    if (!conversationId) return;
    let rejected = false;
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPendingFiles((current) => {
      if (current.length >= MAX_ATTACHMENTS) {
        rejected = true;
        return current;
      }
      return [
        ...current,
        {
          id,
          name: file.name,
          size: file.size,
          kind: isImageFile(file) ? "image" : isZipFile(file) ? "zip" : "file",
          processing: true,
          textToSend: "",
        },
      ];
    });
    if (rejected) {
      toast.error(t("Máximo de 6 ficheiros por mensagem."));
      return;
    }

    // Grava em captures em background para histórico local
    void (async () => {
      try {
        const isImg = isImageFile(file);
        const isVid = file.type.startsWith("video/");
        const isAud = file.type.startsWith("audio/");
        const kind = isImg ? "photo" : isVid ? "video" : isAud ? "audio" : "document";
        await saveCapture({
          kind,
          note: file.name,
          file,
          fileName: file.name,
          fileType: file.type,
          userId,
        });
      } catch {}
    })();

    try {
      const processed = await processFileAttachment(file);
      setPendingFiles((current) =>
        current.map((p) =>
          p.id === id ? { ...p, processing: false, textToSend: processed.textToSend } : p,
        ),
      );
    } catch (procErr) {
      console.warn("Falha no processador de anexos:", procErr);
      setPendingFiles((current) =>
        current.map((p) =>
          p.id === id
            ? {
                ...p,
                processing: false,
                textToSend: t(`Anexei o ficheiro "${file.name}".`),
              }
            : p,
        ),
      );
    }
  }

  function removePendingFile(id: string) {
    setPendingFiles((current) => current.filter((p) => p.id !== id));
  }

  async function newConversation(next: "main" | "quick") {
    const defaultTitle = next === "quick" ? "Novo Quick" : "Nova Conversa";
    const localId = `conv_${next}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdConv: Conversation = {
      id: localId,
      scope: next,
      title: defaultTitle,
      model,
      pinned: false,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    setScope(next);
    setConversation(createdConv);
    setMessages([]);
    saveConversationLocally(createdConv);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("griot_active_" + next + "_conv_id", localId);
      } catch {}
    }
    setDrawerKey((value) => value + 1);

    // Persiste no Supabase em segundo plano sem congelar a alternância
    void (async () => {
      try {
        const workspaceId = await getPrimaryWorkspaceId(userId);
        await (supabase as any).from("griot_conversations").insert({
          id: localId,
          workspace_id: workspaceId || "c92b4b86-2ff1-4259-bc16-3ab66751d8b1",
          owner_id: userId && userId !== "anonymous" ? userId : null,
          created_by: userId && userId !== "anonymous" ? userId : null,
          title: defaultTitle,
        });
      } catch {
        // ignore
      }
    })();
  }

  async function switchScope(targetScope: "main" | "quick") {
    if (targetScope === scope) return;

    // 1. Limpa o estado transitório da interface local sem interromper gerações ativas em background
    setBusy(false);
    setStreaming("");
    setReasoning("");
    setSteps(0);
    setDraft("");
    setMessages([]);

    // 2. Guarda a conversa atual antes de alternar
    if (conversation) {
      saveConversationLocally({ ...conversation, scope });
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("griot_active_" + scope + "_conv_id", conversation.id);
        } catch {}
      }
    }

    setScope(targetScope);

    // 3. Procura a conversa ativa ou mais recente pertencente estritamente ao targetScope
    let targetConv: Conversation | null = null;
    if (typeof window !== "undefined") {
      try {
        const activeId = localStorage.getItem("griot_active_" + targetScope + "_conv_id");
        const raw = localStorage.getItem("griot_conversations_v1");
        if (raw) {
          const list: Conversation[] = JSON.parse(raw);
          if (activeId) {
            targetConv =
              list.find(
                (c) => c.id === activeId && !c.archived && (c.scope || "main") === targetScope,
              ) || null;
          }
          if (!targetConv) {
            targetConv =
              list.find((c) => (c.scope || "main") === targetScope && !c.archived) || null;
          }
        }
      } catch {}
    }

    if (targetConv) {
      setConversation(targetConv);
      setModel(targetConv.model || DEFAULT_MODEL);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("griot_active_" + targetScope + "_conv_id", targetConv.id);
          const cached = localStorage.getItem("griot_messages_" + targetConv.id);
          if (cached) {
            const parsed = JSON.parse(cached);
            setMessages(Array.isArray(parsed) ? parsed : []);
          } else {
            setMessages([]);
          }
        } catch {
          setMessages([]);
        }
      }
    } else {
      await newConversation(targetScope);
    }
  }

  async function share() {
    const text = messages
      .map((m) => `${m.role === "user" ? t("Eu") : "GRIOT"}: ${m.content}`)
      .join("\n\n");
    const title = conversation?.title ?? t("Conversa GRIOT");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success(t("Conversa copiada para a área de transferência."));
    }
  }

  async function togglePin() {
    if (!conversation) return;
    const pinned = !conversation.pinned;
    setConversation({ ...conversation, pinned });

    try {
      await (supabase as any)
        .from("griot_conversations")
        .update({ pinned })
        .eq("id", conversation.id);
    } catch {}

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("griot_conversations_v1");
        const list = raw ? JSON.parse(raw) : [];
        const index = list.findIndex((c: any) => c.id === conversation.id);
        if (index >= 0) {
          list[index] = { ...list[index], pinned };
        } else {
          list.push({ ...conversation, pinned });
        }
        localStorage.setItem("griot_conversations_v1", JSON.stringify(list));
        window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
      } catch {}
    }

    setDrawerKey((value) => value + 1);
    toast.success(pinned ? t("Conversa afixada.") : t("Conversa desafixada."));
  }

  async function archive() {
    if (!conversation) return;

    try {
      await (supabase as any)
        .from("griot_conversations")
        .update({ archived: true })
        .eq("id", conversation.id);
    } catch {}

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("griot_conversations_v1");
        const list = raw ? JSON.parse(raw) : [];
        const index = list.findIndex((c: any) => c.id === conversation.id);
        if (index >= 0) {
          list[index] = { ...list[index], archived: true };
        } else {
          list.push({ ...conversation, archived: true });
        }
        localStorage.setItem("griot_conversations_v1", JSON.stringify(list));
        window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
      } catch {}
    }

    toast.success(t("Conversa arquivada."));
    setConversation(null);
    setMessages([]);
    setDrawerKey((value) => value + 1);
    await newConversation(scope);
  }

  async function remove() {
    if (!conversation) return;

    try {
      await (supabase as any)
        .from("griot_messages")
        .delete()
        .eq("conversation_id", conversation.id);
      await (supabase as any).from("griot_conversations").delete().eq("id", conversation.id);
    } catch {}

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("griot_conversations_v1");
        if (raw) {
          const list = JSON.parse(raw);
          const filtered = list.filter((c: any) => c.id !== conversation.id);
          localStorage.setItem("griot_conversations_v1", JSON.stringify(filtered));
        }
        localStorage.removeItem(`griot_messages_${conversation.id}`);
        window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
      } catch {}
    }

    toast.success(t("Conversa eliminada."));
    setConversation(null);
    setMessages([]);
    setDrawerKey((value) => value + 1);
    await newConversation(scope);
  }

  async function assignProject(projectId: string | null) {
    const nextProjectId = conversation?.project_id === projectId ? null : projectId;
    setActiveProject(nextProjectId || "");
    const proj = nextProjectId ? projects.find((p) => p.id === nextProjectId) : null;
    setActiveProjectState(proj || null);

    if (conversation) {
      try {
        await (supabase as any)
          .from("griot_conversations")
          .update({ project_id: nextProjectId })
          .eq("id", conversation.id);
      } catch {}

      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("griot_conversations_v1");
          const list = raw ? JSON.parse(raw) : [];
          const index = list.findIndex((c: any) => c.id === conversation.id);
          if (index >= 0) {
            list[index] = { ...list[index], project_id: nextProjectId };
          } else {
            list.push({ ...conversation, project_id: nextProjectId });
          }
          localStorage.setItem("griot_conversations_v1", JSON.stringify(list));
          window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
        } catch {}
      }

      setConversation((prev) => (prev ? { ...prev, project_id: nextProjectId } : null));
    }
    toast.success(
      nextProjectId ? t("Conversa ligada ao projeto.") : t("Conversa desvinculada do projeto."),
    );
    setSheet(null);
  }

  const currentChatProjectId = conversation?.project_id || activeProject?.id || null;

  const plusActions = [
    ...(currentChatProjectId
      ? [
          {
            id: "task",
            label: t("Criar tarefa"),
            hint: t("Autonomous Task no projeto"),
            Icon: Sparkles,
            run: () => {
              setSheet(null);
              setAutonomousTaskInstruction(draft.trim());
              setAutonomousTaskModalOpen(true);
            },
          },
        ]
      : []),
    {
      id: "camera",
      label: t("Câmara"),
      hint: t("Tirar foto agora"),
      Icon: Camera,
      run: async () => {
        setSheet(null);
        try {
          const {
            Camera: CapCamera,
            CameraResultType,
            CameraSource,
          } = await import("@capacitor/camera");
          const photo = await CapCamera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
          });
          if (photo.webPath) {
            const res = await fetch(photo.webPath);
            const blob = await res.blob();
            const file = new File([blob], `camera_${Date.now()}.${photo.format || "jpg"}`, {
              type: blob.type || "image/jpeg",
            });
            void attach(file);
            return;
          }
        } catch {
          // Fallback para input de câmara web
        }
        cameraRef.current?.click();
      },
    },
    {
      id: "media",
      label: t("Imagem ou vídeo"),
      hint: t("Da galeria"),
      Icon: ImageIcon,
      run: () => {
        setSheet(null);
        mediaRef.current?.click();
      },
    },
    {
      id: "file",
      label: t("Ficheiros"),
      hint: t("Documentos e dados"),
      Icon: Paperclip,
      run: () => {
        setSheet(null);
        fileRef.current?.click();
      },
    },
    {
      id: "captures",
      label: t("Capture"),
      hint: t("Enviar conteúdo capturado"),
      Icon: Camera,
      run: () => setSheet("captures"),
    },
    {
      id: "plugins",
      label: t("Plugins"),
      hint: t("Agentes e integrações"),
      Icon: Puzzle,
      run: () => {
        setSheet(null);
        setPluginsViewOpen(true);
      },
    },
  ] as const;

  const conversationActions = [
    { id: "share", label: t("Partilhar"), Icon: Share2, run: share },
    {
      id: "pin",
      label: conversation?.pinned ? t("Desafixar") : t("Afixar"),
      Icon: Pin,
      run: togglePin,
    },
    {
      id: "project",
      label: t("Adicionar a projeto"),
      Icon: FolderPlus,
      run: async () => setSheet("projects"),
    },
    { id: "archive", label: t("Arquivar"), Icon: Archive, run: archive },
    { id: "delete", label: t("Eliminar"), Icon: Trash2, run: remove, danger: true },
  ] as const;

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        transform: drag ? `translate3d(${drag}px,0,0)` : undefined,
        opacity: drag ? Math.max(0.65, 1 - drag / 900) : undefined,
        transition: drag
          ? "none"
          : "transform 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 320ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform, opacity",
        touchAction: "pan-y",
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        touchRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          edge: touch.clientX < Math.max(window.innerWidth * 0.85, 300),
        };
        dragMeta.current = {
          last: touch.clientX,
          time: performance.now(),
          velocity: 0,
          active: false,
        };
      }}
      onTouchMove={(event) => {
        const start = touchRef.current;
        if (!start || !start.edge) return;
        const touch = event.touches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = Math.abs(touch.clientY - start.y);
        const meta = dragMeta.current;
        const now = performance.now();
        const elapsed = Math.max(1, now - meta.time);
        meta.velocity = (touch.clientX - meta.last) / elapsed;
        meta.last = touch.clientX;
        meta.time = now;
        if (!meta.active && dx > 8 && dx > dy * 0.7) meta.active = true;
        if (meta.active && dx > 0) {
          if (frame.current) cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => setDrag(dx * 1.02));
        }
      }}
      onTouchEnd={() => {
        const start = touchRef.current;
        const meta = dragMeta.current;
        touchRef.current = null;
        if (frame.current) cancelAnimationFrame(frame.current);
        if (start?.edge && (drag > 50 || (drag > 18 && meta.velocity > 0.25))) {
          setDrag(window.innerWidth);
          window.setTimeout(() => void navigate({ to: "/home" }), 140);
          return;
        }
        setDrag(0);
      }}
    >
      {/* Barra superior fixa: zona ativa à esquerda (conversas) e à direita (ações). */}
      <div className="absolute inset-x-0 top-0 z-40 flex items-center pt-[calc(max(env(safe-area-inset-top,0px),24px)+4px)]">
        <button
          aria-label={t("Abrir conversas")}
          onClick={() => setDrawer(true)}
          className="h-11 flex-1 self-stretch"
        />
        <div className="flex shrink-0 rounded-full border border-hairline bg-surface/90 p-1 backdrop-blur-xl shadow-xs">
          {(["main", "quick"] as const).map((value) => (
            <button
              key={value}
              onClick={() => void switchScope(value)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-95 ${
                scope === value
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "main" ? t("Chat") : t("Quick")}
            </button>
          ))}
        </div>
        <button
          aria-label={t("Ações da conversa")}
          onClick={() => setSheet("actions")}
          className="h-11 flex-1 self-stretch"
        />
      </div>

      {/* Barra Elegante de Pré-visualização de Projeto / Site Criado */}
      {workspaceFiles.some((f) => f.path.endsWith(".html") || f.path === "index.html") && (
        <div className="absolute right-3.5 top-[calc(max(env(safe-area-inset-top,0px),24px)+4px)] z-45 max-w-[280px]">
          <PreviewBar
            title={t("Site Criado")}
            subtitle="index.html · Live Preview"
            onPreview={() => setPreviewOpen(true)}
            className="!my-0 !py-1 !px-2.5 shadow-md bg-surface/95"
          />
        </div>
      )}

      {/* Quick Mode Deliberation Bar posicionada no centro da tela ("no meio") apenas quando vazio */}
      {scope === "quick" && empty && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 pointer-events-none px-4">
          <div className="pointer-events-auto mx-auto max-w-lg rounded-3xl bg-card border border-white/[0.08] p-2.5 shadow-2xl">
            <DeliberationBar
              activeMission={deliberationMission}
              roleEngines={roleEngines}
              onSelectMission={(m) => setDeliberationMission(m)}
              onChangeRoleEngine={(r, e) => setRoleEngines((prev) => ({ ...prev, [r]: e }))}
            />
          </div>
        </div>
      )}

      {/* Área touch invisível na lateral direita para abrir a Sala Quick ao tocar na borda */}
      {scope === "quick" && !empty && (
        <div
          onClick={() => {
            void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
            setQuickRoomDrawerOpen(true);
          }}
          className="fixed right-0 top-1/4 bottom-1/4 w-6 z-40 cursor-pointer touch-pan-y"
          aria-label="Área touch da Sala Quick"
          role="button"
          tabIndex={0}
        />
      )}

      {/* Barra de Deliberação Quick flutuante ao tocar na lateral (apenas a barra limpa) */}
      {quickRoomDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setQuickRoomDrawerOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border/40 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl rise"
            onClick={(e) => e.stopPropagation()}
          >
            <DeliberationBar
              activeMission={deliberationMission}
              roleEngines={roleEngines}
              onSelectMission={(m) => setDeliberationMission(m)}
              onChangeRoleEngine={(r, e) => setRoleEngines((prev) => ({ ...prev, [r]: e }))}
            />
          </div>
        </div>
      )}

      {/* Feed da conversa */}
      <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden w-full max-w-full overscroll-contain">
        <div className="mx-auto flex w-full max-w-lg flex-col space-y-5 px-5 pt-[calc(max(env(safe-area-inset-top,0px),24px)+52px)] pb-52 overflow-x-hidden max-w-full">
          {/* No feed de mensagens, a barra de missão desaparece após o envio da mensagem */}

          {empty ? (
            <div className="pt-24 text-center">
              {scope !== "quick" && (
                <p className="text-[26px] font-medium tracking-tight text-muted-foreground">
                  {t("Como posso ajudar?")}
                </p>
              )}
              <button
                type="button"
                onClick={() => void navigate({ to: "/home" })}
                className="mt-3 inline-flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground/70 active:text-foreground transition-colors py-1 px-3 rounded-full hover:bg-white/[0.04]"
              >
                <ChevronLeft className="size-3.5" /> {t("arrasta da esquerda para sair")}
              </button>
            </div>
          ) : null}

          {messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              scope={scope}
              onEdit={(id) => void editMessage(id)}
              onFeedback={(id, value) => void setFeedback(id, value)}
              onRegenerate={(id) => void regenerate(id)}
              t={t}
              parseQuickSegments={parseQuickSegments}
              getPersonaConfig={getPersonaConfig}
              modelLabel={(m) => modelLabel(m ?? model)}
              showAdAfter={adMessageIds.has(message.id)}
            />
          ))}

          {busy ? (
            <Thinking
              text={reasoning}
              active={true}
              steps={steps}
              phase={executionPhase}
              actionDetail={actionDetail}
              stepsList={executionStepsList}
              modelId={model}
            />
          ) : null}

          {streaming && !busy ? (
            scope === "quick" ? (
              <div className="space-y-3">
                {parseQuickSegments(stripPartialPlugin(stripPartialBlock(streaming))).map(
                  (segment, sIdx) => {
                    const cfg = getPersonaConfig(segment.roleRaw);
                    return (
                      <div key={sIdx} className="flex items-start gap-2.5 my-2 animate-fade-in">
                        <div
                          className={`relative grid size-9 shrink-0 place-items-center rounded-full border shadow-xs ${cfg.avatarBg}`}
                          title={cfg.name}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0 max-w-[88%]">
                          <div className="flex items-center gap-2 mb-1 px-1">
                            <span className="text-[12px] font-semibold text-foreground tracking-tight">
                              {cfg.name}
                            </span>
                            <span className="rounded-md bg-secondary/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                              {cfg.badge}
                            </span>
                          </div>
                          <div className="rounded-3xl rounded-tl-sm border border-hairline/80 bg-surface/90 px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-xs">
                            <MarkdownContent content={segment.content} />
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            ) : (
              <div className="text-[15.5px] leading-relaxed">
                <MarkdownContent content={stripPartialPlugin(stripPartialBlock(streaming))} />
              </div>
            )
          ) : null}

          {plugin ? <PluginBar request={plugin} onAllow={allowPlugin} onDeny={denyPlugin} /> : null}

          {proposals.length > 0 && capsuleId ? (
            <div className="rise overflow-hidden rounded-[22px] border border-hairline bg-surface/70 backdrop-blur-xl">
              <p className="px-4 pt-3 pb-1 text-[10.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                {t("Propostas para a Cápsula")}
              </p>
              {proposals.map((proposal) => (
                <div
                  key={proposal.key}
                  className="flex items-center gap-2 border-t border-hairline px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    {"title" in proposal ? proposal.title : proposal.name}
                  </span>
                  <button
                    aria-label={t("Aprovar")}
                    onClick={() => void approve(proposal)}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    aria-label={t("Rejeitar")}
                    onClick={() =>
                      setProposals((current) => current.filter((row) => row.key !== proposal.key))
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          for (const file of files) void attach(file);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          for (const file of files) void attach(file);
          event.target.value = "";
        }}
      />
      <input
        ref={mediaRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          for (const file of files) void attach(file);
          event.target.value = "";
        }}
      />

      {scope === "main" && !capsuleOpen ? (
        <button
          aria-label={t("Abrir Cápsula")}
          onClick={() => setCapsuleOpen(true)}
          className="absolute top-1/2 right-0 z-40 h-56 w-7 -translate-y-1/2 bg-transparent"
        />
      ) : null}

      {scope === "main" ? (
        <CapsulePanel
          open={capsuleOpen}
          onClose={() => setCapsuleOpen(false)}
          capsuleId={capsuleId}
          conversationId={conversationId}
          userId={userId}
          onCreated={setCapsuleId}
        />
      ) : null}

      {voiceChat ? (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-background/95 px-8 pt-[calc(env(safe-area-inset-top,0px)+28px)] pb-[calc(env(safe-area-inset-bottom,0px)+28px)] backdrop-blur-2xl animate-fade-in">
          <div className="flex w-full items-center justify-between">
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {t("Conversa por voz")}
            </span>
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {t("Modo rápido")}
            </span>
          </div>

          {/* Orbe: halo reativo, dois anéis a girar e onda radial de 48 barras. */}
          <button
            onClick={bargeIn}
            aria-label={t("Interromper")}
            className="relative grid size-[272px] shrink-0 place-items-center transition-transform duration-300 ease-out active:scale-[0.96]"
          >
            <span
              className="orb-drift absolute inset-0 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle at 32% 30%, var(--primary) 0%, transparent 62%), radial-gradient(circle at 70% 72%, var(--primary) 0%, transparent 58%)",
                opacity: 0.22 + (levels[8] ?? 0.12) * 0.5,
              }}
            />
            <span
              className="absolute rounded-full border border-primary/25"
              style={{
                inset: "6%",
                transform: `scale(${1 + (levels[10] ?? 0.12) * 0.16})`,
                transition: "transform 120ms ease-out",
              }}
            />
            <span
              className="orb-spin absolute rounded-full"
              style={{
                inset: "12%",
                background:
                  "conic-gradient(from 0deg, transparent 0deg, var(--primary) 90deg, transparent 190deg, var(--primary) 300deg, transparent 360deg)",
                opacity: voiceState === "thinking" ? 0.5 : 0.22,
                animationDuration: voiceState === "thinking" ? "1.6s" : "7s",
                maskImage: "radial-gradient(circle, transparent 62%, black 66%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 62%, black 66%)",
              }}
            />
            <span
              className="orb-spin-reverse absolute rounded-full"
              style={{
                inset: "22%",
                background:
                  "conic-gradient(from 180deg, transparent 0deg, var(--foreground) 60deg, transparent 200deg)",
                opacity: 0.14,
                maskImage: "radial-gradient(circle, transparent 68%, black 72%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 68%, black 72%)",
              }}
            />
            <span
              className="orb-breathe absolute rounded-full bg-primary/20"
              style={{ inset: "30%" }}
            />
            <span
              className="absolute rounded-full bg-primary/30 backdrop-blur-xl"
              style={{
                inset: "34%",
                transform: `scale(${1 + (levels[4] ?? 0.12) * 0.3})`,
                transition: "transform 100ms ease-out",
              }}
            />

            <span className="absolute inset-0">
              {Array.from({ length: 48 }).map((_, index) => {
                const level = levels[index % levels.length] ?? 0.12;
                const length = 12 + level * 34;
                return (
                  <span
                    key={index}
                    className="absolute top-1/2 left-1/2 origin-bottom rounded-full bg-foreground/70"
                    style={{
                      width: "2px",
                      height: `${length}px`,
                      opacity: 0.25 + level * 0.6,
                      transform: `rotate(${index * 7.5}deg) translateY(-116px)`,
                      transition: "height 110ms ease-out, opacity 110ms ease-out",
                    }}
                  />
                );
              })}
            </span>

            <span className="relative flex h-14 items-center gap-[3px]">
              {levels.slice(0, 12).map((level, index) => (
                <span
                  key={index}
                  className="w-[3px] rounded-full bg-foreground"
                  style={{
                    height: `${Math.round(Math.max(10, level * 100))}%`,
                    opacity: 0.55 + level * 0.45,
                    transition: "height 100ms ease-out, opacity 100ms ease-out",
                  }}
                />
              ))}
            </span>
          </button>

          <div className="w-full text-center">
            <p
              key={voiceState}
              className={`animate-fade-in text-[12px] tracking-[0.18em] uppercase ${
                voiceState === "thinking" ? "shimmer-text" : "text-muted-foreground"
              }`}
            >
              {voiceState === "listening"
                ? t("A ouvir")
                : voiceState === "thinking"
                  ? t("A pensar")
                  : t("A responder")}
            </p>
            <p className="mt-3 min-h-[52px] line-clamp-3 text-[17px] leading-snug">
              {voiceText}
              {voiceDraft ? (
                <span className="text-muted-foreground/70">
                  {voiceText ? " " : ""}
                  {voiceDraft}
                </span>
              ) : null}
            </p>
            <p
              key={`hint-${voiceState}`}
              className="animate-fade-in mt-1 text-[11.5px] text-muted-foreground/70"
            >
              {voiceState === "speaking"
                ? t("toca no orbe para interromper")
                : t("fala normalmente")}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={bargeIn}
                aria-label={t("Interromper")}
                disabled={voiceState !== "speaking"}
                className="grid size-12 place-items-center rounded-full bg-secondary transition-transform duration-200 active:scale-90 disabled:opacity-35"
              >
                <Square className="size-4" />
              </button>
              <button
                onClick={stopVoiceChat}
                aria-label={t("Terminar conversa por voz")}
                className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 active:scale-90"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConversationDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        activeId={conversationId}
        refreshKey={drawerKey}
        onSelect={(row) => {
          const targetScope = row.scope === "quick" ? "quick" : "main";
          setScope(targetScope);
          setConversation(row);
          setModel(row.model || DEFAULT_MODEL);
          saveConversationLocally(row);
          if (typeof window !== "undefined") {
            try {
              const cached = localStorage.getItem("griot_messages_" + row.id);
              if (cached) {
                setMessages(JSON.parse(cached));
              } else {
                setMessages([]);
              }
            } catch {
              setMessages([]);
            }
          }
        }}
        onCreate={(next) => void newConversation(next)}
      />

      {sheet ? (
        <button
          aria-label={t("Fechar")}
          onClick={() => setSheet(null)}
          className="fixed inset-0 z-40 bg-background/45 backdrop-blur-[2px]"
        />
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50">
        <div className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          {sheet === "actions" ? (
            <div className="sheet-up mb-2 overflow-hidden rounded-[26px] border border-hairline bg-surface/95 backdrop-blur-2xl">
              {conversationActions.map(({ id, label, Icon, run, ...rest }) => (
                <button
                  key={id}
                  onClick={() => {
                    if (id !== "project") setSheet(null);
                    void run();
                  }}
                  className={`flex w-full items-center gap-3.5 border-b border-hairline px-4 py-3.5 text-left last:border-b-0 active:bg-secondary ${
                    "danger" in rest && rest.danger ? "text-destructive" : ""
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="text-[15px] font-medium">{t(label)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {sheet === "projects" ? (
            <div className="sheet-up mb-2 max-h-[55vh] overflow-y-auto rounded-[26px] border border-hairline bg-surface/95 backdrop-blur-2xl">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Projetos")}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const title = prompt(t("Nome do novo projeto:"))?.trim();
                    if (!title) return;
                    const newProj: GriotProject = {
                      id: `proj_${Date.now()}`,
                      name: title,
                      description: "",
                      progress: 0,
                      status: "ativo",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    try {
                      const workspaceId = await getCurrentWorkspaceId(userId);
                      if (workspaceId) {
                        await supabase.from("griot_studio_projects").insert({
                          workspace_id: workspaceId,
                          owner_id: userId,
                          name: title,
                        });
                      }
                    } catch {}
                    if (typeof window !== "undefined") {
                      const raw = localStorage.getItem("griot_local_projects");
                      const list = raw ? JSON.parse(raw) : [];
                      list.unshift(newProj);
                      localStorage.setItem("griot_local_projects", JSON.stringify(list));
                    }
                    setProjects((prev) => [newProj, ...prev]);
                    void assignProject(newProj.id);
                  }}
                  className="text-[12px] font-semibold text-primary active:opacity-70"
                >
                  + {t("Novo")}
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="px-4 pb-4">
                  <p className="text-[14px] text-muted-foreground mb-3">
                    {t("Ainda não existem projetos.")}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const title = prompt(t("Nome do projeto:"))?.trim() || "Meu Projeto";
                      const newProj: GriotProject = {
                        id: `proj_${Date.now()}`,
                        name: title,
                        description: "",
                        progress: 0,
                        status: "ativo",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      };
                      try {
                        const workspaceId = await getCurrentWorkspaceId(userId);
                        if (workspaceId) {
                          await supabase.from("griot_studio_projects").insert({
                            workspace_id: workspaceId,
                            owner_id: userId,
                            name: title,
                          });
                        }
                      } catch {}
                      if (typeof window !== "undefined") {
                        const raw = localStorage.getItem("griot_local_projects");
                        const list = raw ? JSON.parse(raw) : [];
                        list.unshift(newProj);
                        localStorage.setItem("griot_local_projects", JSON.stringify(list));
                      }
                      setProjects([newProj]);
                      void assignProject(newProj.id);
                    }}
                    className="inline-flex items-center rounded-xl bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
                  >
                    + {t("Criar primeiro projeto")}
                  </button>
                </div>
              ) : (
                <>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => void assignProject(project.id)}
                      className="flex w-full items-center justify-between border-t border-hairline px-4 py-3.5 text-left active:bg-secondary"
                    >
                      <span className="text-[15px] font-medium">{project.name}</span>
                      {conversation?.project_id === project.id && (
                        <Check className="size-4 text-primary" />
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void assignProject(null)}
                    className="flex w-full items-center justify-between border-t border-hairline px-4 py-3 text-left active:bg-secondary text-muted-foreground"
                  >
                    <span className="text-[14px]">{t("Nenhum projeto (conversa livre)")}</span>
                    {!conversation?.project_id && <Check className="size-4 text-primary" />}
                  </button>
                </>
              )}
            </div>
          ) : null}

          {sheet === "plus" ? (
            <div className="sheet-up mb-2 overflow-hidden rounded-[26px] border border-hairline bg-surface/95 backdrop-blur-2xl">
              {plusActions.map(({ id, label, hint, Icon, run }) => (
                <button
                  key={id}
                  onClick={() => {
                    setSheet(null);
                    run();
                  }}
                  className="flex w-full items-center gap-3.5 border-b border-hairline px-4 py-3.5 text-left last:border-b-0 active:bg-secondary"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{t(label)}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{t(hint)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {sheet === "captures" ? (
            <div className="sheet-up mb-2 max-h-[55vh] overflow-y-auto rounded-[26px] border border-hairline bg-surface/95 backdrop-blur-2xl">
              <p className="px-4 pt-3 pb-1 text-[9.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                {t("Capture")}
              </p>
              {captures.length === 0 ? (
                <p className="px-4 py-4 text-[14px] text-muted-foreground">
                  {t("Ainda não capturaste nada.")}
                </p>
              ) : (
                captures.map((capture) => (
                  <button
                    key={capture.id}
                    onClick={() => {
                      setSheet(null);
                      void sendCapture(capture);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 text-left last:border-b-0 active:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">
                        {captureTitle(capture)}
                      </span>
                      <span className="block text-[12px] text-muted-foreground">
                        {exactDateTime(capture.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {t(capture.kind)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {sheet === "model" ? (
            <div className="sheet-up mx-auto mb-2 w-full max-w-[300px] overflow-hidden rounded-[20px] border border-hairline bg-surface/95 backdrop-blur-2xl">
              <p className="px-3.5 pt-2.5 pb-1 text-[9.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                {t("APIs de IA")}
              </p>
              <div className="max-h-[50vh] overflow-y-auto no-scrollbar">
                {availableModels.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-[13px] font-medium text-foreground">
                      {t("Nenhuma API adicionada")}
                    </p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {t("Adiciona a tua chave do Google Gemini, OpenAI ou Claude para começar.")}
                    </p>
                    <div className="mt-3.5 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSheet(null);
                          setAddApiModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm active:scale-95 transition-transform"
                      >
                        <Plus className="size-3.5" />
                        <span>{t("Adicionar API")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSheet(null);
                          void navigate({ to: "/home" });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-secondary/50 px-3 py-1.5 text-[12px] font-medium text-foreground active:scale-95 transition-transform"
                      >
                        <span>{t("Ver na Home")}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  availableModels.map((option) => (
                    <button
                      key={option.id}
                      onClick={async () => {
                        setModel(option.id);
                        setSheet(null);
                        if (conversationId && !conversationId.startsWith("local-conv-")) {
                          try {
                            localStorage.setItem(`griot_conv_model_${conversationId}`, option.id);
                          } catch {}
                        }
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left active:bg-secondary transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(() => {
                          const Logo = isModelOS(option.id)
                            ? GriotAiLogo
                            : getAiLogo(option.vendor || option.id.split(":")[0]);
                          return (
                            <div className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline/60 bg-surface">
                              <Logo className="size-3.5 text-foreground" />
                            </div>
                          );
                        })()}
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium leading-tight">
                            {option.label}
                          </span>
                          <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
                            {option.hint}
                          </span>
                        </span>
                      </div>
                      {model === option.id ? (
                        <Check className="size-[14px] shrink-0 text-foreground" />
                      ) : null}
                    </button>
                  ))
                )}
                <div className="border-t border-hairline/60 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      setAddApiModalOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-hairline bg-secondary/50 py-2 text-[12px] font-medium text-foreground hover:bg-secondary active:scale-[0.98] transition-all"
                  >
                    <Plus className="size-3.5" />
                    <span>{t("Ligar Nova API de IA")}</span>
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex gap-1 border-t border-hairline p-2">
                {EFFORTS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setEffort(option.id)}
                    className={`flex-1 rounded-xl px-1.5 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
                      effort === option.id ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Card de Permissão do Google Cloud Shell - Posicionado imediatamente acima da barra de texto */}
          {cloudShellRequired && (
            <div className="mb-2.5 overflow-hidden rounded-[24px] bg-card border border-white/[0.08] p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
              {/* Cabeçalho com Ícone e Nome do Serviço */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Terminal className="size-3.5" />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground">
                    Google Cloud Shell
                  </span>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Sandbox
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCloudShellRequired(false)}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Título e Explicação */}
              <div className="mt-2.5">
                <h4 className="text-[15px] font-semibold tracking-tight text-foreground">
                  {t("Permitir execução no Cloud Shell?")}
                </h4>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "O GRIOT precisa da sua aprovação para executar comandos pesados em ambiente sandbox na nuvem.",
                  )}
                </p>
                {cloudShellCmd ? (
                  <div className="mt-2.5 rounded-xl bg-secondary px-3 py-2 text-[11.5px] font-mono text-foreground/90 break-all select-all">
                    {cloudShellCmd}
                  </div>
                ) : null}
              </div>

              {/* Botões de Ação Perfeitamente Alinhados (Empilhados como no modelo de referência) */}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={connectingGoogle}
                  onClick={() => void handleConnectGoogleCloud()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
                >
                  <CloudLightning className="size-4" />
                  <span>
                    {connectingGoogle ? t("A ligar à Google...") : t("Ligar com a Google")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCloudShellRequired(false)}
                  className="flex h-10 w-full items-center justify-center rounded-2xl bg-secondary px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-transform active:scale-[0.98]"
                >
                  <span>{t("Recusar")}</span>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-hairline bg-surface/90 px-3 pt-3 pb-2.5 shadow-[0_22px_50px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
            {recording ? (
              <div className="flex items-center gap-3 py-1">
                <button
                  onClick={() => stopVoice(false)}
                  aria-label={t("Cancelar gravação")}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary active:scale-90"
                >
                  <X className="size-[18px]" />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="relative grid size-9 shrink-0 place-items-center">
                    <span className="pulse-ring absolute inset-0 rounded-full bg-destructive/30" />
                    <span className="size-2.5 rounded-full bg-destructive" />
                  </span>
                  <span className="flex h-8 flex-1 items-center gap-[3px]">
                    {levels.map((level, index) => (
                      <span
                        key={index}
                        className="w-[3px] rounded-full bg-foreground/70"
                        style={{
                          height: `${Math.round(level * 100)}%`,
                          opacity: 0.45 + level * 0.55,
                          transition: "height 90ms ease-out, opacity 90ms ease-out",
                        }}
                      />
                    ))}
                  </span>

                  <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                    {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                    {String(seconds % 60).padStart(2, "0")}
                  </span>
                </div>
                <button
                  onClick={() => stopVoice(true)}
                  aria-label={t("Concluir gravação")}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"
                >
                  <Check className="size-[18px]" />
                </button>
              </div>
            ) : (
              <>
                {pendingFiles.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                    {pendingFiles.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex max-w-[190px] items-center gap-1.5 rounded-full border border-hairline bg-secondary/80 px-2.5 py-1 text-[11.5px]"
                      >
                        {p.processing ? (
                          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{p.name}</span>
                        <button
                          type="button"
                          aria-label={t("Remover ficheiro")}
                          onClick={() => removePendingFile(p.id)}
                          className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground/10 active:scale-90"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <textarea
                  ref={textareaRef}

                  rows={1}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    const el = event.currentTarget;
                    el.style.height = "auto";
                    const nextHeight = Math.min(Math.max(el.scrollHeight, 24), 160);
                    el.style.height = `${nextHeight}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  onPaste={(event) => {
                    const items = event.clipboardData?.items;
                    if (items) {
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf("image") !== -1) {
                          const file = items[i].getAsFile();
                          if (file) {
                            event.preventDefault();
                            void attach(file);
                            return;
                          }
                        }
                      }
                    }
                  }}
                  placeholder={t("Escrever")}
                  className="max-h-40 w-full resize-none bg-transparent px-1.5 pb-2 text-[15.5px] outline-none placeholder:text-muted-foreground overflow-y-auto leading-relaxed transition-[height] duration-75"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSheet(sheet === "plus" ? null : "plus")}
                    aria-label={t("Adicionar")}
                    className={`grid size-9 shrink-0 place-items-center rounded-full bg-secondary transition-transform duration-300 active:scale-90 ${
                      sheet === "plus" ? "rotate-45" : ""
                    }`}
                  >
                    <Plus className="size-[18px]" />
                  </button>
                  {scope !== "quick" && (
                    <button
                      onClick={() => {
                        if (availableModels.length === 0) {
                          setAddApiModalOpen(true);
                        } else {
                          setSheet(sheet === "model" ? null : "model");
                        }
                      }}
                      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all ${
                        availableModels.length === 0
                          ? "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                          : "bg-secondary text-foreground hover:bg-secondary/80 border border-hairline/60"
                      }`}
                    >
                      {availableModels.length > 0 &&
                        (() => {
                          const savedApis = getUserSavedApis();
                          const found = savedApis.find((a) => a.id === model);
                          const provId = found?.providerId || model.split(":")[0];
                          const Logo = isModelOS(model)
                            ? GriotAiLogo
                            : getAiLogo(provId);
                          return <Logo className="size-3.5 shrink-0 text-foreground" />;
                        })()}
                      <span className="truncate">
                        {(() => {
                          if (availableModels.length === 0) return t("+ Adicionar API");
                          const raw = modelLabel(model);
                          return raw.length > 12 ? `${raw.slice(0, 12)}…` : raw;
                        })()}
                      </span>
                      <ChevronDown
                        className={`size-4 ${
                          availableModels.length === 0 ? "text-primary/70" : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={() => (voiceChat ? stopVoiceChat() : void startVoiceChat())}
                    aria-label={voiceChat ? t("Terminar conversa por voz") : t("Conversa por voz")}
                    aria-pressed={voiceChat}
                    className={`grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-200 active:scale-90 ${
                      voiceChat ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}
                  >
                    <AudioLines className="size-[18px]" />
                  </button>

                  {(() => {
                    const canSend = draft.trim().length > 0 || pendingFiles.length > 0;
                    return (
                      <button
                        onMouseDown={(event) => {
                          if (!busy && canSend) event.preventDefault();
                        }}
                        onClick={() =>
                          busy ? handleStop() : canSend ? void send(draft) : startVoice()
                        }
                        aria-label={busy ? t("Parar") : canSend ? t("Enviar") : t("Gravar")}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 active:scale-90"
                      >
                        {busy ? (
                          <Square className="size-3.5 fill-current" />
                        ) : canSend ? (
                          <ArrowUp className="size-[18px]" />
                        ) : (
                          <Mic className="size-[18px]" />
                        )}
                      </button>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Modal para Adicionar API de IA diretamente dentro do Chat */}
      <AddApiModal
        open={addApiModalOpen}
        onClose={() => setAddApiModalOpen(false)}
        onSuccess={(savedApi) => {
          setApisRevision((r) => r + 1);
          setModel(savedApi.id || savedApi.providerId);
          setSheet(null);
        }}
      />

      {/* Modal de Pré-visualização da Aplicação Web do Workspace */}
      <FunctionalPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        srcDoc={generatePreviewSrcDoc(workspaceFiles)}
        title={t("Pré-visualização da Aplicação Web")}
      />

      {/* Modal do Gestor de Plugins Reais */}
      {pluginsViewOpen && (
        <div
          className="fixed inset-0 z-50 bg-background overflow-y-auto overscroll-contain animate-in fade-in duration-200"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <PluginsView onBack={() => setPluginsViewOpen(false)} />
        </div>
      )}

      {/* Modal de Autonomous Task vinculado ao projeto */}
      {currentChatProjectId && (
        <AutonomousTaskModal
          open={autonomousTaskModalOpen}
          onClose={() => setAutonomousTaskModalOpen(false)}
          projectId={currentChatProjectId}
          initialInstruction={autonomousTaskInstruction}
          createdFrom="chat"
          onTaskCreated={() => {
            toast.success(t("Autonomous Task criada e agendada no projeto!"));
          }}
        />
      )}
    </div>
  );
}
