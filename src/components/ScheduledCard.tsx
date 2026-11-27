import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { calendarDaysUntil, getProjectDeadlineInfo } from "../utils/dates";
import { cn } from "../utils/cn";
import { ExpandableText } from "./ExpandableText";

interface ScheduledCardProps {
  entityLabel: string;
  title: string;
  description: string;
  progress: number;
  progressSummary: string;
  startDate: string | null;
  deadline: string | null;
  editActionLabel: string;
  deleteDisabled?: boolean;
  deleteDisabledTitle?: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const countdownToneClass = {
  none: "border-[rgb(var(--border))] bg-black/[0.03] text-[rgb(var(--text))] dark:bg-white/[0.04]",
  ok: "border-teal-200/80 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200",
  soon: "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  today:
    "border-orange-300/80 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  overdue:
    "border-rose-300/80 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
};

function formatCardDate(value: string | null, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
  }
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function ScheduledCard({
  entityLabel,
  title,
  description,
  progress,
  progressSummary,
  startDate,
  deadline,
  editActionLabel,
  deleteDisabled = false,
  deleteDisabledTitle,
  onOpen,
  onEdit,
  onDelete,
}: ScheduledCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const deadlineInfo = getProjectDeadlineInfo(deadline);
  const startDays = calendarDaysUntil(startDate);
  const startsInFuture = startDays !== null && startDays > 0;
  const countdownLabel = startsInFuture
    ? `Starts in ${startDays} ${startDays === 1 ? "day" : "days"}`
    : deadlineInfo.label;
  const countdownTone = startsInFuture
    ? startDays <= 7
      ? "soon"
      : "ok"
    : deadlineInfo.tone;

  useEffect(() => {
    if (!actionsOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen]);

  return (
    <article
      onClick={onOpen}
      className={cn(
        "flex h-full cursor-pointer flex-col rounded-2xl border bg-[rgb(var(--surface))] p-5 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark",
        deadlineInfo.tone === "overdue"
          ? "border-rose-300/70 dark:border-rose-900/80"
          : deadlineInfo.tone === "today"
            ? "border-orange-300/70 dark:border-orange-900/80"
            : "border-[rgb(var(--border))]"
      )}
    >
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="min-w-0 flex-1 truncate text-left text-base font-semibold hover:text-[rgb(var(--accent))]"
        >
          {title}
        </button>
        <div ref={actionsRef} className="relative -mr-2 -mt-2 shrink-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setActionsOpen((open) => !open);
            }}
            aria-label={`${entityLabel} actions for ${title}`}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            className="rounded-lg p-2 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
          >
            <MoreVertical size={18} />
          </button>
          {actionsOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-36 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setActionsOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Pencil size={14} />
                {editActionLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={deleteDisabled}
                title={deleteDisabled ? deleteDisabledTitle : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (deleteDisabled) {
                    return;
                  }
                  setActionsOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950"
              >
                <Trash2 size={14} />
                Delete {entityLabel.toLowerCase()}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {description ? (
        <ExpandableText
          text={`${entityLabel} Description: ${description}`}
          lines={2}
          expandLabel="More"
          collapseLabel="Less"
          className="mt-2"
        />
      ) : (
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          <span className="font-medium">{entityLabel} Description:</span> No description
        </p>
      )}

      <section className="mt-5" aria-label={`${entityLabel} progress`}>
        <div className="h-2.5 overflow-hidden rounded-full border border-[rgb(var(--border))] bg-black/[0.03] dark:bg-white/[0.04]">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-[rgb(var(--muted))]">
          <p className="min-w-0 truncate">{progressSummary}</p>
          <span className="shrink-0 tabular-nums">{progress}%</span>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3" aria-label={`${entityLabel} dates`}>
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
          <CalendarDays
            size={17}
            className="shrink-0 text-[rgb(var(--muted))]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-[rgb(var(--muted))]">Start Date</p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {formatCardDate(startDate, "No start date")}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
          <CalendarClock
            size={17}
            className="shrink-0 text-[rgb(var(--muted))]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-[rgb(var(--muted))]">End Date</p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {formatCardDate(deadline, "No end date")}
            </p>
          </div>
        </div>
      </section>

      <section
        className={cn(
          "mt-3 rounded-xl border px-3 py-3 text-center",
          countdownToneClass[countdownTone]
        )}
        aria-label={`${entityLabel} countdown`}
      >
        <p className="text-base font-semibold">{countdownLabel}</p>
        <p className="mt-1 text-xs opacity-80">
          Please update {entityLabel.toLowerCase()} date
        </p>
      </section>
    </article>
  );
}
