import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { quizService } from "../../services/quizService";
import type { PerformanceAnalysis } from "../../types/quiz";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/dates";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

interface PerformanceAnalysisCardProps {
  attemptId: string;
  initial: PerformanceAnalysis | null;
  onPracticeTopic: (topic: string) => void;
}

/** Optional AI review of the attempt, generated locally through Ollama and saved with the result. */
export function PerformanceAnalysisCard({ attemptId, initial, onPracticeTopic }: PerformanceAnalysisCardProps) {
  const [analysis, setAnalysis] = useState<PerformanceAnalysis | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (force: boolean) => {
    setRunning(true);
    setError(null);
    try {
      setAnalysis(await quizService.ai.analyzePerformance(attemptId, force));
    } catch (analyzeError) {
      setError(getErrorMessage(analyzeError, "The analysis could not be generated."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className={CARD} aria-busy={running}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-[rgb(var(--accent))]" /> AI performance analysis
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">
            {analysis
              ? `Generated locally by ${analysis.model} · ${formatDateTime(analysis.createdAt)}`
              : "Sends this result to your local model for a review of strengths, gaps and time management. Nothing leaves your computer."}
          </p>
        </div>
        {analysis ? (
          <button type="button" className={SECONDARY_BUTTON} disabled={running} onClick={() => void analyze(true)}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Regenerate
          </button>
        ) : (
          <button type="button" className={PRIMARY_BUTTON} disabled={running} onClick={() => void analyze(false)}>
            {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {running ? "Analyzing…" : "Analyze my performance"}
          </button>
        )}
      </div>

      {running && !analysis && (
        <p className="mt-4 text-sm text-[rgb(var(--muted))]">Your local model is reviewing the answers. This can take a minute.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {analysis && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="leading-relaxed">{analysis.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AnalysisList title="Strong areas" items={analysis.strengths} tone="good" empty="No clear strengths yet." />
            <AnalysisList
              title="Needs improvement"
              items={[...analysis.weaknesses, ...analysis.missedConcepts.filter((item) => !analysis.weaknesses.includes(item))]}
              tone="warn"
              empty="Nothing stood out."
            />
          </div>
          {(analysis.difficultyInsight || analysis.timeManagement) && (
            <dl className="grid gap-3 sm:grid-cols-2">
              {analysis.difficultyInsight && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Difficulty</dt>
                  <dd className="mt-1 leading-relaxed">{analysis.difficultyInsight}</dd>
                </div>
              )}
              {analysis.timeManagement && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Time management</dt>
                  <dd className="mt-1 leading-relaxed">{analysis.timeManagement}</dd>
                </div>
              )}
            </dl>
          )}
          {analysis.recommendations.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Recommendations</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
                {analysis.recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.suggestedTopics.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Practise next</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.suggestedTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => onPracticeTopic(topic)}
                    title="Create a quiz on this topic"
                    className="rounded-full border border-[rgb(var(--accent))]/40 px-3 py-1 text-xs text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/10"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AnalysisList({ title, items, tone, empty }: { title: string; items: string[]; tone: "good" | "warn"; empty: string }) {
  const Icon = tone === "good" ? CheckCircle2 : AlertTriangle;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-[rgb(var(--muted))]">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Icon
                size={14}
                className={tone === "good" ? "mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" : "mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
