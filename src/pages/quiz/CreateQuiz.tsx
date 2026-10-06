import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Play, RotateCcw, Settings2, Sparkles, Square } from "lucide-react";
import { AnalysisErrorCard } from "../../components/AnalysisErrorCard";
import { OptionGroup } from "../../components/quiz/OptionGroup";
import { CARD, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/quiz/styles";
import { useQuizAi } from "../../hooks/quiz/useQuizAi";
import { useQuizGenerator } from "../../hooks/quiz/useQuizGenerator";
import type { QuizConfigInput, QuizDifficulty, QuizGenerateProgress, QuizQuestionType, QuizTimeMode } from "../../types/quiz";
import { cn } from "../../utils/cn";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
  TIME_MODE_LABEL,
  formatDuration,
  timeLimitLabel,
} from "../../utils/quizFormat";

const TOPICS = [
  "JavaScript",
  "React",
  "Node.js",
  "Database",
  "Operating System",
  "Computer Networks",
  "Data Structures",
  "System Design",
];
const COUNTS = [5, 10, 15, 20, 30, 50];
const DIFFICULTIES: QuizDifficulty[] = ["easy", "medium", "hard", "expert"];
const TYPES: QuizQuestionType[] = ["single_choice", "multiple_choice", "true_false", "coding"];
const TIME_MODES: QuizTimeMode[] = ["none", "total", "per_question"];
const TOTAL_MINUTES = [5, 10, 15, 20, 30, 60];
const PER_QUESTION = [15, 30, 45, 60, 120];
const MAX_TOPIC = 80;

export const QUIZ_ERROR_TITLES: Record<string, string> = {
  OLLAMA_NOT_INSTALLED: "Ollama not installed",
  OLLAMA_UNAVAILABLE: "Ollama is not running",
  MODEL_UNAVAILABLE: "Model not available",
  NO_MODELS: "No models installed",
  MODEL_TIMEOUT: "Model timed out",
  INVALID_RESPONSE: "Invalid AI response",
  GENERATION_FAILED: "Generation failed",
  CANCELLED: "Generation stopped",
  BUSY: "Generation in progress",
  INVALID_CONFIG: "Check the quiz settings",
  INVALID_URL: "Invalid Ollama URL",
  DATABASE_ERROR: "Storage problem",
};
const AI_SETUP_ERRORS = new Set(["OLLAMA_NOT_INSTALLED", "OLLAMA_UNAVAILABLE", "MODEL_UNAVAILABLE", "NO_MODELS", "INVALID_URL"]);

const DEFAULT_FORM: QuizConfigInput = {
  topic: "",
  questionCount: 10,
  difficulty: "medium",
  questionTypes: ["single_choice"],
  timeMode: "total",
  totalMinutes: 10,
  perQuestionSeconds: 30,
  focus: "",
  similarToQuizId: null,
};

/** The form survives tab switches. */
let draft: QuizConfigInput = { ...DEFAULT_FORM };

function withDefaults(config: Partial<QuizConfigInput>): QuizConfigInput {
  return {
    ...draft,
    ...config,
    totalMinutes: config.totalMinutes ?? draft.totalMinutes ?? DEFAULT_FORM.totalMinutes,
    perQuestionSeconds: config.perQuestionSeconds ?? draft.perQuestionSeconds ?? DEFAULT_FORM.perQuestionSeconds,
    similarToQuizId: config.similarToQuizId ?? null,
  };
}

interface CreateQuizProps {
  prefill: Partial<QuizConfigInput> | null;
  onStart: (quizId: string) => void;
  onOpenSettings: () => void;
}

