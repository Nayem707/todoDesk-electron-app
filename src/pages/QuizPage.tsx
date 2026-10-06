import { useCallback, useState } from "react";
import { History, LayoutDashboard, PlusCircle, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Tabs } from "../components/Tabs";
import { useQuizGenerator } from "../hooks/quiz/useQuizGenerator";
import { quizService } from "../services/quizService";
import type { QuizAttempt, QuizConfigInput } from "../types/quiz";
import { getErrorMessage } from "../utils/errors";
import { CreateQuiz } from "./quiz/CreateQuiz";
import { QuizAiSettings } from "./quiz/QuizAiSettings";
import { QuizDashboard } from "./quiz/QuizDashboard";
import { QuizHistory } from "./quiz/QuizHistory";
import { QuizResult } from "./quiz/QuizResult";
import { QuizSession } from "./quiz/QuizSession";

type QuizView = "dashboard" | "create" | "history" | "settings" | "session" | "result";
type TabView = Extract<QuizView, "dashboard" | "create" | "history" | "settings">;

/** Remembered across navigation so returning to Quiz reopens the same screen. */
const nav: { view: QuizView; attemptId: string | null } = { view: "dashboard", attemptId: null };

function configFromAttempt(attempt: QuizAttempt): QuizConfigInput {
  return {
    topic: attempt.topic,
    questionCount: attempt.questions.length,
    difficulty: attempt.difficulty,
    questionTypes: attempt.questionTypes,
    timeMode: attempt.timeMode,
    totalMinutes: attempt.totalSeconds ? Math.round(attempt.totalSeconds / 60) : null,
    perQuestionSeconds: attempt.perQuestionSeconds,
    focus: attempt.focus,
  };
}

export function QuizPage() {
  const [view, setView] = useState<QuizView>(nav.view);
  const [attemptId, setAttemptId] = useState<string | null>(nav.attemptId);
  const [prefill, setPrefill] = useState<Partial<QuizConfigInput> | null>(null);
  const [conflictQuizId, setConflictQuizId] = useState<string | null>(null);
  const generator = useQuizGenerator();

  const go = useCallback((next: QuizView, id: string | null = null) => {
    nav.view = next;
    nav.attemptId = id;
    setView(next);
    setAttemptId(id);
  }, []);

  const startQuiz = useCallback(
    async (quizId: string, replaceActive = false) => {
      try {
        const response = await quizService.start(quizId, replaceActive);
        if (response.attempt) {
          go("session", response.attempt.id);
        } else if (response.activeAttemptId) {
          setConflictQuizId(quizId);
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "The quiz could not be started."));
      }
    },
    [go]
  );

  const openCreate = useCallback(
    (config?: Partial<QuizConfigInput>) => {
      setPrefill(config ?? null);
      go("create");
    },
    [go]
  );

  const generateSimilar = useCallback(
    (attempt: QuizAttempt) => {
      const config = { ...configFromAttempt(attempt), similarToQuizId: attempt.quizId };
      setPrefill(config);
      go("create");
      void generator.generate(config);
    },
    [generator, go]
  );

  if (view === "session" && attemptId) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <QuizSession
          attemptId={attemptId}
          onExit={() => go("dashboard")}
          onCompleted={(attempt) => go("result", attempt.id)}
        />
      </div>
    );
  }

  const tab: TabView = view === "result" || view === "session" ? "history" : view;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Quiz</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Generate quizzes with a local AI model, take them with a timer, and track your progress. Works offline.
        </p>
      </div>

      <Tabs<TabView>
        items={[
          { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { id: "create", label: "Create Quiz", icon: PlusCircle },
          { id: "history", label: "History", icon: History },
          { id: "settings", label: "AI Settings", icon: SlidersHorizontal },
        ]}
        value={tab}
        onChange={(next) => {
          if (next === "create") {
            setPrefill(null);
          }
          go(next);
        }}
        ariaLabel="Quiz sections"
      />

      {view === "dashboard" && (
        <QuizDashboard
          onCreate={() => openCreate()}
          onStart={(quizId) => void startQuiz(quizId)}
          onResume={(id) => go("session", id)}
          onOpenResult={(id) => go("result", id)}
          onOpenHistory={() => go("history")}
          onOpenSettings={() => go("settings")}
        />
      )}
      {view === "create" && (
        <CreateQuiz prefill={prefill} onStart={(quizId) => void startQuiz(quizId)} onOpenSettings={() => go("settings")} />
      )}
      {view === "history" && <QuizHistory onOpen={(id) => go("result", id)} />}
      {view === "settings" && <QuizAiSettings />}
      {view === "result" && attemptId && (
        <QuizResult
          attemptId={attemptId}
          onBack={() => go("dashboard")}
          onRetry={(quizId) => void startQuiz(quizId)}
          onGenerateSimilar={generateSimilar}
          onPracticeTopic={(topic, attempt) => openCreate({ ...configFromAttempt(attempt), topic, focus: "" })}
        />
      )}

      <ConfirmDialog
        open={Boolean(conflictQuizId)}
        title="Discard your unfinished quiz?"
        description="You already have a quiz in progress. Starting this one discards its answers. To keep it, cancel and resume it from the dashboard."
        confirmLabel="Discard and start"
        danger
        onCancel={() => setConflictQuizId(null)}
        onConfirm={async () => {
          const quizId = conflictQuizId;
          setConflictQuizId(null);
          if (quizId) {
            await startQuiz(quizId, true);
          }
        }}
      />
    </div>
  );
}
