import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { ChevronRight, Plus, FolderPlus, X, Trash2 } from "lucide-react";
import {
  getUnifiedProjects,
  getActiveProjectSync,
  setActiveProject,
  saveProject,
  deleteProject,
  type GriotProject,
} from "@/lib/project-service";
import { ProjectDetailView } from "./$projectId";
import { ConfirmationModal } from "@/components/griot/confirmation-modal";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — GRIOT Mobile" },
      {
        name: "description",
        content: "Projetos do GRIOT Mobile",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const t = useT();
  const [projects, setProjects] = useState<GriotProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<GriotProject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const unified = await getUnifiedProjects();
        if (cancelled) return;
        setProjects(unified);
        const active = getActiveProjectSync();
        setActiveProjectId(active?.id || unified[0]?.id || null);
      } catch (err) {
        console.warn("Carregamento de projetos:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProjects();

    const handleActiveChanged = (e: any) => {
      setActiveProjectId(e.detail);
    };
    window.addEventListener("griot-active-project-changed", handleActiveChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("griot-active-project-changed", handleActiveChanged);
    };
  }, []);

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;

    try {
      const created = await saveProject({ name });
      const updated = [created, ...projects.filter((p) => p.id !== created.id)];
      setProjects(updated);
      setActiveProjectId(created.id);
      toast.success(t("Projeto criado com sucesso!"));
      setNewProjectName("");
      setCreating(false);
    } catch {
      toast.error(t("Não foi possível criar o projeto."));
    }
  }

  function handleOpenProject(id: string) {
    setActiveProject(id);
    setSelectedProjectId(id);
  }

  async function handleDeleteConfirm() {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      toast.success(t("Projeto eliminado com sucesso!"));
      setProjectToDelete(null);
    } catch {
      toast.error(t("Não foi possível eliminar o projeto."));
    } finally {
      setIsDeleting(false);
    }
  }

  // Se um projeto estiver selecionado, renderiza a visualização detalhada imediatamente
  if (selectedProjectId) {
    return (
      <ProjectDetailView
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
        onDeleted={(deletedId) => {
          setSelectedProjectId(null);
          setProjects((prev) => prev.filter((p) => p.id !== deletedId));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-32">
      {/* Header Matching Screenshots */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[34px] font-bold tracking-tight text-foreground">Projects</h1>
        <button
          onClick={() => setCreating(!creating)}
          aria-label="Novo Projeto"
          className="grid size-9 place-items-center rounded-full bg-secondary border border-hairline text-foreground transition-transform active:scale-95"
        >
          <Plus className="size-5" />
        </button>
      </div>

      {creating && (
        <div className="mb-6 rounded-[24px] border border-hairline bg-surface p-4 rise">
          {/* Barra de entrada de texto com design nativo Android */}
          <div className="relative flex items-center gap-2.5 rounded-[18px] bg-secondary/50 dark:bg-white/[0.07] border border-border/40 px-3.5 py-1.5 focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/25 transition-all shadow-inner">
            <FolderPlus className="size-5 text-muted-foreground/80 shrink-0" />
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={t("Nome do Projeto")}
              className="w-full bg-transparent py-1.5 text-[15px] font-normal text-foreground outline-none placeholder:text-muted-foreground/70"
              autoFocus
            />
            {newProjectName && (
              <button
                type="button"
                onClick={() => setNewProjectName("")}
                className="grid size-6 place-items-center rounded-full bg-foreground/10 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
                aria-label="Limpar texto"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void handleCreateProject()}
              disabled={!newProjectName.trim()}
              className="flex-1 rounded-xl bg-primary py-2 text-[14px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {t("Criar Projeto")}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-xl border border-hairline px-4 py-2 text-[14px] text-muted-foreground"
            >
              {t("Cancelar")}
            </button>
          </div>
        </div>
      )}

      {/* Clean State for Real Production */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-[14px]">
          {t("A carregar...")}
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-[15px]">
          <p>{t("Ainda não tens projetos.")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground/75">
            {t("Cria um novo projeto acima ou converte um veredito no Quick Chat.")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((proj) => {
            const prog = Math.min(100, Math.max(0, Number(proj.progress ?? 0)));
            return (
              <div
                key={proj.id}
                onClick={() => handleOpenProject(proj.id)}
                className="cursor-pointer rounded-[24px] border border-hairline bg-surface p-5 shadow-xs transition-transform active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h2 className="text-[20px] font-bold text-foreground tracking-snug truncate py-0.5">
                      {proj.name}
                    </h2>
                    {proj.id === activeProjectId && (
                      <span className="shrink-0 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10.5px] font-semibold text-foreground tracking-wide uppercase">
                        {t("Ativo")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-[17px] font-bold text-foreground">
                      <span>{prog}%</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(proj);
                      }}
                      aria-label={t("Eliminar projeto")}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all ml-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-1.5 text-[13.5px] text-muted-foreground font-normal line-clamp-1">
                  {proj.description || t("Projeto de automação GRIOT Mobile")}
                </p>

                <div className="mt-4 h-[3.5px] w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${prog}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal to Delete Project */}
      <ConfirmationModal
        open={!!projectToDelete}
        title={t("Eliminar Projeto")}
        description={t(
          `Tens a certeza que desejas eliminar permanentemente o projeto "${projectToDelete?.name || ""}"? Esta ação não pode ser desfeita.`,
        )}
        confirmLabel={isDeleting ? t("A eliminar...") : t("Eliminar")}
        cancelLabel={t("Cancelar")}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onClose={() => setProjectToDelete(null)}
      />
    </div>
  );
}
