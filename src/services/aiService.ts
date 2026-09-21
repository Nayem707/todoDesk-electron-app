import type {
  AiConversation,
  AiConversationBundle,
  AiSendResult,
  AiStatus,
  AiStreamEvent,
} from "../types/ai";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.aiAPI) {
    throw new Error("AI API is unavailable. Restart the application.");
  }
  return window.aiAPI;
}

export const aiService = {
  status: () => unwrap(api().getStatus()),
  getConversations: () => unwrap(api().getConversations()),
  createConversation: () => unwrap(api().createConversation()),
  getConversation: (id: string) => unwrap(api().getConversation(id)),
  deleteConversation: (id: string) => unwrap(api().deleteConversation(id)),
  sendMessage: (conversationId: string | null, content: string) =>
    unwrap(api().sendMessage(conversationId, content)),
  retry: (conversationId: string) => unwrap(api().retry(conversationId)),
  onStream: (callback: (event: AiStreamEvent) => void) => api().onStream(callback),
};

export type {
  AiConversation,
  AiConversationBundle,
  AiSendResult,
  AiStatus,
  AiStreamEvent,
};
