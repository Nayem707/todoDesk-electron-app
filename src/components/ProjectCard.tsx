import type { Project } from "../types/todo";
import { ScheduledCard } from "./ScheduledCard";

interface ProjectCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const progress =
    project.taskCount > 0
      ? Math.round((project.completedCount / project.taskCount) * 100)
      : 0;
  const progressSummary = `${project.listCount} ${
    project.listCount === 1 ? "list" : "lists"
  } | ${project.completedCount}/${project.taskCount} ${
    project.taskCount === 1 ? "task" : "tasks"
  } done!`;

  return (
    <ScheduledCard
      entityLabel="Project"
      title={project.name}
      description={project.description}
      progress={progress}
      progressSummary={progressSummary}
      startDate={project.startDate}
      deadline={project.deadline}
      editActionLabel="Edit project"
      onOpen={() => onOpen(project)}
      onEdit={() => onEdit(project)}
      onDelete={() => onDelete(project)}
    />
  );
}
