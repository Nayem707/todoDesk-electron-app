import { useEffect, useId, useState, type ReactNode } from "react";
import type { Priority, Todo, TodoInput } from "../types/todo";
import { fromDateInputValue, toDateInputValue } from "../utils/dates";
import { validateTodoForm } from "../utils/validation";
import { TagInput } from "./TagInput";

interface TodoModalProps {
  open: boolean;
  todo: Todo | null;
  onClose: () => void;
  onSubmit: (input: TodoInput) => Promise<void> | void;
}

const emptyForm: TodoInput = {
  title: "",
  description: "",
  priority: "medium",
  dueDate: null,
  tags: [],
};

export function TodoModal({ open, todo, onClose, onSubmit }: TodoModalProps) {
  const titleId = useId();
  const [form, setForm] = useState<TodoInput>(emptyForm);
  const [errors, setErrors] = useState<ReturnType<typeof validateTodoForm>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setErrors({});
    if (todo) {
      setForm({
        title: todo.title,
        description: todo.description,
        priority: todo.priority,
        dueDate: todo.dueDate,
        tags: todo.tags,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, todo]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    const nextErrors = validateTodoForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {todo ? "Edit task" : "New task"}
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Title is required. Everything else is optional.
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              autoFocus
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  void submit();
                }
              }}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="What needs to be done?"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-[rgb(var(--danger))]">{errors.title}</p>
            )}
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={4}
              className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="Notes, context, or a checklist"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-[rgb(var(--danger))]">{errors.description}</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-[rgb(var(--border))] p-1">
                {(["low", "medium", "high"] as Priority[]).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, priority }))}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize ${
                      form.priority === priority
                        ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                        : "text-[rgb(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={toDateInputValue(form.dueDate)}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    dueDate: fromDateInputValue(event.target.value),
                  }))
                }
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </Field>
          </div>

          <Field label="Tags">
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm((prev) => ({ ...prev, tags }))}
              error={errors.tags}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[rgb(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] disabled:opacity-60"
          >
            {submitting ? "Saving…" : todo ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </div>
  );
}
