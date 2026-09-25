import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, History, ScanSearch, Square, Trash2 } from "lucide-react";
import { AnalysisProgress } from "../components/AnalysisProgress";
import { AutofillPanel } from "../components/AutofillPanel";
import { EmptyState } from "../components/EmptyState";
import { FormFieldTable, type FieldFillStatus } from "../components/FormFieldTable";
import { StatCard } from "../components/StatCard";
import { Tabs } from "../components/Tabs";
import { useAutofill } from "../hooks/useAutofill";
import { useFormAnalysis } from "../hooks/useFormAnalysis";
import { isUncertain } from "../services/formAssistantService";
import type {
  FormAnalysis,
  FormAnalysisError,
  FormAnalysisSummary,
} from "../types/formAssistant";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";

type Pane = "analyze" | "history";

const ERROR_TITLES: Record<string, string> = {
  INVALID_URL: "Invalid URL",
  UNSUPPORTED_URL: "Unsupported address",
  UNREACHABLE: "Website unreachable",
  TIMEOUT: "Navigation timed out",
  SSL_ERROR: "Certificate problem",
  NO_FORMS: "No forms found",
  PAGE_LOAD_FAILED: "Page failed to load",
  BROWSER_UNAVAILABLE: "Browser not available",
  BROWSER_ERROR: "Browser error",
  AUTH_REQUIRED: "Sign-in required",
  CAPTCHA_DETECTED: "CAPTCHA detected",
  BLOCKED: "Access blocked",
  TOO_MANY_REDIRECTS: "Too many redirects",
  CANCELLED: "Analysis stopped",
  BUSY: "Analysis in progress",
};

export function FormAssistantPage() {
  const {
    url,
    setUrl,
    running,
    step,
    analysis,
    error,
    history,
    loadingHistory,
    analyze,
    cancel,
    openAnalysis,
    deleteAnalysis,
    updateMapping,
  } = useFormAnalysis();
  const [pane, setPane] = useState<Pane>("analyze");

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Form Assistant</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Detect the form fields on a website and see what each one asks for.
        </p>
      </div>

      <Tabs
        items={[
          { id: "analyze", label: "Analyze", icon: ScanSearch },
          { id: "history", label: "History", icon: History, count: history.length },
        ]}
        value={pane}
        onChange={setPane}
        ariaLabel="Form Assistant sections"
      />

      {pane === "analyze" ? (
        <>
          <form
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark"
            onSubmit={(event) => {
              event.preventDefault();
              void analyze();
            }}
          >
            <label htmlFor="form-assistant-url" className="mb-1.5 block text-sm font-medium">
              Website URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="form-assistant-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                disabled={running}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/application"
                className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-60"
              />
              {running ? (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Square size={13} />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] transition hover:opacity-90 disabled:opacity-50"
                >
                  <ScanSearch size={15} />
                  Analyze Website
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-[rgb(var(--muted))]">
              Only public http:// and https:// pages. Nothing is filled in or submitted.
            </p>
          </form>

          {running ? (
            <AnalysisProgress step={step} />
          ) : error ? (
            <AnalysisErrorCard error={error} />
          ) : analysis ? (
            <AnalysisResult
              analysis={analysis}
              onMappingChange={(fieldKey, mappedField) => void updateMapping(fieldKey, mappedField)}
            />
          ) : (
            <EmptyState
              title="Analyze a website"
              description="Enter the address of a page with a form, such as an application or sign-up page, to detect its fields."
            />
          )}
        </>
      ) : (
        <HistoryList
          items={history}
          loading={loadingHistory}
          onOpen={async (item) => {
            if (await openAnalysis(item.id)) {
              setPane("analyze");
            }
          }}
          onDelete={(item) => void deleteAnalysis(item.id)}
        />
      )}
    </div>
  );
}

function hostOf(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function AnalysisErrorCard({ error }: { error: FormAnalysisError }) {
  const title = ERROR_TITLES[error.code] ?? "Analysis failed";
  const informational = error.code === "NO_FORMS" || error.code === "CANCELLED";
  return (
    <section
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-5",
        informational
          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
          : "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40"
      )}
    >
      <AlertTriangle
        size={18}
        className={cn("mt-0.5 shrink-0", informational ? "text-[rgb(var(--muted))]" : "text-[rgb(var(--danger))]")}
      />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">{error.message}</p>
      </div>
    </section>
  );
}

function AnalysisResult({
  analysis,
  onMappingChange,
}: {
  analysis: FormAnalysis;
  onMappingChange: Parameters<typeof FormFieldTable>[0]["onMappingChange"];
}) {
  const stats = useMemo(() => {
    const mapped = analysis.fields.filter((field) => field.mappedField).length;
    const review = analysis.fields.filter(isUncertain).length;
    return { mapped, review };
  }, [analysis.fields]);
  const pageUrl = analysis.finalUrl ?? analysis.url;
  const autofill = useAutofill(analysis);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const statuses = useMemo<Record<string, FieldFillStatus>>(() => {
    if (autofill.summary) {
      return Object.fromEntries(
        autofill.summary.results.map((result) => [
          result.key,
          { status: result.status, reason: result.reason, value: result.value },
        ])
      );
    }
    return Object.fromEntries(
      Object.values(autofill.plan).map((entry) => [
        entry.key,
        { status: entry.status, reason: entry.reason, value: entry.displayValue },
      ])
    );
  }, [autofill.plan, autofill.summary]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{analysis.title || "Untitled page"}</h2>
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
        <p className="text-xs text-[rgb(var(--muted))]">Analyzed {formatDateTime(analysis.createdAt)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Detected Fields" value={analysis.fields.length} tone="accent" />
        <StatCard label="Forms" value={analysis.forms.length} />
        <StatCard label="Mapped" value={stats.mapped} tone="success" />
        <StatCard label="Needs Review" value={stats.review} tone={stats.review ? "warning" : "default"} />
      </div>

      {analysis.warnings.length > 0 && (
        <ul className="space-y-2">
          {analysis.warnings.map((warning) => (
            <li
              key={warning.code}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <AutofillPanel
        plan={autofill.plan}
        filling={autofill.filling}
        phase={autofill.phase}
        liveResults={autofill.liveResults}
        summary={autofill.summary}
        error={autofill.error}
        browserOpen={autofill.browserOpen}
        onAutofill={() => void autofill.autofill()}
        onCancel={() => void autofill.cancel()}
        onCloseBrowser={() => void autofill.closeBrowser()}
        onViewResults={() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <div ref={tableRef} className="scroll-mt-4">
        <FormFieldTable fields={analysis.fields} statuses={statuses} onMappingChange={onMappingChange} />
      </div>
    </section>
  );
}

function HistoryList({
  items,
  loading,
  onOpen,
  onDelete,
}: {
  items: FormAnalysisSummary[];
  loading: boolean;
  onOpen: (item: FormAnalysisSummary) => void;
  onDelete: (item: FormAnalysisSummary) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No analyses yet"
        description="Websites you analyze are saved here so you can review their fields again."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(item);
            }
          }}
          className="cursor-pointer rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-5">
                {item.title || hostOf(item.url)}
              </h3>
              <p className="mt-0.5 truncate text-xs text-[rgb(var(--muted))]">{item.url}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
                {item.status === "completed" ? (
                  <span className="rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-[rgb(var(--accent))]">
                    {item.fieldCount} {item.fieldCount === 1 ? "field" : "fields"}
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                    {ERROR_TITLES[item.errorCode ?? ""] ?? "Failed"}
                  </span>
                )}
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
              className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
              aria-label="Delete analysis"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
