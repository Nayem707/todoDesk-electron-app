import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ExpandableText } from "../../components/ExpandableText";
import { ProjectDeadlineBadge } from "../../components/ProjectDeadlineBadge";
import { ProjectStartDateBadge } from "../../components/ProjectStartDateBadge";
import { TaskListCard } from "../../components/TaskListCard";
import type { Project, TaskList, TaskListStatus } from "../../types/todo";

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
  onChangeListStatus: (list: TaskList, status: TaskListStatus) => Promise<boolean>;
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
  onChangeListStatus,
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
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
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
          {lists.map((list) => (
            <li key={list.id}>
              <TaskListCard
                list={list}
                listCount={lists.length}
                onOpen={onOpenList}
                onRename={onRenameList}
                onDelete={onDeleteList}
                onChangeStatus={onChangeListStatus}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
