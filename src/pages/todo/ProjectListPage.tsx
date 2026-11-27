import { Plus } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ProjectCard } from "../../components/ProjectCard";
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
            return (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
