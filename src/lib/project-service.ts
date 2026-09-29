/**
 * GRIOT Unified Project Service
 *
 * Fonte da verdade única para projetos no GRIOT Mobile.
 * Lê e sincroniza entre localStorage ('griot_local_projects') e Supabase ('griot_studio_projects').
 * Mantém o projeto ativo em 'griot_active_project_id' e emite eventos de atualização.
 */

import { supabase } from "@/integrations/supabase/client";
import { callGriotStudioApi } from "@/lib/griot-api";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export interface GriotProject {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: string;
  created_at: string;
  updated_at?: string;
}

export function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export function generateCanonicalUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_PROJECTS_KEY = "griot_local_projects";
const STORAGE_ACTIVE_PROJECT_KEY = "griot_active_project_id";
const STORAGE_DELETED_PROJECTS_KEY = "griot_deleted_projects";
const STORAGE_TASKS_PREFIX = "griot_tasks_";

function getDeletedProjectIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_DELETED_PROJECTS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedProjectId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = getDeletedProjectIds();
    set.add(id);
    localStorage.setItem(STORAGE_DELETED_PROJECTS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Obtém a lista unificada de projetos armazenados localmente e no Supabase.
 */
export async function getUnifiedProjects(): Promise<GriotProject[]> {
  const deletedIds = getDeletedProjectIds();
  let localList: GriotProject[] = [];
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (stored) {
        const parsed: GriotProject[] = JSON.parse(stored);
        localList = parsed.filter((p) => !deletedIds.has(p.id));
        // Migra IDs legados não-UUID em localList para UUIDs canónicos
        let migratedLocal = false;
        for (const p of localList) {
          if (!isValidUuid(p.id)) {
            p.id = generateCanonicalUuid();
            migratedLocal = true;
          }
        }
        if (migratedLocal) {
          localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(localList));
        }
      }
    } catch (err) {
      console.warn("Erro ao ler projetos locais:", err);
    }
  }

  try {
    const { data: userAuth } = await supabase.auth.getUser();
    if (userAuth?.user) {
      const { data: rawProjects, error: projErr } = await (supabase as any)
        .from("griot_studio_projects")
        .select("id, name, description, brief, archived, created_at, updated_at")
        .eq("archived", false)
        .order("updated_at", { ascending: false });

      if (!projErr && Array.isArray(rawProjects) && rawProjects.length > 0) {
        const remoteList: GriotProject[] = rawProjects
          .filter((p: any) => !deletedIds.has(p.id))
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description || p.brief?.goal || "Projeto GRIOT Studio",
            progress: typeof p.brief?.progress === "number" ? p.brief.progress : 0,
            status: p.brief?.build_status || "ativo",
            created_at: p.created_at,
            updated_at: p.updated_at,
          }));

        for (const rem of remoteList) {
          if (!localList.some((l) => l.id === rem.id)) {
            localList.push(rem);
          }
        }

        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(localList));
        }
      }
    }
  } catch (err) {}

  return localList;
}

/**
 * Obtém os projetos síncronos da memória local para carregamento instantâneo.
 */
export function getLocalProjectsSync(): GriotProject[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Obtém o projeto atualmente ativo.
 */
export function getActiveProjectSync(): GriotProject | null {
  const projects = getLocalProjectsSync();
  if (projects.length === 0) return null;

  if (typeof window !== "undefined") {
    const activeId = localStorage.getItem(STORAGE_ACTIVE_PROJECT_KEY);
    if (activeId) {
      const found = projects.find((p) => p.id === activeId);
      if (found) return found;
    }
  }

  return projects[0];
}

/**
 * Define o projeto ativo e notifica os componentes através de evento.
 */
export function setActiveProject(projectId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, projectId);
  window.dispatchEvent(new CustomEvent("griot-active-project-changed", { detail: projectId }));
}

/**
 * Guarda ou adiciona um novo projeto, definindo-o automaticamente como ativo.
 */
