/** An error whose message is safe to show to the user. `code` lets the UI pick a title. */
export class QuizError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuizError";
    this.code = code;
  }
}

const FALLBACK = { code: "QUIZ_FAILED", message: "Something went wrong with the quiz. Try again." };

/** Turn any thrown value into `{ code, message }` without leaking internal details. */
export function toUserError(error, fallback = FALLBACK) {
  if (error instanceof QuizError || error?.name === "OllamaError") {
    return { code: error.code, message: error.message };
  }
  return { ...fallback };
}
