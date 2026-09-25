import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, History, ScanSearch } from "lucide-react";
import { AnalysisErrorCard, errorTitle } from "../components/AnalysisErrorCard";
import { AnalysisHistoryList } from "../components/AnalysisHistoryList";
import { AnalysisProgress } from "../components/AnalysisProgress";
import { AutofillPanel } from "../components/AutofillPanel";
import { EmptyState } from "../components/EmptyState";
import { FormFieldTable, type FieldFillStatus } from "../components/FormFieldTable";
import { StatCard } from "../components/StatCard";
import { Tabs } from "../components/Tabs";
import { UrlAnalyzeForm } from "../components/UrlAnalyzeForm";
import { useAutofill } from "../hooks/useAutofill";
import { useFormAnalysis } from "../hooks/useFormAnalysis";
import { isUncertain } from "../services/formAssistantService";
import type { FormAnalysis } from "../types/formAssistant";
import { formatDateTime } from "../utils/dates";

type Pane = "analyze" | "history";

/** Form Assistant tool body; rendered inside the Web Analyze page, which owns the page header. */
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
    <div className="space-y-5">
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
          <UrlAnalyzeForm
            inputId="form-assistant-url"
            value={url}
            onChange={setUrl}
            running={running}
            onSubmit={() => void analyze()}
            onCancel={() => void cancel()}
            submitLabel="Analyze Website"
            submitIcon={ScanSearch}
            placeholder="https://example.com/application"
            hint="Only public http:// and https:// pages. Nothing is filled in or submitted."
          />

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
        <AnalysisHistoryList
          items={history}
          loading={loadingHistory}
          onOpen={async (item) => {
            if (await openAnalysis(item.id)) {
              setPane("analyze");
            }
          }}
          onDelete={(item) => void deleteAnalysis(item.id)}
          renderBadge={(item) => (
            <span className="rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-[rgb(var(--accent))]">
              {item.fieldCount} {item.fieldCount === 1 ? "field" : "fields"}
            </span>
          )}
          failedLabel={(item) => errorTitle(item.errorCode) ?? "Failed"}
          emptyTitle="No analyses yet"
          emptyDescription="Websites you analyze are saved here so you can review their fields again."
          deleteLabel="Delete analysis"
        />
      )}
    </div>
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