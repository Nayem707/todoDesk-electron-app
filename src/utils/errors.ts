import type { IpcResult } from "../types/todo";

export class AppError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result?.ok || result.data === undefined) {
    const message = result?.error || "Something went wrong. Please try again.";
    console.error("[IPC]", message, result);
    throw new AppError(message, result);
  }
  return result.data;
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
