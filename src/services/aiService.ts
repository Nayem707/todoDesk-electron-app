import type { AiMessage, AiReply, AiStatus } from "../types/ai";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.aiAPI) {
    throw new Error("AI API is unavailable. Restart the application.");
  }
  return window.aiAPI;
}

export const aiService = {
  status: () => unwrap(api().getStatus()),
  chat: (messages: AiMessage[]) => unwrap(api().chat(messages)),
};

export type { AiReply, AiStatus };
