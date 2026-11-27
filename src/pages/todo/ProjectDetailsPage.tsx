import { ArrowLeft, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ExpandableText } from "../../components/ExpandableText";
import { ProjectDeadlineBadge } from "../../components/ProjectDeadlineBadge";
import { ProjectStartDateBadge } from "../../components/ProjectStartDateBadge";
import type { Project, TaskList } from "../../types/todo";

interface ProjectDetailsPageProps {
  project: Project;
  lists: TaskList[];
  loading: boolean;
  onBack: () => void;
  onEditProject: () => void;
  onCreateList: () => void;
  onOpenList: (list: TaskList) => void;
  onRenameList: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
}

export function ProjectDetailsPage({
  project,
  lists,
  loading,
  onBack,
  onEditProject,
  onCreateList,
  onOpenList,
  onRenameList,
  onDeleteList,
}: ProjectDetailsPageProps) {
  const progress =
    project.taskCount > 0
      ? Math.round((project.completedCount / project.taskCount) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
          >
            <ArrowLeft size={14} />
            Projects
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <button
              type="button"
              onClick={onEditProject}
              className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
              aria-label={`Edit ${project.name}`}
            >
              <Pencil size={14} />
            </button>
          </div>
          {project.description ? (
            <ExpandableText text={project.description} lines={2} />
          ) : (
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">No description</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <ProjectStartDateBadge startDate={project.startDate} />
            <ProjectDeadlineBadge deadline={project.deadline} />
          </div>
          <p className="mt-2 text-xs text-[rgb(var(--muted))]">
            {project.completedCount}/{project.taskCount} tasks · {progress}% complete
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateList}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
        >
          <Plus size={16} />
          New List
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
            />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          title="No task lists"
          description="Create a list to start adding tasks in this project."
          action={
            <button
              type="button"
              onClick={onCreateList}
              className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
            >
              New List
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lists.map((list) => {
            const listProgress =
              list.taskCount > 0
                ? Math.round((list.completedCount / list.taskCount) * 100)
                : 0;
            return (
              <li key={list.id}>
                <article className="flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card dark:shadow-card-dark">
                  <button
                    type="button"
                    onClick={() => onOpenList(list)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 rounded-lg bg-black/5 p-2 text-[rgb(var(--muted))] dark:bg-white/10">
                      <ListTodo size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold">{list.name}</h2>
                      <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
                        {list.completedCount}/{list.taskCount} completed · {listProgress}%
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-[rgb(var(--accent))]"
                          style={{ width: `${listProgress}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ProjectStartDateBadge
                          startDate={list.startDate}
                          className="px-2 py-1"
                        />
                        <ProjectDeadlineBadge
                          deadline={list.deadline}
                          caption="List deadline"
                          className="px-2 py-1"
                        />
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex shrink-0 justify-end gap-1 border-t border-[rgb(var(--border))] pt-3">
                    <button
                      type="button"
                      onClick={() => onRenameList(list)}
                      className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
                      aria-label={`Rename ${list.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteList(list)}
                      disabled={lists.length <= 1}
                      className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950"
                      aria-label={`Delete ${list.name}`}
                      title={
                        lists.length <= 1
                          ? "A project must keep at least one list"
                          : undefined
                      }
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
