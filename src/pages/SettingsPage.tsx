import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSettings } from "../store/SettingsProvider";
import { useTodos } from "../store/TodoProvider";
import type { ThemePreference } from "../types/todo";

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { clearAll, clearCompleted, stats } = useTodos();
  const [confirm, setConfirm] = useState<"completed" | "all" | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Appearance, safety, and local data.
        </p>
      </div>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold">Theme</h2>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Light, dark, or match the operating system.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => void updateSettings({ theme })}
              className={`rounded-lg border px-3 py-2 text-sm capitalize ${
                settings.theme === theme
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 font-medium"
                  : "border-[rgb(var(--border))] hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold">Safety</h2>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.confirmBeforeDelete}
            onChange={(event) =>
              void updateSettings({ confirmBeforeDelete: event.target.checked })
            }
            className="mt-0.5 accent-[rgb(var(--accent))]"
          />
          <span>
            <span className="font-medium">Confirm before deleting tasks</span>
            <span className="mt-0.5 block text-[rgb(var(--muted))]">
              Recommended. Prevents accidental data loss.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold">Data</h2>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Tasks and clipboard history are stored locally in SQLite on this computer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirm("completed")}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Clear completed ({stats?.completed ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setConfirm("all")}
            className="rounded-lg bg-[rgb(var(--danger))] px-3 py-2 text-sm font-medium text-white"
          >
            Clear all tasks
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold">Application</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Name" value="TodoDesk" />
          <Row label="Version" value="1.0.0" />
          <Row label="Storage" value="SQLite in the user data folder" />
          <Row label="Architecture" value="Electron main → preload → React" />
        </dl>
      </section>

      <ConfirmDialog
        open={confirm === "completed"}
        title="Clear completed tasks?"
        description="Completed tasks will be permanently deleted from the local database."
        confirmLabel="Clear completed"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await clearCompleted();
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "all"}
        title="Clear all tasks?"
        description="This removes every task. This cannot be undone."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await clearAll();
          setConfirm(null);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[rgb(var(--muted))]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
