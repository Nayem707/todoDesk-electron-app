import type { QuizAiConfig, QuizConfigInput, QuizGenerateProgress, QuizSubmitReason } from "../types/quiz";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.quizAPI) {
    throw new Error("Quiz is unavailable. Restart the application.");
  }
  return window.quizAPI;
}

export const quizService = {
  generate: (config: QuizConfigInput, requestId: string) => unwrap(api().generate(config, requestId)),
  cancelGenerate: (requestId: string) => unwrap(api().cancelGenerate(requestId)),
  onGenerateProgress: (callback: (event: QuizGenerateProgress) => void) => api().onGenerateProgress(callback),
  list: () => unwrap(api().list()),
  deleteQuiz: (quizId: string) => unwrap(api().deleteQuiz(quizId)),
  start: (quizId: string, replaceActive = false) => unwrap(api().start(quizId, { replaceActive })),
  getActive: () => unwrap(api().getActive()),
  getById: (attemptId: string) => unwrap(api().getById(attemptId)),
  saveAnswer: (attemptId: string, questionId: string, input: { selected?: string[]; marked?: boolean }) =>
    unwrap(api().saveAnswer(attemptId, questionId, input)),
  navigate: (attemptId: string, toIndex: number) => unwrap(api().navigate(attemptId, toIndex)),
  advance: (attemptId: string, fromIndex: number, reason: QuizSubmitReason) =>
    unwrap(api().advance(attemptId, fromIndex, reason)),
  submit: (attemptId: string, reason: QuizSubmitReason) => unwrap(api().submit(attemptId, reason)),
  pause: (attemptId: string) => unwrap(api().pause(attemptId)),
  resume: (attemptId: string) => unwrap(api().resume(attemptId)),
  discard: (attemptId: string) => unwrap(api().discard(attemptId)),
  deleteAttempt: (attemptId: string) => unwrap(api().deleteAttempt(attemptId)),
  history: () => unwrap(api().history()),
  stats: () => unwrap(api().stats()),
  ai: {
    getConfig: () => unwrap(api().ai.getConfig()),
    saveConfig: (patch: Partial<QuizAiConfig>) => unwrap(api().ai.saveConfig(patch)),
    getModels: (baseUrl?: string) => unwrap(api().ai.getModels(baseUrl)),
    checkConnection: (input?: Partial<QuizAiConfig>) => unwrap(api().ai.checkConnection(input)),
    analyzePerformance: (attemptId: string, force = false) => unwrap(api().ai.analyzePerformance(attemptId, force)),
  },
};
