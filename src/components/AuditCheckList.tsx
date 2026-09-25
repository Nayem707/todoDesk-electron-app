import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";
import type { AuditCheck, AuditCheckStatus } from "../types/webAudit";
import { cn } from "../utils/cn";

export const STATUS_META: Record<AuditCheckStatus, { label: string; icon: typeof Info; tone: string; badge: string }> = {
  critical: {
    label: "Critical",
    icon: XCircle,
    tone: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    tone: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  info: {
    label: "Info",
    icon: Info,
    tone: "text-sky-600 dark:text-sky-400",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  pass: {
    label: "Passed",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
};

interface AuditCheckListProps {
  checks: AuditCheck[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}

/** Checks as expandable rows: summary → why/how to fix → technical details. */
export function AuditCheckList({ checks, expandedId, onToggle }: AuditCheckListProps) {
  return (
    <ul className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))]">
      {checks.map((check) => (
        <CheckRow key={check.id} check={check} expanded={expandedId === check.id} onToggle={() => onToggle(check.id)} />
      ))}
    </ul>
  );
}

function CheckRow({ check, expanded, onToggle }: { check: AuditCheck; expanded: boolean; onToggle: () => void }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  const hasTechnical = check.items.length > 0 || Boolean(check.technical);
  const panelId = `audit-check-${check.id}`;

  return (
    <li id={`${panelId}-row`} className="bg-[rgb(var(--surface))] scroll-mt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
      >
        <Icon size={17} className={cn("mt-0.5 shrink-0", meta.tone)} aria-label={meta.label} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{check.title}</span>
          <span className="mt-0.5 block text-sm text-[rgb(var(--muted))]">{check.summary}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("mt-1 shrink-0 text-[rgb(var(--muted))] transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div id={panelId} className="space-y-3 px-4 pb-4 pl-11 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Why it matters</p>
            <p className="mt-1">{check.why}</p>
          </div>
          {check.fix && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">How to fix</p>
              <p className="mt-1">{check.fix}</p>
            </div>
          )}
          {hasTechnical && (
            <div>
              <button
                type="button"
                aria-expanded={showTechnical}
                onClick={() => setShowTechnical((value) => !value)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--accent))] hover:underline"
              >
                <ChevronDown size={13} className={cn("transition-transform", showTechnical && "rotate-180")} />
                {showTechnical ? "Hide technical details" : `Show technical details${check.totalItems ? ` (${check.totalItems})` : ""}`}
              </button>
              {showTechnical && (
                <div className="mt-2 space-y-2">
                  {check.items.length > 0 && (
                    <ul className="max-h-72 space-y-1 overflow-auto rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                      {check.items.map((item, index) => (
                        <li key={index} className="break-all font-mono text-xs leading-5">
                          {item.label}
                          {item.detail && <span className="text-[rgb(var(--muted))]"> — {item.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {check.totalItems > check.items.length && (
                    <p className="text-xs text-[rgb(var(--muted))]">
                      and {check.totalItems - check.items.length} more not shown
                    </p>
                  )}
                  {check.technical && (
                    <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/[0.03] p-2 font-mono text-xs dark:bg-white/[0.04]">
                      {check.technical}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
