import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "../utils/cn";
import {
  fromDateInputValue,
  startOfDay,
  toDateInputValue,
} from "../utils/dates";

interface DatePickerProps {
  id?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseLocalDate(iso: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return startOfDay(date);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDisplay(iso: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMonthGrid(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean }> = [];

  for (let i = 0; i < startOffset; i += 1) {
    const date = new Date(year, month, i - startOffset + 1);
    cells.push({ date, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]?.date ?? first;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  allowClear = true,
  className,
}: DatePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseLocalDate(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected ?? startOfDay());

  useEffect(() => {
    if (open) {
      setCursor(parseLocalDate(value) ?? startOfDay());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const today = startOfDay();
  const label = formatDisplay(value);
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const pick = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    onChange(fromDateInputValue(`${yyyy}-${mm}-${dd}`));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex gap-1">
        <button
          type="button"
          id={inputId}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-left text-sm outline-none transition hover:border-[rgb(var(--accent))]/50 focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <CalendarDays size={15} className="shrink-0 text-[rgb(var(--muted))]" />
          <span
            className={cn(
              "truncate",
              label ? "text-[rgb(var(--text))]" : "text-[rgb(var(--muted))]"
            )}
          >
            {label ?? placeholder}
          </span>
        </button>
        {allowClear && value ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded-lg border border-[rgb(var(--border))] px-2 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* Keep a hidden native value for form semantics / tests */}
      <input type="hidden" value={toDateInputValue(value)} readOnly />

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 right-0 z-[60] mt-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setCursor(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1)
                )
              }
              className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setCursor(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1)
                )
              }
              className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--muted))]"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, inMonth }) => {
              const isSelected = selected ? sameDay(date, selected) : false;
              const isToday = sameDay(date, today);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => pick(date)}
                  className={cn(
                    "h-8 rounded-lg text-xs tabular-nums transition",
                    !inMonth && "text-[rgb(var(--muted))]/45",
                    inMonth && !isSelected && "hover:bg-black/5 dark:hover:bg-white/10",
                    isToday && !isSelected && "font-semibold text-[rgb(var(--accent))]",
                    isSelected &&
                      "bg-[rgb(var(--accent))] font-semibold text-[rgb(var(--accent-foreground))]"
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between gap-2 border-t border-[rgb(var(--border))] pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-xs font-medium text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/10"
            >
              Today
            </button>
            {allowClear ? (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-black/5 dark:hover:bg-white/10"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