export async function saveProject(
  project: Partial<GriotProject> & { name: string },
): Promise<GriotProject> {
  const projectId = project.id && isValidUuid(project.id) ? project.id : generateCanonicalUuid();
  const newProj: GriotProject = {
    id: projectId,
    name: project.name.trim(),
    description: project.description?.trim() || "Projeto de automação GRIOT",
    progress: typeof project.progress === "number" ? project.progress : 0,
    status: project.status || "ativo",
    created_at: project.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const list = getLocalProjectsSync();
  const existingIdx = list.findIndex((p) => p.id === newProj.id);
  if (existingIdx >= 0) {
    list[existingIdx] = newProj;
  } else {
    list.unshift(newProj);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(list));
    localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, newProj.id);
    window.dispatchEvent(new CustomEvent("griot-active-project-changed", { detail: newProj.id }));
  }

  try {
    const { data: userAuth } = await supabase.auth.getUser();
    if (userAuth?.user) {
      const workspaceId = await getCurrentWorkspaceId(userAuth.user.id);
      if (workspaceId) {
        await (supabase as any).from("griot_studio_projects").upsert({
          id: newProj.id,
          workspace_id: workspaceId,
          owner_id: userAuth.user.id,
          name: newProj.name,
          description: newProj.description,
          brief: {
            goal: newProj.name,
            stack: "REACT",
            progress: newProj.progress,
            build_status: newProj.status,
          },
          archived: false,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn("[project-service] Falha ao sincronizar projeto com Supabase:", err);
  }

  return newProj;
}

/**
 * Garante que existe sempre um projeto ativo com ID UUID válido,
 * pronto para execução no GRIOT Sandbox ou localmente.
 */
export async function ensureActiveProject(): Promise<GriotProject> {
  const currentActive = getActiveProjectSync();
  if (currentActive && isValidUuid(currentActive.id)) {
    return currentActive;
  }

  // Se o ativo actual tem ID inválido (ex: proj_...), migra para UUID canónico
  if (currentActive && !isValidUuid(currentActive.id)) {
    const migrated = await saveProject({
      ...currentActive,
      id: generateCanonicalUuid(),
    });
    return migrated;
  }

  // Tenta obter dos unificados
  const list = await getUnifiedProjects();
  const valid = list.find((p) => isValidUuid(p.id));
  if (valid) {
    setActiveProject(valid.id);
    return valid;
  }

  // Se nenhum existir, cria o projeto workspace padrão
  const created = await saveProject({
    name: "GRIOT Workspace",
    description: "Espaço de trabalho e execução isolada GRIOT Sandbox",
  });
  return created;
}

/**
 * Elimina um projeto local e remotamente, limpando referências e impedindo ressurreição.
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  if (!projectId) return false;

  // Marcar na blacklist para nunca ser ressuscitado por cache remota
  addDeletedProjectId(projectId);

  if (typeof window !== "undefined") {
    try {
      const list = getLocalProjectsSync().filter((p) => p.id !== projectId);
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(list));
      localStorage.removeItem(`${STORAGE_TASKS_PREFIX}${projectId}`);

      const currentActive = localStorage.getItem(STORAGE_ACTIVE_PROJECT_KEY);
      if (currentActive === projectId) {
        const nextActiveId = list[0]?.id || "";
        if (nextActiveId) {
          localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, nextActiveId);
        } else {
          localStorage.removeItem(STORAGE_ACTIVE_PROJECT_KEY);
        }
        window.dispatchEvent(
          new CustomEvent("griot-active-project-changed", { detail: nextActiveId }),
        );
      }
    } catch (err) {
      console.warn("Erro ao eliminar projeto local:", err);
    }
  }

  // Tentar arquivar/eliminar no Supabase se autenticado
  try {
    await (supabase as any)
      .from("griot_studio_projects")
      .update({ archived: true })
      .eq("id", projectId);
  } catch {}

  return true;
}

/**
 * Obtém as tarefas persistidas de um projeto.
 */
export function getProjectTasks(projectId: string): any[] {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_TASKS_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Guarda as tarefas de um projeto localmente.
 */
export function saveProjectTasks(projectId: string, tasks: any[]): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.setItem(`${STORAGE_TASKS_PREFIX}${projectId}`, JSON.stringify(tasks));
  } catch {}
}

export interface AutonomousTaskPayload {
  instruction: string;
  runAtTime?: string; // ex: "20:00"
  runAtDate?: string; // ex: "2026-09-20"
  timezone?: string; // ex: "Europe/Lisbon"
  repeat?: "once" | "daily" | "weekly" | "monthly";
  secretRefs?: string[]; // ex: ["VERCEL_TOKEN", "GITHUB_TOKEN"]
  pipeline?: Array<"plan" | "build" | "test" | "publish">;
  createdFrom?: "project" | "chat";
}

export interface ProjectTaskItem {
  id: string;
  title: string;
  status:
    "todo" | "doing" | "done" | "scheduled" | "running" | "completed" | "failed" | "cancelled";
  rawStatus?: string;
  created_at: string;
  autonomous?: AutonomousTaskPayload;
}

/**
 * Carrega as tarefas reais do Supabase para um projeto (griot_studio_tasks),
 * com suporte transparente para tarefas normais e Autonomous Tasks enriquecidas.
 */
export async function fetchProjectTasksFromDb(projectId: string): Promise<ProjectTaskItem[]> {
  if (!projectId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("griot_studio_tasks")
      .select("id, project_id, workspace_id, created_by, title, status, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Erro ao buscar tarefas do Supabase:", error.message);
      return getProjectTasks(projectId);
    }

    if (Array.isArray(data)) {
      const mapped: ProjectTaskItem[] = data.map((t: any) => {
        let displayTitle = t.title;
        let autonomousMeta: AutonomousTaskPayload | undefined = undefined;

        if (
          typeof t.title === "string" &&
          (t.title.startsWith('{"__griot_task"') || t.title.startsWith('{"instruction"'))
        ) {
          try {
            const parsed = JSON.parse(t.title);
            if (parsed.instruction) {
              displayTitle = parsed.instruction;
              autonomousMeta = parsed;
            }
          } catch {}
        }

        let normalizedStatus: ProjectTaskItem["status"] = "todo";
        const raw = String(t.status || "").toLowerCase();
        if (raw === "completed" || raw === "done") normalizedStatus = "done";
        else if (raw === "in_progress" || raw === "doing") normalizedStatus = "doing";
        else if (raw === "scheduled") normalizedStatus = "scheduled";
        else if (raw === "running") normalizedStatus = "running";
        else if (raw === "failed") normalizedStatus = "failed";
        else if (raw === "cancelled") normalizedStatus = "cancelled";
        else normalizedStatus = "todo";

        return {
          id: t.id,
          title: displayTitle,
          status: normalizedStatus,
          rawStatus: t.status,
          created_at: t.created_at,
          autonomous: autonomousMeta,
        };
      });

      saveProjectTasks(projectId, mapped);
      return mapped;
    }
  } catch (err) {
    console.warn("Falha de rede ao buscar tarefas:", err);
  }
  return getProjectTasks(projectId);
}

/**
 * Cria uma tarefa real no Supabase na tabela griot_studio_tasks.
 * Suporta tanto títulos simples como payloads enriquecidos de Autonomous Tasks.
 */
export async function createProjectTaskInDb(
  projectId: string,
  titleOrPayload: string | AutonomousTaskPayload,
  initialStatus: string = "todo",
): Promise<ProjectTaskItem | null> {
  if (!projectId) return null;

  const isPayload = typeof titleOrPayload === "object" && titleOrPayload !== null;
  const rawInstruction = isPayload ? titleOrPayload.instruction.trim() : titleOrPayload.trim();
  if (!rawInstruction) return null;

  const storedTitle = isPayload
    ? JSON.stringify({ __griot_task: true, ...titleOrPayload })
    : rawInstruction;

  const dbStatus = isPayload
    ? titleOrPayload.runAtTime
      ? "scheduled"
      : initialStatus
    : initialStatus;

  try {
    const { data: userAuth } = await supabase.auth.getUser();
    const userId = userAuth?.user?.id;

    let workspaceId: string | null = null;
    if (userId) {
      const { data: member } = await (supabase as any)
        .from("griot_workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (member?.workspace_id) workspaceId = member.workspace_id;
    }

    if (!workspaceId) {
      const { data: proj } = await (supabase as any)
        .from("griot_studio_projects")
        .select("workspace_id")
        .eq("id", projectId)
        .maybeSingle();
      if (proj?.workspace_id) workspaceId = proj.workspace_id;
    }

    if (workspaceId && userId) {
      const { data, error } = await (supabase as any)
        .from("griot_studio_tasks")
        .insert({
          project_id: projectId,
          workspace_id: workspaceId,
          created_by: userId,
          title: storedTitle,
          status: dbStatus,
        })
        .select("id, title, status, created_at")
        .single();

      if (!error && data) {
        return {
          id: data.id,
          title: rawInstruction,
          status: dbStatus as any,
          rawStatus: dbStatus,
          created_at: data.created_at,
          autonomous: isPayload ? titleOrPayload : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("Falha ao criar tarefa no Supabase:", err);
  }

  // Fallback local se estiver offline ou deslogado
  return {
    id: `t_${Date.now()}`,
    title: rawInstruction,
    status: dbStatus as any,
    rawStatus: dbStatus,
    created_at: new Date().toISOString(),
    autonomous: isPayload ? titleOrPayload : undefined,
  };
}

/**
 * Atualiza o status de uma tarefa real em griot_studio_tasks.
 */
export async function updateProjectTaskStatusInDb(
  taskId: string,
  nextStatus: string,
): Promise<boolean> {
  if (!taskId) return false;

  let dbStatus = nextStatus;
  if (nextStatus === "done") dbStatus = "completed";
  else if (nextStatus === "doing") dbStatus = "in_progress";

  try {
    if (!taskId.startsWith("t_")) {
      const { error } = await (supabase as any)
        .from("griot_studio_tasks")
        .update({ status: dbStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) console.warn("Erro ao atualizar status da tarefa:", error.message);
    }
    return true;
  } catch (err) {
    console.warn("Falha ao atualizar tarefa:", err);
    return false;
  }
}

/**
 * Consulta a vinculação real de repositório do projeto em griot_studio_repository_bindings.
 */
export async function fetchProjectRepositoryBinding(projectId: string): Promise<any | null> {
  if (!projectId) return null;
  try {
    const { data, error } = await (supabase as any)
      .from("griot_studio_repository_bindings")
      .select(
        "id, repository_full_name, repository_owner, repository_name, default_branch, ref, status, verified_at, provider",
      )
      .eq("project_id", projectId)
      .maybeSingle();

    if (!error && data) return data;
  } catch (err) {
    console.warn("Erro ao carregar repository binding:", err);
  }
  return null;
}

export interface BindRepositoryParams {
  projectId: string;
  owner: string;
  repo: string;
  ref?: string;
  credentialId?: string;
}

/**
 * Vincula e verifica criptograficamente um repositório GitHub ao projeto do Studio
 * através da Edge Function segura do Supabase (griot-studio), sem expor o token ao cliente.
 */
export async function bindProjectRepository(
  params: BindRepositoryParams,
): Promise<{ success: boolean; binding?: any; error?: string }> {
  const { projectId, owner, repo, ref, credentialId } = params;
  if (!projectId || !owner || !repo) {
    return { success: false, error: "Parâmetros de repositório incompletos (owner/repo necessários)." };
  }

  // Sanitização de entradas caso venha URL completa
  const cleanOwner = owner.replace(/^https?:\/\/github\.com\//i, "").replace(/\/.*$/, "").trim();
  const cleanRepo = repo.replace(/^https?:\/\/github\.com\//i, "").replace(/^.*\//, "").replace(/\.git$/i, "").trim();

  const result = await callGriotStudioApi<{ success: boolean; binding: any }>(
    `/projects/${encodeURIComponent(projectId)}/repository/github`,
    {
      method: "POST",
      body: {
        owner: cleanOwner,
        repo: cleanRepo,
        ref: ref?.trim() || undefined,
        credentialId: credentialId || undefined,
      },
    },
  );

  if (result.error || !result.data) {
    return { success: false, error: result.error || "Falha ao vincular repositório." };
  }

  return { success: true, binding: result.data.binding };
}

/**
 * Remove a vinculação de repositório do projeto no GRIOT Studio.
 */
export async function unbindProjectRepository(
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: "ID do projeto em falta." };

  const result = await callGriotStudioApi<{ success: boolean; unbound: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/repository/github`,
    {
      method: "DELETE",
    },
  );

  if (result.error) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

/**
 * Consulta as execuções reais de computação do GRIOT Sandbox para o projeto (griot_studio_compute_runs).
 */
export async function fetchProjectComputeRuns(projectId: string): Promise<any[]> {
  if (!projectId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("griot_studio_compute_runs")
      .select(
        "id, internal_run_id, runtime_id, provider, repository_full_name, repository_ref, source_commit_sha, status, created_at, updated_at, finished_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (!error && Array.isArray(data)) return data;
  } catch (err) {
    console.warn("Erro ao carregar compute runs:", err);
  }
  return [];
}

/**
 * Consulta os eventos reais do Project Brain associados ao projeto (griot_opb_events).
 */
export async function fetchProjectOpbEvents(projectId: string): Promise<any[]> {
  if (!projectId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("griot_opb_events")
      .select("id, event_type, payload, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (!error && Array.isArray(data) && data.length > 0) return data;

    // Se não houver eventos com project_id estrito, pesquisa eventos recentes gerais do workspace
    const { data: generalEvents } = await (supabase as any)
      .from("griot_opb_events")
      .select("id, event_type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return Array.isArray(generalEvents) ? generalEvents : [];
  } catch (err) {
    console.warn("Erro ao carregar OPB events:", err);
  }
  return [];
}
