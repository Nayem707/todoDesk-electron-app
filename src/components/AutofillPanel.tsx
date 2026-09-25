import { AlertTriangle, Ban, Check, CircleAlert, Loader2, Square, Wand2, X } from "lucide-react";
import {
  SEMANTIC_FIELD_LABELS,
  type AutofillPhase,
  type AutofillSummary,
  type FillFieldResult,
  type FillPlanEntry,
  type FormAnalysisError,
} from "../types/formAssistant";
import { cn } from "../utils/cn";

const PHASE_LABELS: Record<AutofillPhase, string> = {
  opening: "Opening browser window…",
  loading: "Loading page…",
  filling: "Filling fields…",
};

interface AutofillPanelProps {
  plan: Record<string, FillPlanEntry>;
  filling: boolean;
  phase: AutofillPhase | null;
  liveResults: FillFieldResult[];
  summary: AutofillSummary | null;
  error: FormAnalysisError | null;
  browserOpen: boolean;
  onAutofill: () => void;
  onCancel: () => void;
  onCloseBrowser: () => void;
  onViewResults: () => void;
}

const cardClass =
  "rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark";
const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10";

export function AutofillPanel(props: AutofillPanelProps) {
  const { plan, filling, phase, liveResults, summary, error, browserOpen } = props;

  if (filling) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Auto Filling…</p>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            <Square size={13} />
            Stop
          </button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {liveResults.map((result) => (
            <ResultLine key={result.key} result={result} />
          ))}
          <li className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={14} className="animate-spin text-[rgb(var(--accent))]" />
            {phase ? PHASE_LABELS[phase] : "Starting…"}
          </li>
        </ul>
      </section>
    );
  }

  const entries = Object.values(plan);
  const ready = entries.filter((entry) => entry.status === "ready").length;
  const review = entries.filter((entry) => entry.status === "review").length;
  const skipped = entries.filter((entry) => entry.status === "skipped").length;

  return (
    <section className={cardClass}>
      {summary ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">{summary.totalDetected} fields detected</span>
            <Count tone="text-emerald-700 dark:text-emerald-300" value={summary.filled} label="filled" />
            <Count tone="text-[rgb(var(--muted))]" value={summary.skipped} label="skipped" />
            <Count
              tone="text-amber-700 dark:text-amber-300"
              value={summary.review}
              label={summary.review === 1 ? "requires review" : "require review"}
            />
            {summary.failed > 0 && (
              <Count tone="text-[rgb(var(--danger))]" value={summary.failed} label="failed" />
            )}
          </div>
          <p className="mt-2 text-sm text-[rgb(var(--muted))]">
            {browserOpen
              ? "The form is filled in the browser window. Review it there and submit it yourself — nothing was submitted."
              : "Auto Fill finished. Nothing was submitted."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={props.onViewResults} className={secondaryButton}>
              View Results
            </button>
            {browserOpen && (
              <button type="button" onClick={props.onCloseBrowser} className={secondaryButton}>
                <X size={14} />
                Close browser window
              </button>
            )}
            <AutofillButton disabled={ready === 0} onClick={props.onAutofill} label="Auto Fill again" />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Auto Fill with test data</p>
            <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">
              {ready} ready · {skipped} skipped · {review} {review === 1 ? "needs" : "need"} review. Opens the
              page in a browser window and fills only these fields — nothing is submitted.
            </p>
          </div>
          <AutofillButton disabled={ready === 0} onClick={props.onAutofill} label="Auto Fill" />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[rgb(var(--danger))]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error.message}
        </p>
      )}
    </section>
  );
}

function AutofillButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "No fields are ready to fill" : undefined}
      className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] transition hover:opacity-90 disabled:opacity-50"
    >
      <Wand2 size={15} />
      {label}
    </button>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className={cn("tabular-nums", tone)}>
      {value} {label}
    </span>
  );
}

function ResultLine({ result }: { result: FillFieldResult }) {
  const label = result.mappedField ? SEMANTIC_FIELD_LABELS[result.mappedField] : result.field;
  const icon =
    result.status === "filled" ? (
      <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
    ) : result.status === "failed" ? (
      <X size={14} className="text-[rgb(var(--danger))]" />
    ) : result.status === "review" ? (
      <CircleAlert size={14} className="text-amber-600 dark:text-amber-400" />
    ) : (
      <Ban size={14} className="text-[rgb(var(--muted))]" />
    );
  return (
    <li className="flex items-center gap-2 text-sm">
      {icon}
      <span className={cn(result.status !== "filled" && "text-[rgb(var(--muted))]")}>
        {label}
        {result.status !== "filled" && result.reason && <> — {result.reason.toLowerCase()}</>}
      </span>
    </li>
  );
}
