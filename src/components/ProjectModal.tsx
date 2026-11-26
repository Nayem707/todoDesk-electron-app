import { useEffect, useId, useState } from "react";
import type { Project, ProjectInput } from "../types/todo";

interface ProjectModalProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSubmit: (input: ProjectInput) => Promise<void> | void;
}

const emptyForm: ProjectInput = {
  name: "",
  description: "",
};

export function ProjectModal({ open, project, onClose, onSubmit }: ProjectModalProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [form, setForm] = useState<ProjectInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    if (project) {
      setForm({ name: project.name, description: project.description });
    } else {
      setForm(emptyForm);
    }
  }, [open, project]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Project name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        description: (form.description ?? "").trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={nameId}
        className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl"
      >
        <h2 id={nameId} className="text-lg font-semibold">
          {project ? "Edit project" : "Create project"}
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${nameId}-input`} className="text-sm font-medium">
              Name
            </label>
            <input
              id={`${nameId}-input`}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[rgb(var(--accent))]"
              placeholder="Project name"
              autoFocus
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor={descriptionId} className="text-sm font-medium">
              Description
            </label>
            <textarea
              id={descriptionId}
              value={form.description ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              maxLength={1000}
              className="mt-1 w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[rgb(var(--accent))]"
              placeholder="Optional description"
            />
          </div>
          {error && <p className="text-sm text-[rgb(var(--danger))]">{error}</p>}
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
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] disabled:opacity-60"
          >
            {project ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
