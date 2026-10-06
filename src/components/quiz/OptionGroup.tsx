import { cn } from "../../utils/cn";

export interface OptionItem<T extends string | number> {
  value: T;
  label: string;
}

interface OptionGroupProps<T extends string | number> {
  label: string;
  options: OptionItem<T>[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
  /** Multi-select groups behave like toggle buttons instead of radios. */
  multiple?: boolean;
  disabled?: boolean;
  hint?: string;
}

/** Segmented choice used by the quiz forms. */
export function OptionGroup<T extends string | number>({
  label,
  options,
  isSelected,
  onSelect,
  multiple = false,
  disabled = false,
  hint,
}: OptionGroupProps<T>) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div role={multiple ? "group" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = isSelected(option.value);
          return (
            <button
              key={String(option.value)}
              type="button"
              role={multiple ? undefined : "radio"}
              aria-checked={multiple ? undefined : selected}
              aria-pressed={multiple ? selected : undefined}
              disabled={disabled}
              onClick={() => onSelect(option.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 font-medium text-[rgb(var(--text))]"
                  : "border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-xs text-[rgb(var(--muted))]">{hint}</p>}
    </div>
  );
}
