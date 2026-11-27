import { useCallback, useEffect, useState, type RefObject } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListNameModal } from "../components/ListNameModal";
import { ProjectModal } from "../components/ProjectModal";
import { useSettings } from "../store/SettingsProvider";
import { useTodos } from "../store/TodoProvider";
import type { Project, TaskList, Todo, TodoListFilter } from "../types/todo";
import { ProjectDetailsPage } from "./todo/ProjectDetailsPage";
import { ProjectListPage } from "./todo/ProjectListPage";
import { setTodoNav, todoNav } from "../store/todoNav";
import { TasksPage } from "./TasksPage";

interface TodoPageProps {
  searchRef: RefObject<HTMLInputElement | null>;
  onCreateTask: () => void;
  onEditTask: (todo: Todo) => void;
  onDeleteTask: (todo: Todo) => void;
}

export function TodoPage({
  searchRef,
  onCreateTask,
  onEditTask,
  onDeleteTask,
}: TodoPageProps) {
  const { settings } = useSettings();
  const {
    projects,
    lists,
    loading,
    refreshing,
    setActiveProjectId,
    setActiveListId,
    createProject,
    updateProject,
    deleteProject,
    createTaskList,
    updateTaskList,
    deleteTaskList,
  } = useTodos();

  const [screen, setScreen] = useState(todoNav.screen);
  const [projectId, setProjectId] = useState(todoNav.projectId);
  const [listId, setListId] = useState(todoNav.listId);
  const [filter, setFilter] = useState<TodoListFilter>(todoNav.filter);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(
    null
  );

  const [listModalMode, setListModalMode] = useState<"create" | "rename" | null>(
    null
  );
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<TaskList | null>(null);

  const go = useCallback(
    (next: {
      screen: typeof todoNav.screen;
      projectId?: string | null;
      listId?: string | null;
      filter?: TodoListFilter;
    }) => {
      const project = next.projectId === undefined ? projectId : next.projectId;
      const list = next.listId === undefined ? listId : next.listId;
      const nextFilter = next.filter ?? filter;
      setScreen(next.screen);
      setProjectId(project);
      setListId(list);
      setFilter(nextFilter);
      setTodoNav({
        screen: next.screen,
        projectId: project,
        listId: list,
        filter: nextFilter,
      });
      setActiveProjectId(project);
      setActiveListId(list);
    },
    [filter, listId, projectId, setActiveListId, setActiveProjectId]
  );

  useEffect(() => {
    setActiveProjectId(projectId);
    setActiveListId(listId);
  }, [listId, projectId, setActiveListId, setActiveProjectId]);

  const activeProject =
    projects.find((project) => project.id === projectId) ?? null;
  const activeList = lists.find((list) => list.id === listId) ?? null;

  useEffect(() => {
    if (loading || refreshing) {
      return;
    }
    if (screen === "project" && projectId && !activeProject) {
      go({ screen: "projects", projectId: null, listId: null });
    }
    if (screen === "list") {
      if (!activeProject) {
        go({ screen: "projects", projectId: null, listId: null });
      } else if (!activeList) {
        go({ screen: "project", listId: null });
      }
    }
  }, [activeList, activeProject, go, loading, projectId, refreshing, screen]);

  const requestDeleteProject = (project: Project) => {
    if (settings.confirmBeforeDelete) {
      setPendingDeleteProject(project);
      return;
    }
    void deleteProject(project.id).then((ok) => {
      if (ok && projectId === project.id) {
        go({ screen: "projects", projectId: null, listId: null });
      }
    });
  };

  const requestDeleteList = (list: TaskList) => {
    if (settings.confirmBeforeDelete) {
      setPendingDeleteList(list);
      return;
    }
    void deleteTaskList(list.id).then((ok) => {
      if (ok && listId === list.id) {
        go({ screen: "project", listId: null });
      }
    });
  };

  return (
    <>
      {screen === "projects" && (
        <ProjectListPage
          projects={projects}
          loading={loading}
          onCreate={() => {
            setEditingProject(null);
            setProjectModalOpen(true);
          }}
          onOpen={(project) =>
            go({ screen: "project", projectId: project.id, listId: null })
          }
          onEdit={(project) => {
            setEditingProject(project);
            setProjectModalOpen(true);
          }}
          onDelete={requestDeleteProject}
        />
      )}

      {screen === "project" && activeProject && (
        <ProjectDetailsPage
          project={activeProject}
          lists={lists}
          loading={loading}
          onBack={() => go({ screen: "projects", projectId: null, listId: null })}
          onEditProject={() => {
            setEditingProject(activeProject);
            setProjectModalOpen(true);
          }}
          onCreateList={() => {
            setEditingList(null);
            setListModalMode("create");
          }}
          onOpenList={(list) =>
            go({
              screen: "list",
              projectId: activeProject.id,
              listId: list.id,
            })
          }
          onRenameList={(list) => {
            setEditingList(list);
            setListModalMode("rename");
          }}
          onDeleteList={requestDeleteList}
        />
      )}

      {screen === "list" && activeProject && activeList && (
        <TasksPage
          listId={activeList.id}
          listName={activeList.name}
          projectName={activeProject.name}
          filter={filter}
          onFilterChange={(next) => go({ screen: "list", filter: next })}
          searchRef={searchRef}
          onBack={() => go({ screen: "project", listId: null })}
          onCreate={onCreateTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
        />
      )}

      <ProjectModal
        open={projectModalOpen}
        project={editingProject}
        onClose={() => setProjectModalOpen(false)}
        onSubmit={async (input) => {
          if (editingProject) {
            const updated = await updateProject(editingProject.id, input);
            if (updated) {
              setProjectModalOpen(false);
            }
            return;
          }
          const created = await createProject(input);
          if (created) {
            setProjectModalOpen(false);
            go({ screen: "project", projectId: created.id, listId: null });
          }
        }}
      />

      <ListNameModal
        open={listModalMode !== null}
        title={listModalMode === "rename" ? "Rename list" : "New task list"}
        list={editingList}
        confirmLabel={listModalMode === "rename" ? "Save" : "Create"}
        onClose={() => setListModalMode(null)}
        onSubmit={async (input) => {
          if (listModalMode === "rename" && editingList) {
            const updated = await updateTaskList(editingList.id, input);
            if (updated) {
              setListModalMode(null);
            }
            return;
          }
          if (!projectId) {
            return;
          }
          const created = await createTaskList(projectId, input);
          if (created) {
            setListModalMode(null);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteProject)}
        title="Delete project"
        description={`“${pendingDeleteProject?.name ?? ""}” and all of its lists and tasks will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDeleteProject(null)}
        onConfirm={async () => {
          if (!pendingDeleteProject) {
            return;
          }
          const id = pendingDeleteProject.id;
          const ok = await deleteProject(id);
          setPendingDeleteProject(null);
          if (ok && projectId === id) {
            go({ screen: "projects", projectId: null, listId: null });
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteList)}
        title="Delete task list"
        description={`“${pendingDeleteList?.name ?? ""}” and all of its tasks will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDeleteList(null)}
        onConfirm={async () => {
          if (!pendingDeleteList) {
            return;
          }
          const id = pendingDeleteList.id;
          const ok = await deleteTaskList(id);
          setPendingDeleteList(null);
          if (ok && listId === id) {
            go({ screen: "project", listId: null });
          }
        }}
      />
    </>
  );
}
