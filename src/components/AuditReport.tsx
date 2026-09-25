import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { AuditCategory, AuditCategoryId, AuditMetrics, AuditReport as Report, WebAudit } from "../types/webAudit";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";
import { AuditCheckList, STATUS_META } from "./AuditCheckList";

type Filter = "issues" | "passed" | "all";

export function scoreTone(score: number | null) {
  if (score === null) {
    return { text: "text-[rgb(var(--muted))]", stroke: "stroke-[rgb(var(--border))]", label: "Not scored" };
  }
  if (score >= 90) {
    return { text: "text-emerald-600 dark:text-emerald-400", stroke: "stroke-emerald-500", label: "Good" };
  }
  if (score >= 50) {
    return { text: "text-amber-600 dark:text-amber-400", stroke: "stroke-amber-500", label: "Needs improvement" };
  }
  return { text: "text-rose-600 dark:text-rose-400", stroke: "stroke-rose-500", label: "Poor" };
}

function ScoreRing({ score, size = 104 }: { score: number | null; size?: number }) {
  const radius = size / 2 - 7;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Overall score ${score ?? "not available"} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={8} className="stroke-black/10 dark:stroke-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (score ?? 0) / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", tone.stroke)}
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums", tone.text)}>
        {score ?? "–"}
      </span>
    </div>
  );
}

function CountChip({ count, status }: { count: number; status: "critical" | "warning" | "info" | "pass" }) {
  const meta = STATUS_META[status];
  const label =
    status === "critical"
      ? "critical"
      : status === "warning"
        ? count === 1
          ? "warning"
          : "warnings"
        : status === "info"
          ? count === 1
            ? "note"
            : "notes"
          : "passed";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        count === 0 && status !== "pass" ? "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10" : meta.badge
      )}
    >
      {count} {label}
    </span>
  );
}

