import { useEffect, useId, useState } from "react";
import type { TaskList, TaskListInput } from "../types/todo";
import { DatePicker } from "./DatePicker";

interface ListNameModalProps {
  open: boolean;
  title: string;
  list?: TaskList | null;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (input: TaskListInput) => Promise<void> | void;
}

export function ListNameModal({
  open,
  title,
  list = null,
  confirmLabel = "Save",
  onClose,
  onSubmit,
}: ListNameModalProps) {
  const inputId = useId();
  const startDateId = useId();
  const deadlineId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(list?.name ?? "");
    setDescription(list?.description ?? "");
    setStartDate(list?.startDate ?? null);
    setDeadline(list?.deadline ?? null);
    setError(null);
  }, [open, list]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("List name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim(),
        startDate,
        deadline,
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
        aria-labelledby={inputId}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl"
      >
        <h2 id={inputId} className="text-lg font-semibold">
          {title}
        </h2>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="mt-4 w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[rgb(var(--accent))]"
          placeholder="List name"
          autoFocus
          maxLength={120}
        />
        <label
          htmlFor={`${inputId}-description`}
          className="mt-4 block text-sm font-medium"
        >
          Description
        </label>
        <textarea
          id={`${inputId}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:border-[rgb(var(--accent))]"
          placeholder="Optional list description"
        />
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={startDateId} className="text-sm font-medium">
              Start date
            </label>
            <DatePicker
              id={startDateId}
              value={startDate}
              onChange={setStartDate}
              placeholder="Pick a start date"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={deadlineId} className="text-sm font-medium">
              End date / deadline
            </label>
            <DatePicker
              id={deadlineId}
              value={deadline}
              onChange={setDeadline}
              placeholder="Pick an end date"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">
              Shows a countdown on this project’s task list.
            </p>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-[rgb(var(--danger))]">{error}</p>}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
