import crypto from "crypto";
import { streamChatWithAi, getAiStatus } from "./ollamaClient.js";
import * as aiRepository from "../database/aiRepository.js";

export { getAiStatus };

export function listConversations() {
  return aiRepository.getAllConversations();
}

export function createConversation() {
  return aiRepository.createConversation("New chat");
}

export function getConversation(conversationId) {
  return aiRepository.getConversationBundle(conversationId);
}

export function deleteConversation(conversationId) {
  return aiRepository.deleteConversation(conversationId);
}

export function getChatDraft() {
  return aiRepository.getChatDraft();
}

export function saveChatDraft(content) {
  return aiRepository.saveChatDraft(content);
}

function emitSafe(emit, payload) {
  if (typeof emit !== "function") {
    return;
  }
  try {
    emit(payload);
  } catch (error) {
    console.error("[ai] stream emit failed", error);
  }
}

function generationFailed(error, conversationId) {
  const failed = new Error(
    error instanceof Error ? error.message : "The AI request failed. Try again."
  );
  failed.code = "AI_GENERATION_FAILED";
  failed.conversationId = conversationId;
  failed.messages = aiRepository.getMessagesByConversation(conversationId);
  return failed;
}

function buildHistory(conversationId) {
  return aiRepository
    .getMessagesByConversation(conversationId)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

/**
 * Persist the user message, stream Ollama tokens to the renderer, then persist the reply.
 * If Ollama fails, the user message remains in the database.
 */
export async function sendMessage(conversationId, content, { emit } = {}) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Enter a message before sending.");
  }

  let conversation =
    conversationId && typeof conversationId === "string" && conversationId.trim()
      ? aiRepository.getConversationById(conversationId)
      : null;

  if (conversationId && !conversation) {
    throw new Error("Conversation not found.");
  }

  if (!conversation) {
    conversation = aiRepository.createConversation("New chat");
  }

  const requestId = crypto.randomUUID();
  const userMessage = aiRepository.createMessage(conversation.id, "user", text);
  conversation = aiRepository.getConversationById(conversation.id);

  emitSafe(emit, {
    requestId,
    phase: "ready",
    conversationId: conversation.id,
    conversation,
    userMessage,
    messages: aiRepository.getMessagesByConversation(conversation.id),
  });

  const history = buildHistory(conversation.id);
  console.log(
    `[ai:perf] History loaded for stream: ${history.length} messages, conversation=${conversation.id}`
  );

  let ipcEmits = 0;
  let firstIpcEmitAt = null;
  const streamStartedAt = performance.now();

  try {
    const reply = await streamChatWithAi(history, {
      onChunk: (delta, fullText) => {
        ipcEmits += 1;
        if (firstIpcEmitAt === null) {
          firstIpcEmitAt = performance.now();
        }
        emitSafe(emit, {
          requestId,
          phase: "chunk",
          conversationId: conversation.id,
          delta,
          content: fullText,
        });
      },
    });

    const persistStartedAt = performance.now();
    const assistantMessage = aiRepository.createMessage(
      conversation.id,
      "assistant",
      reply.content
    );
    console.log(
      `[ai:perf] Persist assistant message: ${(performance.now() - persistStartedAt).toFixed(0)} ms`
    );
    console.log(
      `[ai:perf] IPC chunk emits: ${ipcEmits}, firstEmitDeltaMs=${
        firstIpcEmitAt === null
          ? "n/a"
          : (firstIpcEmitAt - streamStartedAt).toFixed(0)
      }`
    );

    const result = {
      requestId,
      conversation: aiRepository.getConversationById(conversation.id),
      userMessage,
      assistantMessage,
      messages: aiRepository.getMessagesByConversation(conversation.id),
    };

    emitSafe(emit, {
      requestId,
      phase: "done",
      conversationId: conversation.id,
      conversation: result.conversation,
      assistantMessage,
      messages: result.messages,
    });

    return result;
  } catch (error) {
    emitSafe(emit, {
      requestId,
      phase: "error",
      conversationId: conversation.id,
      error: error instanceof Error ? error.message : "The AI request failed. Try again.",
      messages: aiRepository.getMessagesByConversation(conversation.id),
    });
    throw generationFailed(error, conversation.id);
  }
}

/**
 * Retry assistant generation when the last stored message is from the user.
 */
export async function retryAssistant(conversationId, { emit } = {}) {
  const conversation = aiRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const messages = aiRepository.getMessagesByConversation(conversationId);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("There is nothing to retry. Send a new message first.");
  }

  const requestId = crypto.randomUUID();
  emitSafe(emit, {
    requestId,
    phase: "ready",
    conversationId,
    conversation,
    messages,
  });

  const history = buildHistory(conversationId);

  try {
    const reply = await streamChatWithAi(history, {
      onChunk: (delta, fullText) => {
        emitSafe(emit, {
          requestId,
          phase: "chunk",
          conversationId,
          delta,
          content: fullText,
        });
      },
    });

    const assistantMessage = aiRepository.createMessage(
      conversationId,
      "assistant",
      reply.content
    );

    const result = {
      requestId,
      conversation: aiRepository.getConversationById(conversationId),
      assistantMessage,
      messages: aiRepository.getMessagesByConversation(conversationId),
    };

    emitSafe(emit, {
      requestId,
      phase: "done",
      conversationId,
      conversation: result.conversation,
      assistantMessage,
      messages: result.messages,
    });

    return result;
  } catch (error) {
    emitSafe(emit, {
      requestId,
      phase: "error",
      conversationId,
      error: error instanceof Error ? error.message : "The AI request failed. Try again.",
      messages: aiRepository.getMessagesByConversation(conversationId),
    });
    throw generationFailed(error, conversationId);
  }
}