function formatMetric(value: number | null, unit: "ms" | "bytes" | "count" | "cls") {
  if (value === null || value === undefined) {
    return "–";
  }
  if (unit === "ms") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
  }
  if (unit === "bytes") {
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
    return value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} B`;
  }
  if (unit === "cls") {
    return value.toFixed(2);
  }
  return value.toLocaleString("en-US");
}

function PerformanceMetrics({ metrics }: { metrics: AuditMetrics }) {
  const items: { label: string; value: string; hint: string }[] = [
    { label: "Server response", value: formatMetric(metrics.ttfbMs, "ms"), hint: "Time to first byte" },
    { label: "First content", value: formatMetric(metrics.fcpMs, "ms"), hint: "First Contentful Paint" },
    { label: "Main content", value: formatMetric(metrics.lcpMs, "ms"), hint: "Largest Contentful Paint" },
    { label: "Layout shift", value: formatMetric(metrics.cls, "cls"), hint: "Cumulative Layout Shift" },
    { label: "Fully loaded", value: formatMetric(metrics.loadMs, "ms"), hint: "Load event" },
    { label: "Page size", value: formatMetric(metrics.totalBytes, "bytes"), hint: "Approximate download size" },
    { label: "Requests", value: formatMetric(metrics.requestCount, "count"), hint: "Network requests" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} title={item.hint} className="rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-[rgb(var(--muted))]">{item.label}</dt>
          <dd className="text-sm font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CategoryDetail({
  category,
  metrics,
  expandedId,
  onToggle,
  filter,
  onFilterChange,
}: {
  category: AuditCategory;
  metrics: AuditMetrics;
  expandedId: string | null;
  onToggle: (id: string) => void;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}) {
  const issues = category.checks.filter((check) => check.status !== "pass");
  const passed = category.checks.filter((check) => check.status === "pass");
  const visible = filter === "issues" ? issues : filter === "passed" ? passed : category.checks;
  const tone = scoreTone(category.score);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "issues", label: "Issues", count: issues.length },
    { id: "passed", label: "Passed", count: passed.length },
    { id: "all", label: "All", count: category.checks.length },
  ];

  return (
    <section
      id="audit-category-detail"
      aria-labelledby="audit-category-title"
      className="scroll-mt-4 space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="audit-category-title" className="text-base font-semibold">
            {category.label}
          </h3>
          <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">{category.description}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl font-semibold tabular-nums", tone.text)}>{category.score ?? "–"}</p>
          <p className="text-xs text-[rgb(var(--muted))]">{tone.label}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CountChip count={category.counts.critical} status="critical" />
        <CountChip count={category.counts.warnings} status="warning" />
        {category.counts.info > 0 && <CountChip count={category.counts.info} status="info" />}
        <CountChip count={category.counts.passed} status="pass" />
      </div>

      {category.incomplete && category.note && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {category.note}
        </p>
      )}

      {category.id === "performance" && <PerformanceMetrics metrics={metrics} />}

      <div
        role="group"
        aria-label="Filter checks"
        className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5"
      >
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => onFilterChange(item.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              filter === item.id
                ? "bg-[rgb(var(--accent))] font-medium text-[rgb(var(--accent-foreground))]"
                : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
            )}
          >
            {item.label} <span className="tabular-nums opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <AuditCheckList checks={visible} expandedId={expandedId} onToggle={onToggle} />
      ) : (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--muted))]">
          {filter === "issues" ? "No issues found in this category." : "Nothing to show here."}
        </p>
      )}
    </section>
  );
}

function defaultCategory(report: Report): AuditCategoryId {
  const scored = report.categories.filter((category) => category.score !== null);
  const worst = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  return (worst ?? report.categories[0])?.id ?? "seo";
}

export function AuditReport({ audit, report }: { audit: WebAudit; report: Report }) {
  const [selectedId, setSelectedId] = useState<AuditCategoryId>(() => defaultCategory(report));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("issues");
  const selected = useMemo(
    () => report.categories.find((category) => category.id === selectedId) ?? report.categories[0],
    [report.categories, selectedId]
  );
  const pageUrl = report.finalUrl || report.url;
  const overallTone = scoreTone(report.overallScore);

  const selectCategory = (id: AuditCategoryId) => {
    setSelectedId(id);
    setExpandedId(null);
    const category = report.categories.find((item) => item.id === id);
    setFilter(category && category.checks.some((check) => check.status !== "pass") ? "issues" : "all");
  };

  const openIssue = (categoryId: AuditCategoryId, checkId: string) => {
    setSelectedId(categoryId);
    setFilter("issues");
    setExpandedId(checkId);
    requestAnimationFrame(() => {
      document.getElementById(`audit-check-${checkId}-row`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  if (!selected) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{report.title || "Untitled page"}</h2>
          <a
            href={pageUrl}
            onClick={(event) => {
              event.preventDefault();
              window.open(pageUrl, "_blank", "noopener,noreferrer");
            }}
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-[rgb(var(--muted))] hover:text-[rgb(var(--accent))]"
          >
            <span className="truncate">{pageUrl}</span>
            <ExternalLink size={11} className="shrink-0" />
          </a>
        </div>
        <p className="text-xs text-[rgb(var(--muted))]">
          Audited {formatDateTime(audit.createdAt)} · {(report.durationMs / 1000).toFixed(1)} s
        </p>
      </div>

      {report.partial && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Some checks couldn't be completed, so this report is partial. Categories marked below explain what's missing.
        </p>
      )}

      <div className="grid gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <ScoreRing score={report.overallScore} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Overall</p>
            <p className={cn("text-lg font-semibold", overallTone.text)}>{overallTone.label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <CountChip count={report.totals.critical} status="critical" />
              <CountChip count={report.totals.warnings} status="warning" />
              <CountChip count={report.totals.passed} status="pass" />
            </div>
          </div>
        </div>
        <div className="min-w-0 md:border-l md:border-[rgb(var(--border))] md:pl-5">
          <p className="text-sm font-semibold">Top fixes</p>
          {report.topIssues.length ? (
            <ol className="mt-2 space-y-1">
              {report.topIssues.map((issue) => {
                const meta = STATUS_META[issue.status];
                const Icon = meta.icon;
                const category = report.categories.find((item) => item.id === issue.categoryId);
                return (
                  <li key={`${issue.categoryId}-${issue.checkId}`}>
                    <button
                      type="button"
                      onClick={() => openIssue(issue.categoryId, issue.checkId)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Icon size={15} className={cn("mt-0.5 shrink-0", meta.tone)} aria-label={meta.label} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{issue.title}</span>
                        <span className="text-[rgb(var(--muted))]"> · {category?.label}</span>
                        <span className="block truncate text-xs text-[rgb(var(--muted))]">{issue.summary}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">No critical issues or warnings were found.</p>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Audit categories" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {report.categories.map((category) => {
          const tone = scoreTone(category.score);
          const active = category.id === selected.id;
          const issueCount = category.counts.critical + category.counts.warnings;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="audit-category-detail"
              onClick={() => selectCategory(category.id)}
              className={cn(
                "rounded-xl border bg-[rgb(var(--surface))] px-3 py-2.5 text-left transition",
                active
                  ? "border-[rgb(var(--accent))] ring-1 ring-[rgb(var(--accent))]"
                  : "border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/40"
              )}
            >
              <span className="block truncate text-xs text-[rgb(var(--muted))]">{category.label}</span>
              <span className={cn("block text-xl font-semibold tabular-nums", tone.text)}>{category.score ?? "–"}</span>
              <span className="block truncate text-[11px] text-[rgb(var(--muted))]">
                {category.incomplete
                  ? "Incomplete"
                  : issueCount
                    ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"}`
                    : category.score === null
                      ? "Nothing to check"
                      : "No issues"}
              </span>
            </button>
          );
        })}
      </div>

      <CategoryDetail
        category={selected}
        metrics={report.metrics}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
        filter={filter}
        onFilterChange={setFilter}
      />

      {report.notes.length > 0 && (
        <div className="text-xs text-[rgb(var(--muted))]">
          <p className="font-medium">About this audit</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
