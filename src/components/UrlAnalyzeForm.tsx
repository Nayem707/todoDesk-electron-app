import { Square, type LucideIcon } from "lucide-react";

interface UrlAnalyzeFormProps {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  running: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitIcon: LucideIcon;
  placeholder: string;
  hint: string;
}

/** The URL card shared by the Web Analyze tools. */
export function UrlAnalyzeForm({
  inputId,
  value,
  onChange,
  running,
  onSubmit,
  onCancel,
  submitLabel,
  submitIcon: SubmitIcon,
  placeholder,
  hint,
}: UrlAnalyzeFormProps) {
  return (
    <form
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
        Website URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={running}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-60"
        />
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Square size={13} />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] transition hover:opacity-90 disabled:opacity-50"
          >
            <SubmitIcon size={15} />
            {submitLabel}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--muted))]">{hint}</p>
    </form>
  );
}
