import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  MessageSquare,
  Trash2,
  Sparkles,
  Clock,
  Lock,
  Calendar,
  GitBranch,
} from "lucide-react";
import {
  setActiveProject,
  deleteProject,
  getLocalProjectsSync,
  getProjectTasks,
  saveProjectTasks,
  fetchProjectTasksFromDb,
  createProjectTaskInDb,
  updateProjectTaskStatusInDb,
  fetchProjectRepositoryBinding,
  bindProjectRepository,
  unbindProjectRepository,
  fetchProjectComputeRuns,
  fetchProjectOpbEvents,
  type ProjectTaskItem,
} from "@/lib/project-service";
import { getConnectedPlugins } from "@/lib/plugins-service";
import { ConfirmationModal } from "@/components/griot/confirmation-modal";
import { AutonomousTaskModal } from "@/components/griot/autonomous-task-modal";

export type ProjectDetail = {
  id: string;
  name: string;
  description?: string | null;
  progress?: number | null;
  status?: string | null;
  created_at: string;
};

export type TaskRow = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
};

export type PrRow = {
  id: string;
  title: string;
  branch: string;
  status: string;
};

export type LogRow = {
  id: string;
  source: string;
  timeAgo: string;
  message: string;
};

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return "recentemente";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days}d`;
  } catch {
    return "recentemente";
  }
}

type ProjectTab = "tasks" | "prs" | "logs";

export interface ProjectDetailViewProps {
  projectId: string;
  onBack?: () => void;
  onDeleted?: (deletedId: string) => void;
}

export function ProjectDetailView({ projectId, onBack, onDeleted }: ProjectDetailViewProps) {
  const t = useT();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetail | null>(() => {
    if (typeof window === "undefined") return null;
    const local = getLocalProjectsSync().find((p) => p.id === projectId);
    if (local) return local;
    return null;
  });

  const [activeTab, setActiveTab] = useState<ProjectTab>("tasks");
  const [tasks, setTasks] = useState<ProjectTaskItem[]>(() => {
    return getProjectTasks(projectId);
  });
  const [autonomousModalOpen, setAutonomousModalOpen] = useState(false);
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [repoBinding, setRepoBinding] = useState<any | null>(null);

  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBindInput, setShowBindInput] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setActiveProject(projectId);

    // Carregar do localStorage imediatamente
    const local = getLocalProjectsSync().find((p) => p.id === projectId);
    if (local) {
      setProject(local);
    }

    const savedTasks = getProjectTasks(projectId);
    if (savedTasks.length > 0) {
      setTasks(savedTasks);
    }

    let cancelled = false;
    async function loadDetail() {
      try {
        const [projectRes, dbTasks, binding, computeRuns, opbEvents] = await Promise.all([
          (supabase as any)
            .from("griot_studio_projects")
            .select("id, name, description, brief, created_at, updated_at")
            .eq("id", projectId)
            .maybeSingle(),
          fetchProjectTasksFromDb(projectId),
          fetchProjectRepositoryBinding(projectId),
          fetchProjectComputeRuns(projectId),
          fetchProjectOpbEvents(projectId),
        ]);

        if (cancelled) return;

        const data = projectRes?.data;
        if (data) {
          setProject({
            id: data.id,
            name: data.name,
            description: data.description || data.brief?.goal || "Projeto GRIOT Studio",
            progress: typeof data.brief?.progress === "number" ? data.brief.progress : 85,
            status: data.brief?.build_status || "ativo",
            created_at: data.created_at,
          });
        }

        // Tarefas Reais do Supabase
        if (Array.isArray(dbTasks)) {
          setTasks(dbTasks);
        }

        // Repositório e Pull Requests Reais
        setRepoBinding(binding);
        if (binding?.repository_full_name) {
          try {
            const plugins = getConnectedPlugins();
            const ghToken = plugins["github"]?.apiKey || "";
            const headers: Record<string, string> = {
              Accept: "application/vnd.github.v3+json",
            };
            if (ghToken) {
              headers.Authorization = `Bearer ${ghToken}`;
            }

            const response = await fetch(
              `https://api.github.com/repos/${binding.repository_full_name}/pulls?state=all&per_page=15`,
              { headers },
            );

            if (response.ok) {
              const pullRequests = await response.json();
              if (Array.isArray(pullRequests)) {
                setPrs(
                  pullRequests.map((pr: any) => ({
                    id: String(pr.id || pr.number),
                    title: pr.title || `PR #${pr.number}`,
                    branch: pr.head?.ref || binding.default_branch || "main",
                    status: pr.state === "open" ? "open" : pr.merged_at ? "merged" : "closed",
                  })),
                );
              }
            } else {
              setPrs([]);
            }
          } catch (ghErr) {
            console.warn("Erro ao buscar PRs do GitHub:", ghErr);
            setPrs([]);
          }
        } else {
          setPrs([]);
        }

        // Logs Reais do GRIOT Sandbox e OPB
        const allLogs: LogRow[] = [];

        if (Array.isArray(computeRuns)) {
          for (const run of computeRuns) {
            const providerName =
              run.provider === "container" || run.provider === "griot_sandbox"
                ? "GRIOT SANDBOX"
                : run.provider.toUpperCase();
            const refText =
              run.repository_ref ||
              (run.source_commit_sha ? run.source_commit_sha.slice(0, 7) : "");
            allLogs.push({
              id: `run_${run.id}`,
              source: providerName,
              timeAgo: relativeTime(run.created_at),
              message: `Execução ${run.status}${refText ? ` (${refText})` : ""}: ${run.internal_run_id?.slice(0, 8) || "run"}`,
            });
          }
        }

        if (Array.isArray(opbEvents)) {
          for (const e of opbEvents) {
            allLogs.push({
              id: `opb_${e.id}`,
              source: "OPB",
              timeAgo: relativeTime(e.created_at),
              message: `${e.event_type.replace(/_/g, " ")}: ${e.payload?.receiptId || e.payload?.messageId || "processado"}`,
            });
          }
        }

        setLogs(allLogs);
      } catch (err) {
        console.warn("Carregamento do projeto:", err);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** Abre a conversa vinculada a este projeto; se não existir, pede para ligar uma. */
  async function openProjectChat() {
    setActiveProject(projectId);
    let convId: string | null = null;
    let convRow: any = null;

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("griot_conversations_v1");
        if (raw) {
          const list: any[] = JSON.parse(raw);
          const match = list
            .filter((c) => c?.project_id === projectId && !c?.archived)
            .sort((a, b) =>
              String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
            )[0];
          if (match) {
            convId = match.id;
            convRow = match;
          }
        }
      } catch {}
    }

    if (!convId) {
      try {
        const { data } = await (supabase as any)
          .from("griot_conversations")
          .select("id, title, updated_at, project_id")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) {
          convId = data.id;
          convRow = {
            id: data.id,
            scope: "main",
            title: data.title || project?.name || "Conversa do Projeto",
            pinned: false,
            archived: false,
            project_id: projectId,
            updated_at: data.updated_at,
          };
        }
      } catch {}
    }

    if (!convId) {
      toast.error(
        t(
          "Este projeto ainda não tem conversa ligada. Abre o Chat, escolhe o projeto no menu da conversa e ela fica ligada aqui.",
        ),
      );
      return;
    }

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("griot_conversations_v1");
        const list: any[] = raw ? JSON.parse(raw) : [];
        if (convRow && !list.some((c) => c?.id === convId)) {
          list.push(convRow);
          localStorage.setItem("griot_conversations_v1", JSON.stringify(list));
        }
        localStorage.setItem("griot_active_main_conv_id", convId);
      } catch {}
    }

    void navigate({ to: "/chat" });
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    const title = newTaskTitle.trim();
    setNewTaskTitle("");
    setAddingTask(false);

    // Adição otimista imediata
    const tempId = `t_${Date.now()}`;
    const optimTask: ProjectTaskItem = {
      id: tempId,
      title,
      status: "todo",
      created_at: new Date().toISOString(),
    };
    const updated = [optimTask, ...tasks];
    setTasks(updated);
    saveProjectTasks(projectId, updated);
    toast.success(t("Tarefa adicionada!"));

    // Persistência real no Supabase
    try {
      const created = await createProjectTaskInDb(projectId, title);
      if (created) {
        setTasks((prev) =>
          prev.map((item) => (item.id === tempId ? { ...item, id: created.id } : item)),
        );
      }
    } catch (err) {
      console.warn("Erro ao persistir tarefa no Supabase:", err);
    }
  }

  function cycleTaskStatus(id: string) {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;

    let nextStatus: ProjectTaskItem["status"] = "todo";
    if (target.status === "todo" || target.status === "scheduled") nextStatus = "doing";
    else if (target.status === "doing" || target.status === "running") nextStatus = "done";
    else nextStatus = "todo";

    const updated = tasks.map((task) => {
      if (task.id !== id) return task;
      return { ...task, status: nextStatus };
    });
    setTasks(updated);
    saveProjectTasks(projectId, updated);

    // Atualização real em griot_studio_tasks
    void updateProjectTaskStatusInDb(id, nextStatus);
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      toast.success(t("Projeto eliminado com sucesso!"));
      setShowDeleteModal(false);
      if (onDeleted) {
        onDeleted(projectId);
      } else if (onBack) {
        onBack();
      } else {
        void navigate({ to: "/projects" });
      }
    } catch {
      toast.error(t("Erro ao eliminar o projeto."));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleBindRepo() {
    if (!repoInput.trim() || !projectId) return;
    const clean = repoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "");
    const parts = clean.split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      toast.error(t("Introduza no formato dono/repositório (ex: utilizador/webapp)"));
      return;
    }
    const [owner, repo] = parts;
    setIsBinding(true);
    try {
      const res = await bindProjectRepository({ projectId, owner, repo });
      if (res.success && res.binding) {
        setRepoBinding(res.binding);
        setShowBindInput(false);
        setRepoInput("");
        toast.success(t("Repositório vinculado com sucesso!"));

        // Atualizar PRs imediatamente
        try {
          const plugins = getConnectedPlugins();
          const ghToken = plugins["github"]?.apiKey || "";
          const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
          if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
          const response = await fetch(
            `https://api.github.com/repos/${res.binding.repository_full_name || `${owner}/${repo}`}/pulls?state=all&per_page=15`,
            { headers },
          );
          if (response.ok) {
            const pullRequests = await response.json();
            if (Array.isArray(pullRequests)) {
              setPrs(
                pullRequests.map((pr: any) => ({
                  id: String(pr.id || pr.number),
                  title: pr.title || `PR #${pr.number}`,
                  branch: pr.head?.ref || res.binding.default_branch || "main",
                  status: pr.state === "open" ? "open" : pr.merged_at ? "merged" : "closed",
                })),
              );
            }
          }
        } catch {}
      } else {
        toast.error(res.error || t("Falha ao vincular repositório."));
      }
    } catch (err: any) {
      toast.error(err?.message || t("Erro ao vincular repositório."));
    } finally {
      setIsBinding(false);
    }
  }

  async function handleUnbindRepo() {
    if (!projectId) return;
    try {
      const res = await unbindProjectRepository(projectId);
      if (res.success) {
        setRepoBinding(null);
        setPrs([]);
        toast.success(t("Repositório desvinculado."));
      } else {
        toast.error(res.error || t("Falha ao desvincular."));
      }
    } catch (err: any) {
      toast.error(err?.message || t("Erro ao desvincular repositório."));
    }
  }

  const prog = Math.min(100, Math.max(0, Number(project?.progress ?? 0)));

  return (
    <div className="min-h-screen bg-background text-foreground px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-32">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onBack || (() => void navigate({ to: "/projects" }))}
            aria-label={t("Voltar aos Projetos")}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary border border-hairline text-foreground transition-transform active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="truncate min-w-0 flex-1 text-[24px] sm:text-[30px] font-bold tracking-tight text-foreground leading-snug py-0.5">
            {project?.name || t("Projeto")}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void openProjectChat()}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-transform active:scale-95"
          >
            <MessageSquare className="size-3.5" />
            <span>{t("Chat")}</span>
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            aria-label={t("Eliminar projeto")}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-hairline transition-all active:scale-90"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Project Overview Card */}
      <div className="mb-6 rounded-[22px] border border-hairline bg-surface p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">
            {project?.status || t("Ativo")}
          </span>
          <span className="text-[14px] font-bold text-foreground tabular-nums">{prog}%</span>
        </div>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground font-normal line-clamp-2">
          {project?.description || t("Projeto de automação GRIOT Mobile")}
        </p>
        <div className="mt-3.5 h-[3.5px] w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${prog}%` }}
          />
        </div>
      </div>

      {/* Pill Tab Switcher Container */}
      <div className="mb-6 rounded-full border border-hairline bg-surface p-1.5 flex items-center justify-between">
        {(["tasks", "prs", "logs"] as const).map((tabKey) => {
          const label = tabKey === "tasks" ? t("Tarefas") : tabKey === "prs" ? "PRs" : "Logs";
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`flex-1 rounded-full py-2.5 text-center text-[14.5px] font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: TAREFAS */}
      {activeTab === "tasks" && (
        <div className="space-y-3 rise">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => cycleTaskStatus(task.id)}
              className="flex cursor-pointer flex-col gap-2 rounded-[22px] border border-hairline bg-surface p-4 shadow-xs active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {task.autonomous && <Sparkles className="size-4 shrink-0 text-primary" />}
                  <span className="text-[15px] font-semibold text-foreground tracking-snug truncate">
                    {task.title}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider shrink-0 ${
                    task.status === "done" || task.status === "completed"
                      ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
                      : task.status === "doing" || task.status === "running"
                        ? "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                        : task.status === "scheduled"
                          ? "bg-sky-500/15 text-sky-500 border border-sky-500/20"
                          : task.status === "failed"
                            ? "bg-destructive/15 text-destructive border border-destructive/20"
                            : "bg-secondary text-muted-foreground border border-hairline"
                  }`}
                >
                  {task.status}
                </span>
              </div>

              {task.autonomous && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-hairline/50 text-[11px] text-muted-foreground">
                  {task.autonomous.runAtTime && (
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3 text-muted-foreground" />
                      {task.autonomous.runAtTime}
                    </span>
                  )}
                  {task.autonomous.repeat && (
                    <span className="flex items-center gap-1 capitalize">
                      • {task.autonomous.repeat}
                    </span>
                  )}
                  {task.autonomous.secretRefs && task.autonomous.secretRefs.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3 text-muted-foreground" />
                      {task.autonomous.secretRefs.length} secrets
                    </span>
                  )}
                  {task.autonomous.pipeline && task.autonomous.pipeline.length > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                      {task.autonomous.pipeline.map((p) => (
                        <span
                          key={p}
                          className="rounded-md border border-hairline bg-background/80 px-1.5 py-0.2 text-[9.5px] uppercase font-mono font-medium"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="rounded-[22px] border border-hairline bg-surface p-6 text-center text-muted-foreground text-[14px]">
              {t("Nenhuma tarefa criada para este projeto.")}
            </div>
          )}

          {addingTask ? (
            <div className="rounded-[22px] border border-hairline bg-surface p-4 rise">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder={t("Nome da tarefa")}
                className="w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={addTask}
                  disabled={!newTaskTitle.trim()}
                  className="flex-1 rounded-xl bg-primary py-2 text-[14px] font-medium text-primary-foreground disabled:opacity-40"
                >
                  {t("Adicionar Tarefa")}
                </button>
                <button
                  onClick={() => setAddingTask(false)}
                  className="rounded-xl border border-hairline px-4 py-2 text-[14px] text-muted-foreground"
                >
                  {t("Cancelar")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutonomousModalOpen(true)}
                className="flex flex-1 items-center justify-center rounded-[22px] border border-primary/40 bg-primary/10 py-3 text-[14px] font-medium text-primary active:scale-[0.98] transition-colors"
              >
                {t("Autonomous Task")}
              </button>
              <button
                onClick={() => setAddingTask(true)}
                className="flex items-center justify-center rounded-[22px] border border-dashed border-hairline bg-surface/50 px-5 py-3 text-[14px] font-medium text-muted-foreground active:scale-[0.98]"
              >
                {t("Rápida")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PRs */}
      {activeTab === "prs" && (
        <div className="space-y-3 rise">
          {repoBinding ? (
            <div className="flex items-center justify-between rounded-[22px] border border-hairline bg-surface/60 px-4 py-3 text-[13px] font-mono text-muted-foreground shadow-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <GitBranch className="size-4 shrink-0 text-primary" />
                <span className="truncate font-semibold text-foreground">
                  {repoBinding.repository_full_name}
                </span>
                <span className="shrink-0 text-[11px] rounded-full bg-secondary px-2 py-0.5 font-semibold">
                  {repoBinding.default_branch || repoBinding.ref || "main"}
                </span>
              </div>
              <button
                onClick={handleUnbindRepo}
                className="ml-2 text-muted-foreground hover:text-destructive active:scale-95 transition-colors p-1"
                title={t("Desvincular Repositório")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ) : showBindInput ? (
            <div className="rounded-[22px] border border-hairline bg-surface p-4 rise space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-primary shrink-0" />
                <span className="text-[14px] font-semibold text-foreground">
                  {t("Vincular Repositório GitHub")}
                </span>
              </div>
              <input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="ex: utilizador/nome-do-repo"
                className="w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-[14px] font-mono text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleBindRepo}
                  disabled={isBinding || !repoInput.trim()}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-[14px] font-medium text-primary-foreground disabled:opacity-40 active:scale-[0.98]"
                >
                  {isBinding ? t("A verificar no servidor...") : t("Vincular")}
                </button>
                <button
                  onClick={() => {
                    setShowBindInput(false);
                    setRepoInput("");
                  }}
                  disabled={isBinding}
                  className="rounded-xl border border-hairline px-4 py-2.5 text-[14px] text-muted-foreground active:scale-[0.98]"
                >
                  {t("Cancelar")}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[22px] border border-hairline bg-surface p-6 text-center space-y-3 shadow-xs">
              <p className="text-muted-foreground text-[14px]">
                {t("Nenhum repositório GitHub vinculado a este projeto.")}
              </p>
              <button
                onClick={() => setShowBindInput(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 text-[13.5px] font-medium text-primary active:scale-[0.98] transition-all"
              >
                <GitBranch className="size-4" />
                {t("Vincular Repositório")}
              </button>
            </div>
          )}

          {repoBinding && prs.length === 0 && (
            <div className="rounded-[22px] border border-hairline bg-surface p-6 text-center text-muted-foreground text-[14px]">
              {t("Nenhum Pull Request aberto ou fechado neste repositório.")}
            </div>
          )}

          {repoBinding &&
            prs.length > 0 &&
            prs.map((pr) => (
              <div
                key={pr.id}
                className="rounded-[22px] border border-hairline bg-surface p-4 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15.5px] font-semibold text-foreground tracking-snug">
                    {pr.title}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[11.5px] font-semibold uppercase tracking-wider shrink-0 ${
                      pr.status === "merged"
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/20"
                        : pr.status === "open"
                          ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
                          : "bg-secondary text-muted-foreground border border-hairline"
                    }`}
                  >
                    {pr.status}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] font-mono text-muted-foreground">{pr.branch}</p>
              </div>
            ))}
        </div>
      )}

      {/* TAB 3: LOGS */}
      {activeTab === "logs" && (
        <div className="space-y-3 rise">
          {logs.length === 0 ? (
            <div className="rounded-[22px] border border-hairline bg-surface p-6 text-center text-muted-foreground text-[14px]">
              {t("Nenhum registo de execução encontrado para este projeto.")}
            </div>
          ) : (
            <div className="rounded-[22px] border border-hairline bg-surface p-4 shadow-xs space-y-3">
              {logs.map((log, index) => (
                <div key={log.id}>
                  {index > 0 && <div className="border-b border-hairline my-3" />}
                  <p className="text-[12px] text-muted-foreground font-mono mb-1">
                    {log.source} · {log.timeAgo}
                  </p>
                  <p className="text-[15px] font-semibold text-foreground leading-snug">
                    {log.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal to Delete Project */}
      <ConfirmationModal
        open={showDeleteModal}
        title={t("Eliminar Projeto")}
        description={t(
          `Tens a certeza que desejas eliminar permanentemente o projeto "${project?.name || ""}"? Esta ação não pode ser desfeita.`,
        )}
        confirmLabel={isDeleting ? t("A eliminar...") : t("Eliminar")}
        cancelLabel={t("Cancelar")}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onClose={() => setShowDeleteModal(false)}
      />

      {/* Modal de Autonomous Task */}
      <AutonomousTaskModal
        open={autonomousModalOpen}
        onClose={() => setAutonomousModalOpen(false)}
        projectId={projectId}
        createdFrom="project"
        onTaskCreated={(newTask) => {
          setTasks((prev) => [newTask, ...prev]);
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Projeto — GRIOT Mobile" },
      {
        name: "description",
        content: "Detalhes do Projeto",
      },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const params = useParams({ strict: false }) as { projectId?: string };
  const navigate = useNavigate();
  const projectId = params?.projectId || "";

  return (
    <ProjectDetailView
      projectId={projectId}
      onBack={() => void navigate({ to: "/projects" })}
      onDeleted={() => void navigate({ to: "/projects" })}
    />
  );
}
