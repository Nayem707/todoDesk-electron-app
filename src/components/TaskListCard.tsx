import type { TaskList } from "../types/todo";
import { ScheduledCard } from "./ScheduledCard";

interface TaskListCardProps {
  list: TaskList;
  listCount: number;
  onOpen: (list: TaskList) => void;
  onRename: (list: TaskList) => void;
  onDelete: (list: TaskList) => void;
}

export function TaskListCard({
  list,
  listCount,
  onOpen,
  onRename,
  onDelete,
}: TaskListCardProps) {
  const progress =
    list.taskCount > 0
      ? Math.round((list.completedCount / list.taskCount) * 100)
      : 0;
  const progressSummary = `${list.completedCount}/${list.taskCount} ${
    list.taskCount === 1 ? "task" : "tasks"
  } done!`;

  return (
    <ScheduledCard
      entityLabel="Task List"
      title={list.name}
      description={list.description}
      progress={progress}
      progressSummary={progressSummary}
      startDate={list.startDate}
      deadline={list.deadline}
      editActionLabel="Rename list"
      deleteDisabled={listCount <= 1}
      deleteDisabledTitle={
        listCount <= 1 ? "A project must keep at least one list" : undefined
      }
      onOpen={() => onOpen(list)}
      onEdit={() => onRename(list)}
      onDelete={() => onDelete(list)}
    />
  );
}
