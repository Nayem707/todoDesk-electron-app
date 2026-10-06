import { useMemo, useState } from "react";
import { TimerOff, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { SearchBar } from "../../components/SearchBar";
import { CARD } from "../../components/quiz/styles";
import { useQuizLibrary } from "../../hooks/quiz/useQuizLibrary";
import type { QuizDifficulty, QuizHistoryItem } from "../../types/quiz";
import { cn } from "../../utils/cn";
import { formatDateTime } from "../../utils/dates";
import { DIFFICULTY_LABEL, accuracyTone, formatElapsed } from "../../utils/quizFormat";

type DateFilter = "all" | "today" | "week" | "month";
type ScoreFilter = "all" | "high" | "mid" | "low";

const SELECT =
  "rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

const DAY_MS = 24 * 60 * 60 * 1000;

function matchesDate(completedAt: number, filter: DateFilter, now: number) {
  if (filter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return completedAt >= start.getTime();
  }
  if (filter === "week") {
    return completedAt >= now - 7 * DAY_MS;
  }
  if (filter === "month") {
    return completedAt >= now - 30 * DAY_MS;
  }
  return true;
}

function matchesScore(accuracy: number, filter: ScoreFilter) {
  if (filter === "high") {
    return accuracy >= 80;
  }
  if (filter === "mid") {
    return accuracy >= 60 && accuracy < 80;
  }
  if (filter === "low") {
    return accuracy < 60;
  }
  return true;
}

export function QuizHistory({ onOpen }: { onOpen: (attemptId: string) => void }) {
  const library = useQuizLibrary();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState<"all" | QuizDifficulty>("all");
  const [date, setDate] = useState<DateFilter>("all");
  const [score, setScore] = useState<ScoreFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<QuizHistoryItem | null>(null);

  const topics = useMemo(
    () => Array.from(new Set(library.history.map((item) => item.topic))).sort((a, b) => a.localeCompare(b)),
    [library.history]
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const needle = query.trim().toLowerCase();
    return library.history.filter(
      (item) =>
        (!needle || item.title.toLowerCase().includes(needle) || item.topic.toLowerCase().includes(needle)) &&
        (topic === "all" || item.topic === topic) &&
        (difficulty === "all" || item.difficulty === difficulty) &&
        matchesDate(item.completedAt, date, now) &&
        matchesScore(item.accuracy, score)
    );
  }, [date, difficulty, library.history, query, score, topic]);

  const filtersActive = query.trim() !== "" || topic !== "all" || difficulty !== "all" || date !== "all" || score !== "all";

  if (library.loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />;
  }
  if (library.history.length === 0) {
    return <EmptyState title="No quiz results yet" description="Completed quizzes appear here with their score, accuracy and time." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Search title or topic" ariaLabel="Search quiz history" />
        <select className={SELECT} value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Filter by topic">
          <option value="all">All topics</option>
          {topics.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as "all" | QuizDifficulty)}
          aria-label="Filter by difficulty"
        >
          <option value="all">All difficulties</option>
          {(Object.keys(DIFFICULTY_LABEL) as QuizDifficulty[]).map((item) => (
            <option key={item} value={item}>
              {DIFFICULTY_LABEL[item]}
            </option>
          ))}
        </select>
        <select className={SELECT} value={date} onChange={(event) => setDate(event.target.value as DateFilter)} aria-label="Filter by date">
          <option value="all">Any date</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
        <select className={SELECT} value={score} onChange={(event) => setScore(event.target.value as ScoreFilter)} aria-label="Filter by score">
          <option value="all">Any score</option>
          <option value="high">80% and above</option>
          <option value="mid">60–79%</option>
          <option value="low">Below 60%</option>
        </select>
      </div>

      <section className={cn(CARD, "p-0")}>
        <div className="hidden grid-cols-[minmax(0,1fr)_6rem_5rem_5rem_5.5rem_9.5rem_2rem] gap-3 border-b border-[rgb(var(--border))] px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))] md:grid">
          <span>Quiz</span>
          <span>Difficulty</span>
          <span className="text-right">Score</span>
          <span className="text-right">Accuracy</span>
          <span className="text-right">Time used</span>
          <span>Completed</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[rgb(var(--muted))]">
            No results match these filters.
            {filtersActive && (
              <button
                type="button"
                className="ml-1 text-[rgb(var(--accent))] hover:underline"
                onClick={() => {
                  setQuery("");
                  setTopic("all");
                  setDifficulty("all");
                  setDate("all");
                  setScore("all");
                }}
              >
                Clear filters
              </button>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-black/[0.03] md:grid-cols-[minmax(0,1fr)_6rem_5rem_5rem_5.5rem_9.5rem_2rem] dark:hover:bg-white/5"
                onClick={() => onOpen(item.id)}
              >
                <button
                  type="button"
                  className="min-w-0 text-left outline-none focus-visible:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item.id);
                  }}
                >
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-[rgb(var(--muted))]">
                    {item.topic} · {item.questionCount} questions
                    {item.submitReason === "timeout" && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400" title="Submitted automatically when time ran out">
                        <TimerOff size={11} /> timed out
                      </span>
                    )}
                  </p>
                </button>
                <span className="hidden text-sm md:block">{DIFFICULTY_LABEL[item.difficulty]}</span>
                <span className="text-right text-sm tabular-nums">
                  {item.score}/{item.total}
                  <span className={cn("ml-2 font-semibold md:hidden", accuracyTone(item.accuracy))}>{item.accuracy}%</span>
                </span>
                <span className={cn("hidden text-right text-sm font-semibold tabular-nums md:block", accuracyTone(item.accuracy))}>
                  {item.accuracy}%
                </span>
                <span className="hidden text-right text-sm tabular-nums md:block">{formatElapsed(item.timeUsedMs)}</span>
                <span className="hidden text-sm text-[rgb(var(--muted))] md:block">{formatDateTime(new Date(item.completedAt).toISOString())}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPendingDelete(item);
                  }}
                  className="hidden rounded-md p-1.5 text-[rgb(var(--muted))] opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 md:block dark:hover:bg-rose-950"
                  aria-label={`Delete result for ${item.title}`}
                  title="Delete result"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-[rgb(var(--muted))]">
        Showing {filtered.length} of {library.history.length} results.
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete result?"
        description={pendingDelete ? `This removes your result for "${pendingDelete.title}". The quiz itself stays saved.` : ""}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const item = pendingDelete;
          setPendingDelete(null);
          if (item) {
            await library.deleteAttempt(item.id);
          }
        }}
      />
    </div>
  );
}
