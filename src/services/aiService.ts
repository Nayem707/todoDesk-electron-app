import type {
  AiConversation,
  AiConversationBundle,
  AiImagePayload,
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
  visionStatus: () => unwrap(api().getVisionStatus()),
  getConversations: () => unwrap(api().getConversations()),
  createConversation: () => unwrap(api().createConversation()),
  getConversation: (id: string) => unwrap(api().getConversation(id)),
  deleteConversation: (id: string) => unwrap(api().deleteConversation(id)),
  getDraft: () => unwrap(api().getDraft()),
  saveDraft: (content: string) => unwrap(api().saveDraft(content)),
  sendMessage: (conversationId: string | null, content: string) =>
    unwrap(api().sendMessage(conversationId, content)),
  sendImageMessage: (
    conversationId: string | null,
    content: string,
    image: AiImagePayload
  ) => unwrap(api().sendImageMessage(conversationId, content, image)),
  retry: (conversationId: string) => unwrap(api().retry(conversationId)),
  onStream: (callback: (event: AiStreamEvent) => void) => api().onStream(callback),
};

export type {
  AiConversation,
  AiConversationBundle,
  AiImagePayload,
  AiSendResult,
  AiStatus,
  AiStreamEvent,
};
