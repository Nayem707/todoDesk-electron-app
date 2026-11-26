import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ExpandableText } from "../../components/ExpandableText";
import type { Project } from "../../types/todo";

interface ProjectListPageProps {
  projects: Project[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectListPage({
  projects,
  loading,
  onCreate,
  onOpen,
  onEdit,
  onDelete,
}: ProjectListPageProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            Organize tasks into projects and lists.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
        >
          <Plus size={16} />
          Create Project
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to start organizing task lists and tasks."
          action={
            <button
              type="button"
              onClick={onCreate}
              className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
            >
              Create Project
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => {
            const progress =
              project.taskCount > 0
                ? Math.round((project.completedCount / project.taskCount) * 100)
                : 0;
            return (
              <li key={project.id}>
                <article className="group flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark">
                  <button
                    type="button"
                    onClick={() => onOpen(project)}
                    className="flex flex-1 flex-col text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-[rgb(var(--accent))]/10 p-2 text-[rgb(var(--accent))]">
                        <FolderKanban size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                        {project.description ? (
                          <ExpandableText text={project.description} lines={2} />
                        ) : (
                          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                            No description
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgb(var(--muted))]">
                        <span>
                          {project.listCount}{" "}
                          {project.listCount === 1 ? "list" : "lists"}
                        </span>
                        <span>
                          {project.completedCount}/{project.taskCount} tasks done
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-[rgb(var(--accent))] transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end gap-1 border-t border-[rgb(var(--border))] pt-3">
                    <button
                      type="button"
                      onClick={() => onEdit(project)}
                      className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
                      aria-label={`Edit ${project.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(project)}
                      className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
