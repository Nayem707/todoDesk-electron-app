import type { LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";

export interface TabItem<Id extends string = string> {
  id: Id;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface TabsProps<Id extends string> {
  items: TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel: string;
}

export function Tabs<Id extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: TabsProps<Id>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-x-1 border-b border-[rgb(var(--border))]"
      onKeyDown={(event) => {
        const index = items.findIndex((item) => item.id === value);
        if (index < 0) {
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const offset = event.key === "ArrowRight" ? 1 : -1;
          const next = items[(index + offset + items.length) % items.length];
          if (next) {
            onChange(next.id);
          }
        }
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`tab-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition",
              active
                ? "border-[rgb(var(--accent))] font-medium text-[rgb(var(--text))]"
                : "border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
            )}
          >
            {Icon ? <Icon size={15} /> : null}
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active
                    ? "bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
                    : "bg-black/5 dark:bg-white/10"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
