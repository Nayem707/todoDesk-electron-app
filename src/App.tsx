import { useCallback, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { AppShell } from "./layouts/AppShell";
import { AssistantPage } from "./pages/AssistantPage";
import { ClipboardPage } from "./pages/ClipboardPage";
import { MarkdownPage } from "./pages/MarkdownPage";
import { QuizPage } from "./pages/QuizPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TodoPage } from "./pages/TodoPage";
import { WebAnalyzePage } from "./pages/WebAnalyzePage";
import { todoNav } from "./store/todoNav";
import { TodoModal } from "./components/TodoModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { SettingsProvider, useSettings } from "./store/SettingsProvider";
import { ClipboardProvider } from "./store/ClipboardProvider";
import { TodoProvider, useTodos } from "./store/TodoProvider";
import type { AppView, Todo, TodoInput } from "./types/todo";

function AppFrame() {
  const { resolvedTheme, settings } = useSettings();
  const { createTodo, updateTodo, deleteTodo } = useTodos();
  const [view, setView] = useState<AppView>("todo");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Todo | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const openCreate = useCallback(() => {
    if (todoNav.screen !== "list" || !todoNav.listId) {
      toast.message("Open a task list to create a task.");
      return;
    }
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((todo: Todo) => {
    setEditing(todo);
    setModalOpen(true);
  }, []);

  const requestDelete = useCallback(
    (todo: Todo) => {
      if (settings.confirmBeforeDelete) {
        setPendingDelete(todo);
        return;
      }
      void deleteTodo(todo.id);
    },
    [deleteTodo, settings.confirmBeforeDelete]
  );

  useKeyboardShortcuts({
    onNew: () => {
      if (view === "todo") {
        openCreate();
      }
    },
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => {
      setModalOpen(false);
      setPendingDelete(null);
    },
  });

  const page = useMemo(() => {
    if (view === "settings") {
      return <SettingsPage />;
    }
    if (view === "clipboard") {
      return <ClipboardPage searchRef={searchRef} />;
    }
    if (view === "markdown") {
      return <MarkdownPage />;
    }
    if (view === "assistant") {
      return <AssistantPage />;
    }
    if (view === "webAnalyze") {
      return <WebAnalyzePage />;
    }
    if (view === "quiz") {
      return <QuizPage />;
    }
    return (
      <TodoPage
        searchRef={searchRef}
        onCreateTask={openCreate}
        onEditTask={openEdit}
        onDeleteTask={requestDelete}
      />
    );
  }, [openCreate, openEdit, requestDelete, view]);

  return (
    <>
      <AppShell view={view} onViewChange={setView} onCreate={openCreate}>
        {page}
      </AppShell>
      <TodoModal
        open={modalOpen}
        todo={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input: TodoInput) => {
          if (editing) {
            const result = await updateTodo(editing.id, input);
            if (result) {
              setModalOpen(false);
            }
            return;
          }
          if (!todoNav.listId) {
            toast.error("Open a task list to create a task.");
            return;
          }
          const result = await createTodo({ ...input, listId: todoNav.listId });
          if (result) {
            setModalOpen(false);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete task"
        description={`“${pendingDelete?.title ?? ""}” will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteTodo(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
      />
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          className: "font-sans",
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <TodoProvider>
        <ClipboardProvider>
          <AppFrame />
        </ClipboardProvider>
      </TodoProvider>
    </SettingsProvider>
  );
}
