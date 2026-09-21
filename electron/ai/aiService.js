import { chatWithAi, getAiStatus } from "./ollamaClient.js";
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

/**
 * Persist the user message, call Ollama with stored history, then persist the reply.
 * If Ollama fails, the user message remains in the database.
 */
export async function sendMessage(conversationId, content) {
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

  const userMessage = aiRepository.createMessage(conversation.id, "user", text);
  conversation = aiRepository.getConversationById(conversation.id);

  const history = aiRepository
    .getMessagesByConversation(conversation.id)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  try {
    const reply = await chatWithAi(history);
    const assistantMessage = aiRepository.createMessage(
      conversation.id,
      "assistant",
      reply.content
    );
    return {
      conversation: aiRepository.getConversationById(conversation.id),
      userMessage,
      assistantMessage,
      messages: aiRepository.getMessagesByConversation(conversation.id),
    };
  } catch (error) {
    const failed = new Error(
      error instanceof Error ? error.message : "The AI request failed. Try again."
    );
    failed.code = "AI_GENERATION_FAILED";
    failed.conversationId = conversation.id;
    failed.messages = aiRepository.getMessagesByConversation(conversation.id);
    throw failed;
  }
}

/**
 * Retry assistant generation when the last stored message is from the user.
 */
export async function retryAssistant(conversationId) {
  const conversation = aiRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const messages = aiRepository.getMessagesByConversation(conversationId);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("There is nothing to retry. Send a new message first.");
  }

  const history = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  try {
    const reply = await chatWithAi(history);
    const assistantMessage = aiRepository.createMessage(
      conversationId,
      "assistant",
      reply.content
    );
    return {
      conversation: aiRepository.getConversationById(conversationId),
      assistantMessage,
      messages: aiRepository.getMessagesByConversation(conversationId),
    };
  } catch (error) {
    const failed = new Error(
      error instanceof Error ? error.message : "The AI request failed. Try again."
    );
    failed.code = "AI_GENERATION_FAILED";
    failed.conversationId = conversationId;
    failed.messages = aiRepository.getMessagesByConversation(conversationId);
    throw failed;
  }
}
