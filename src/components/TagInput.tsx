import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}

export function TagInput({ value, onChange, error }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const next = draft.trim();
    if (!next) {
      return;
    }
    if (value.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, next].slice(0, 10));
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
    if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1.5 focus-within:ring-2 focus-within:ring-[rgb(var(--accent))]">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              aria-label={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addTag}
          placeholder={value.length ? "" : "Type a tag and press Enter"}
          className="min-w-[140px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[rgb(var(--muted))]"
        />
      </div>
      {error && <p className="mt-1 text-xs text-[rgb(var(--danger))]">{error}</p>}
    </div>
  );
}
