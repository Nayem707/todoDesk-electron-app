import { useState } from "react";
import { Gauge, History } from "lucide-react";
import { AnalysisErrorCard, errorTitle } from "../components/AnalysisErrorCard";
import { AnalysisHistoryList } from "../components/AnalysisHistoryList";
import { AnalysisProgress } from "../components/AnalysisProgress";
import { AuditReport, scoreTone } from "../components/AuditReport";
import { EmptyState } from "../components/EmptyState";
import { Tabs } from "../components/Tabs";
import { UrlAnalyzeForm } from "../components/UrlAnalyzeForm";
import { useWebAudit } from "../hooks/useWebAudit";
import type { WebAuditStep } from "../types/webAudit";
import { cn } from "../utils/cn";

type Pane = "audit" | "auditHistory";

const AUDIT_STEPS: { id: WebAuditStep; label: string }[] = [
  { id: "loading", label: "Loading page" },
  { id: "inspecting", label: "Inspecting HTML" },
  { id: "metadata", label: "Checking metadata" },
  { id: "links", label: "Checking links" },
  { id: "images", label: "Checking images" },
  { id: "accessibility", label: "Checking accessibility" },
  { id: "performance", label: "Checking performance" },
  { id: "recommendations", label: "Generating recommendations" },
];

const AUDIT_ERROR_TITLES: Record<string, string> = {
  CANCELLED: "Audit stopped",
  BUSY: "Audit in progress",
};

/** Web Audit tool body; rendered inside the Web Analyze page, which owns the page header. */
export function WebAuditPage() {
  const { url, setUrl, running, step, audit, error, history, loadingHistory, start, cancel, openAudit, deleteAudit } =
    useWebAudit();
  const [pane, setPane] = useState<Pane>("audit");

  return (
    <div className="space-y-5">
      <Tabs
        items={[
          { id: "audit", label: "Audit", icon: Gauge },
          { id: "auditHistory", label: "History", icon: History, count: history.length },
        ]}
        value={pane}
        onChange={setPane}
        ariaLabel="Web Audit sections"
      />

      {pane === "audit" ? (
        <>
          <UrlAnalyzeForm
            inputId="web-audit-url"
            value={url}
            onChange={setUrl}
            running={running}
            onSubmit={() => void start()}
            onCancel={() => void cancel()}
            submitLabel="Start Audit"
            submitIcon={Gauge}
            placeholder="https://example.com"
            hint="Only public http:// and https:// pages. Web Audit only reads the page. It never signs in, submits forms or bypasses bot protection."
          />

          {running ? (
            <AnalysisProgress step={step} steps={AUDIT_STEPS} title="Auditing website…" />
          ) : error ? (
            <AnalysisErrorCard error={error} fallbackTitle="Audit failed" titleOverrides={AUDIT_ERROR_TITLES} />
          ) : audit?.report ? (
            <AuditReport key={audit.id} audit={audit} report={audit.report} />
          ) : (
            <EmptyState
              title="Audit a website"
              description="Enter a page address to check its SEO, accessibility, performance, security, HTML, links and images."
            />
          )}
        </>
      ) : (
        <AnalysisHistoryList
          items={history}
          loading={loadingHistory}
          onOpen={async (item) => {
            if (await openAudit(item.id)) {
              setPane("audit");
            }
          }}
          onDelete={(item) => void deleteAudit(item.id)}
          renderBadge={(item) => (
            <>
              <span className={cn("rounded-full bg-black/5 px-2 py-0.5 font-semibold tabular-nums dark:bg-white/10", scoreTone(item.overallScore).text)}>
                Score {item.overallScore ?? "–"}
              </span>
              {item.criticalCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                  {item.criticalCount} critical
                </span>
              )}
            </>
          )}
          failedLabel={(item) => errorTitle(item.errorCode, AUDIT_ERROR_TITLES) ?? "Failed"}
          emptyTitle="No audits yet"
          emptyDescription="Websites you audit are saved here so you can review their reports again."
          deleteLabel="Delete audit"
        />
      )}
    </div>
  );
}