export function CreateQuiz({ prefill, onStart, onOpenSettings }: CreateQuizProps) {
  const [form, setFormState] = useState<QuizConfigInput>(() => (prefill ? withDefaults(prefill) : draft));
  const { running, progress, quiz, error, startedAt, generate, cancel, reset } = useQuizGenerator();
  const ai = useQuizAi();
  const { reload: reloadAi } = ai;

  useEffect(() => {
    if (prefill) {
      const next = withDefaults(prefill);
      draft = next;
      setFormState(next);
    }
  }, [prefill]);

  useEffect(() => {
    if (quiz) {
      void reloadAi();
    }
  }, [quiz, reloadAi]);

  const setForm = (patch: Partial<QuizConfigInput>) =>
    setFormState((previous) => {
      const next = { ...previous, ...patch };
      if ("topic" in patch && patch.topic !== previous.topic) {
        next.similarToQuizId = null;
      }
      draft = next;
      return next;
    });

  const topic = form.topic.trim();
  const topicError = !topic ? "Enter or choose a topic." : topic.length > MAX_TOPIC ? `Keep the topic under ${MAX_TOPIC} characters.` : "";
  const typeError =
    form.questionTypes.length === 0
      ? "Choose at least one question type."
      : form.questionTypes.length > form.questionCount
        ? "Choose fewer question types than questions."
        : "";
  const canGenerate = !topicError && !typeError && !running;

  const submit = () => {
    if (!canGenerate) {
      return;
    }
    void generate({
      ...form,
      topic,
      focus: form.focus.trim(),
      totalMinutes: form.timeMode === "total" ? form.totalMinutes : null,
      perQuestionSeconds: form.timeMode === "per_question" ? form.perQuestionSeconds : null,
    });
  };

  if (quiz && !running) {
    return (
      <section className={CARD}>
        <div className="flex items-start gap-3">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Quiz ready</p>
            <h2 className="mt-1 text-xl font-semibold">{quiz.title}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {quiz.questionCount} questions · {quiz.topic} · {DIFFICULTY_LABEL[quiz.difficulty]} ·{" "}
              {timeLimitLabel(quiz.timeMode, quiz.totalSeconds, quiz.perQuestionSeconds)}
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">
              {quiz.questionTypes.map((type) => QUESTION_TYPE_LABEL[type]).join(", ")} · generated by {quiz.model}
            </p>
            {quiz.timeMode === "per_question" && (
              <p className="mt-3 text-sm text-[rgb(var(--muted))]">
                Per-question timing: questions are answered in order, and each one closes when its time runs out.
              </p>
            )}
            {quiz.timeMode === "total" && (
              <p className="mt-3 text-sm text-[rgb(var(--muted))]">
                The timer starts when you press Start and keeps running even if you leave the quiz or close the app.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={PRIMARY_BUTTON} onClick={() => onStart(quiz.id)}>
                <Play size={15} /> Start Quiz
              </button>
              <button type="button" className={SECONDARY_BUTTON} onClick={reset}>
                <RotateCcw size={14} /> Create another
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={running} className="space-y-5">
        <section className={CARD}>
          <label htmlFor="quiz-topic" className="mb-1.5 block text-sm font-medium">
            Topic
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {TOPICS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={topic.toLowerCase() === item.toLowerCase()}
                onClick={() => setForm({ topic: item })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition disabled:opacity-60",
                  topic.toLowerCase() === item.toLowerCase()
                    ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 font-medium"
                    : "border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <input
            id="quiz-topic"
            value={form.topic}
            maxLength={MAX_TOPIC + 20}
            onChange={(event) => setForm({ topic: event.target.value })}
            placeholder="Or type a custom topic, e.g. Python decorators"
            autoComplete="off"
            className={INPUT}
            aria-invalid={Boolean(topic) && Boolean(topicError)}
          />
          {topic && topicError && <p className="mt-1.5 text-xs text-[rgb(var(--danger))]">{topicError}</p>}

          <label htmlFor="quiz-focus" className="mb-1.5 mt-4 block text-sm font-medium">
            Focus areas <span className="font-normal text-[rgb(var(--muted))]">(optional)</span>
          </label>
          <input
            id="quiz-focus"
            value={form.focus}
            maxLength={300}
            onChange={(event) => setForm({ focus: event.target.value })}
            placeholder="e.g. closures, event loop, promises"
            autoComplete="off"
            className={INPUT}
          />
        </section>

        <section className={cn(CARD, "space-y-5")}>
          <OptionGroup
            label="Number of questions"
            options={COUNTS.map((value) => ({ value, label: String(value) }))}
            isSelected={(value) => form.questionCount === value}
            onSelect={(value) => setForm({ questionCount: value })}
            disabled={running}
            hint={form.questionCount >= 30 ? "Large quizzes take several minutes to generate on a local model." : undefined}
          />
          <OptionGroup
            label="Difficulty"
            options={DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABEL[value] }))}
            isSelected={(value) => form.difficulty === value}
            onSelect={(value) => setForm({ difficulty: value })}
            disabled={running}
          />
          <OptionGroup
            label="Question type"
            multiple
            options={TYPES.map((value) => ({ value, label: QUESTION_TYPE_LABEL[value] }))}
            isSelected={(value) => form.questionTypes.includes(value)}
            onSelect={(value) =>
              setForm({
                questionTypes: form.questionTypes.includes(value)
                  ? form.questionTypes.filter((type) => type !== value)
                  : TYPES.filter((type) => type === value || form.questionTypes.includes(type)),
              })
            }
            disabled={running}
            hint={
              typeError ||
              (form.questionTypes.includes("coding")
                ? "Coding questions show a snippet and ask about its output or bugs. Code is displayed only, never run."
                : "Select more than one to mix question types.")
            }
          />
        </section>

        <section className={cn(CARD, "space-y-5")}>
          <OptionGroup
            label="Time mode"
            options={TIME_MODES.map((value) => ({ value, label: TIME_MODE_LABEL[value] }))}
            isSelected={(value) => form.timeMode === value}
            onSelect={(value) => setForm({ timeMode: value })}
            disabled={running}
          />
          {form.timeMode === "total" && (
            <OptionGroup
              label="Total quiz time"
              options={TOTAL_MINUTES.map((value) => ({ value, label: `${value} minutes` }))}
              isSelected={(value) => form.totalMinutes === value}
              onSelect={(value) => setForm({ totalMinutes: value })}
              disabled={running}
              hint="The quiz is submitted automatically when time runs out."
            />
          )}
          {form.timeMode === "per_question" && (
            <OptionGroup
              label="Time per question"
              options={PER_QUESTION.map((value) => ({ value, label: `${value} seconds` }))}
              isSelected={(value) => form.perQuestionSeconds === value}
              onSelect={(value) => setForm({ perQuestionSeconds: value })}
              disabled={running}
              hint="Questions are answered in order. When time runs out, the quiz moves to the next question."
            />
          )}
        </section>
      </fieldset>

      {running ? (
        <GenerationProgress
          progress={progress}
          startedAt={startedAt ?? Date.now()}
          model={ai.config?.model}
          onCancel={() => void cancel()}
        />
      ) : (
        <>
          {error && (
            <AnalysisErrorCard
              error={error}
              fallbackTitle="Generation failed"
              titleOverrides={QUIZ_ERROR_TITLES}
              action={
                AI_SETUP_ERRORS.has(error.code) ? (
                  <button type="button" className={SECONDARY_BUTTON} onClick={onOpenSettings}>
                    <Settings2 size={14} /> Open AI Settings
                  </button>
                ) : error.code !== "INVALID_CONFIG" ? (
                  <button type="button" className={SECONDARY_BUTTON} onClick={submit} disabled={!canGenerate}>
                    <RotateCcw size={14} /> Try Again
                  </button>
                ) : undefined
              }
            />
          )}
          <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3")}>
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {form.questionCount} questions · {DIFFICULTY_LABEL[form.difficulty]} ·{" "}
                {form.timeMode === "total"
                  ? `${form.totalMinutes} min total`
                  : form.timeMode === "per_question"
                    ? `${form.perQuestionSeconds}s per question (up to ${formatDuration((form.perQuestionSeconds ?? 0) * form.questionCount * 1000)})`
                    : "No time limit"}
              </p>
              <AiReadiness ai={ai} onOpenSettings={onOpenSettings} />
            </div>
            <button type="submit" className={PRIMARY_BUTTON} disabled={!canGenerate} title={topicError || typeError || undefined}>
              <Sparkles size={15} /> Generate Quiz
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function AiReadiness({ ai, onOpenSettings }: { ai: ReturnType<typeof useQuizAi>; onOpenSettings: () => void }) {
  if (ai.checking && !ai.status) {
    return <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">Checking Ollama…</p>;
  }
  const status = ai.status;
  if (!status) {
    return null;
  }
  const problem = !status.connected || status.models.length === 0 || (ai.config?.model && !status.modelAvailable);
  if (problem) {
    return (
      <p className="mt-0.5 text-xs text-[rgb(var(--danger))]">
        {status.message}{" "}
        <button type="button" onClick={onOpenSettings} className="underline underline-offset-2">
          AI Settings
        </button>
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
      Generated on this computer by {ai.config?.model || "your first installed model"} via Ollama.
    </p>
  );
}

function GenerationProgress({
  progress,
  startedAt,
  model,
  onCancel,
}: {
  progress: QuizGenerateProgress | null;
  startedAt: number;
  model: string | undefined;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  const generated = progress?.generated ?? 0;
  const percent = total ? Math.round((generated / total) * 100) : 0;
  let label = "Checking Ollama and the model…";
  if (progress?.phase === "generating") {
    label = `Generating questions${model ? ` with ${model}` : ""}…`;
  } else if (progress?.phase === "saving") {
    label = "Saving the quiz…";
  }

  return (
    <section ref={cardRef} className={CARD} aria-live="polite" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 size={16} className="animate-spin text-[rgb(var(--accent))]" />
          {label}
        </div>
        <button type="button" className={SECONDARY_BUTTON} onClick={onCancel}>
          <Square size={13} /> Cancel
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div className="h-full rounded-full bg-[rgb(var(--accent))] transition-all" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[rgb(var(--muted))]">
        <span>
          {total ? (
            <>
              <span className="font-semibold tabular-nums text-[rgb(var(--text))]">{generated}</span> of {total} questions
              {progress?.attempt && progress.attempt > 1 ? " · retrying a response that failed validation" : ""}
            </>
          ) : (
            "Preparing…"
          )}
        </span>
        <span className="tabular-nums">{formatDuration(now - startedAt)} elapsed</span>
      </div>
      <p className="mt-3 text-xs text-[rgb(var(--muted))]">
        Runs entirely on your computer. Questions are generated in small batches and checked before they are used; larger quizzes
        and models take longer.
      </p>
    </section>
  );
}
