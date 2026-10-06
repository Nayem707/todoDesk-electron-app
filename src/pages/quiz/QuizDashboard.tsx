import { useState } from "react";
import { ChevronRight, Play, PlusCircle, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { AccuracyBars } from "../../components/quiz/AccuracyBars";
import { AiStatusBadge } from "../../components/quiz/AiStatusBadge";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/quiz/styles";
import { useNow } from "../../hooks/quiz/useNow";
import { useQuizAi } from "../../hooks/quiz/useQuizAi";
import { useQuizLibrary } from "../../hooks/quiz/useQuizLibrary";
import type { QuizAttempt, QuizSummary } from "../../types/quiz";
import { cn } from "../../utils/cn";
import { formatDateTime } from "../../utils/dates";
import { DIFFICULTY_LABEL, accuracyBar, accuracyTone, formatClock, formatDuration, timeLimitLabel } from "../../utils/quizFormat";

interface QuizDashboardProps {
  onCreate: () => void;
  onStart: (quizId: string) => void;
  onResume: (attemptId: string) => void;
  onOpenResult: (attemptId: string) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

export function QuizDashboard({ onCreate, onStart, onResume, onOpenResult, onOpenHistory, onOpenSettings }: QuizDashboardProps) {
  const library = useQuizLibrary();
  const ai = useQuizAi();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QuizSummary | null>(null);
  const { stats, history, quizzes, active } = library;

  if (library.loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
      </div>
    );
  }

  const hasResults = (stats?.totalAttempts ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AiStatusBadge config={ai.config} status={ai.status} checking={ai.checking} onClick={onOpenSettings} />
        <button type="button" className={PRIMARY_BUTTON} onClick={onCreate}>
          <PlusCircle size={15} /> Create Quiz
        </button>
      </div>

      {active && <ResumeCard attempt={active} onResume={() => onResume(active.id)} onDiscard={() => setConfirmDiscard(true)} />}

      {!hasResults && quizzes.length === 0 ? (
        <EmptyState
          title="Create your first quiz"
          description="Pick a topic, difficulty and time limit. Your local AI model writes the questions; results stay on this computer."
          action={
            <button type="button" className={PRIMARY_BUTTON} onClick={onCreate}>
              <PlusCircle size={15} /> Create Quiz
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Quizzes completed" value={stats?.totalAttempts ?? 0} />
            <StatCard
              label="Average accuracy"
              value={stats?.averageAccuracy === null || stats?.averageAccuracy === undefined ? "–" : `${stats.averageAccuracy}%`}
              tone="accent"
            />
            <StatCard label="Best score" value={stats?.bestAccuracy === null || stats?.bestAccuracy === undefined ? "–" : `${stats.bestAccuracy}%`} tone="success" />
            <StatCard
              label="Questions answered"
              value={stats?.questionsAnswered ?? 0}
              hint={stats?.totalTimeMs ? `${formatDuration(stats.totalTimeMs)} in quizzes` : undefined}
            />
          </div>

          {hasResults && stats && (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className={CARD}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Performance by topic</h2>
                  {stats.recentAccuracy.length > 1 && <Trend values={stats.recentAccuracy} />}
                </div>
                <div className="mt-3">
                  <AccuracyBars
                    rows={stats.byTopic.map((item) => ({
                      label: item.label,
                      accuracy: item.averageAccuracy ?? 0,
                      detail: `${item.attempts} ${item.attempts === 1 ? "quiz" : "quizzes"}`,
                    }))}
                    emptyText="No topics yet."
                  />
                </div>
              </section>
              <section className={CARD}>
                <h2 className="text-sm font-semibold">Concepts from recent quizzes</h2>
                <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">Concepts seen at least twice; below 60% needs work, 80%+ is strong.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <ConceptList title="Needs improvement" items={stats.weakConcepts} empty="Nothing below 60% yet." />
                  <ConceptList title="Strong areas" items={stats.strongConcepts} empty="Keep practising to find your strengths." />
                </div>
              </section>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className={CARD}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent results</h2>
                {history.length > 0 && (
                  <button type="button" onClick={onOpenHistory} className="inline-flex items-center gap-0.5 text-xs text-[rgb(var(--accent))] hover:underline">
                    View all <ChevronRight size={13} />
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="mt-3 text-sm text-[rgb(var(--muted))]">Finish a quiz to see your results here.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[rgb(var(--border))]">
                  {history.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenResult(item.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-xs text-[rgb(var(--muted))]">
                            {item.topic} · {DIFFICULTY_LABEL[item.difficulty]} · {formatDateTime(new Date(item.completedAt).toISOString())}
                          </p>
                        </div>
                        <span className="text-sm tabular-nums">
                          {item.score}/{item.total}
                        </span>
                        <span className={cn("w-11 text-right text-sm font-semibold tabular-nums", accuracyTone(item.accuracy))}>
                          {item.accuracy}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={CARD}>
              <h2 className="text-sm font-semibold">Saved quizzes</h2>
              {quizzes.length === 0 ? (
                <p className="mt-3 text-sm text-[rgb(var(--muted))]">Quizzes you generate are kept here so you can take them again.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[rgb(var(--border))]">
                  {quizzes.slice(0, 6).map((quiz) => (
                    <li key={quiz.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{quiz.title}</p>
                        <p className="truncate text-xs text-[rgb(var(--muted))]">
                          {quiz.questionCount} questions · {DIFFICULTY_LABEL[quiz.difficulty]} ·{" "}
                          {timeLimitLabel(quiz.timeMode, quiz.totalSeconds, quiz.perQuestionSeconds)}
                          {quiz.attemptCount > 0 ? ` · best ${quiz.bestAccuracy}%` : " · not taken yet"}
                        </p>
                      </div>
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => onStart(quiz.id)}>
                        <Play size={13} /> {quiz.attemptCount > 0 ? "Retake" : "Start"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(quiz)}
                        className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                        aria-label={`Delete ${quiz.title} and its results`}
                        title="Delete quiz and its results"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unfinished quiz?"
        description="Your answers for this attempt will be deleted. The quiz itself stays saved so you can take it again."
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          setConfirmDiscard(false);
          await library.discardActive();
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete quiz?"
        description={
          !pendingDelete
            ? ""
            : pendingDelete.attemptCount === 0
              ? `"${pendingDelete.title}" will be permanently deleted.`
              : `"${pendingDelete.title}" and ${pendingDelete.attemptCount === 1 ? "its result" : `all ${pendingDelete.attemptCount} of its results`} will be permanently deleted.`
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const quiz = pendingDelete;
          setPendingDelete(null);
          if (quiz) {
            await library.deleteQuiz(quiz.id);
          }
        }}
      />
    </div>
  );
}

function ResumeCard({ attempt, onResume, onDiscard }: { attempt: QuizAttempt; onResume: () => void; onDiscard: () => void }) {
  const [offset] = useState(() => attempt.serverNow - Date.now());
  const now = useNow(attempt.timeMode === "total", 1000) + offset;
  const answered = attempt.questions.filter((question) => question.selected.length > 0).length;
  return (
    <section className={cn(CARD, "flex flex-wrap items-center gap-4 border-[rgb(var(--accent))]/50")}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--accent))]">Unfinished quiz</p>
        <p className="mt-0.5 truncate font-semibold">{attempt.title}</p>
        <p className="text-sm text-[rgb(var(--muted))]">
          {answered} of {attempt.questions.length} answered
          {attempt.timeMode === "total" && attempt.deadlineAt
            ? ` · ${formatClock(Math.max(0, attempt.deadlineAt - now))} left`
            : attempt.timeMode === "per_question"
              ? ` · question ${attempt.currentIndex + 1} of ${attempt.questions.length}`
              : ""}
        </p>
      </div>
      <button type="button" className={SECONDARY_BUTTON} onClick={onDiscard}>
        Discard
      </button>
      <button type="button" className={PRIMARY_BUTTON} onClick={onResume}>
        <Play size={14} /> Resume
      </button>
    </section>
  );
}

function ConceptList({ title, items, empty }: { title: string; items: { label: string; accuracy: number; total: number }[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
              <span className={cn("shrink-0 text-xs font-semibold tabular-nums", accuracyTone(item.accuracy))}>
                {item.accuracy}% <span className="font-normal text-[rgb(var(--muted))]">of {item.total}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Accuracy of the last attempts, oldest to newest. */
function Trend({ values }: { values: number[] }) {
  return (
    <div className="flex h-6 items-end gap-0.5" aria-label={`Recent accuracy: ${values.join("%, ")}%`} role="img">
      {values.map((value, index) => (
        <span key={index} className={cn("w-1.5 rounded-sm", accuracyBar(value))} style={{ height: `${Math.max(12, value)}%` }} title={`${value}%`} />
      ))}
    </div>
  );
}
