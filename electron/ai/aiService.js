import crypto from "crypto";
import { streamChatWithAi, getAiStatus, analyzeImageWithVision, getVisionStatus } from "./ollamaClient.js";
import * as aiRepository from "../database/aiRepository.js";
import {
  deleteAiImage,
  readAiImageBase64,
  saveAiImage,
} from "./aiImageStore.js";

export { getAiStatus, getVisionStatus };

const DEFAULT_IMAGE_PROMPT = [
  "Extract all meaningful information from this image.",
  "",
  "Follow these rules:",
  "1. Extract all visible text exactly as accurately as possible.",
  "2. Preserve the original reading order and structure.",
  "3. Detect and extract headings, paragraphs, labels, captions, numbers, dates, URLs, emails, phone numbers, and other text.",
  "4. If the image contains a table, reproduce it as a Markdown table while preserving rows, columns, headers, and values.",
  "5. If the image contains a form, preserve the field names and their corresponding values.",
  "6. If the image contains a receipt or invoice, identify and structure the relevant information clearly.",
  "7. If the image contains a chart or graph, describe the available data and labels accurately.",
  "8. If the image contains a screenshot of a UI, identify visible text, buttons, menus, inputs, cards, and important UI elements.",
  "9. If there are multiple sections or regions, keep them separated logically.",
  "10. Do not invent, infer, or hallucinate information that is not clearly visible.",
  "11. If a piece of text is unreadable, write [unclear] instead of guessing.",
  "12. Preserve numbers, symbols, punctuation, capitalization, and special characters as accurately as possible.",
  "13. Do not summarize unless explicitly requested.",
  "14. Return clean Markdown.",
  "15. Use code blocks when the image contains source code.",
  "16. Use Markdown tables when the image contains tabular data.",
  "17. Keep the extracted content faithful to the original image.",
  "",
  "Return only the extracted and structured content. Do not explain your process.",
].join("\n");

export function listConversations() {
  return aiRepository.getAllConversations();
}

export function createConversation() {
  return aiRepository.createConversation("New chat");
}

function attachImageData(message) {
  if (!message?.imagePath) {
    return message;
  }
  try {
    const image = readAiImageBase64(message.imagePath, message.imageMime);
    return {
      ...message,
      imageUrl: image.dataUrl,
    };
  } catch (error) {
    console.error("[ai] failed to load message image", error);
    return {
      ...message,
      imageUrl: null,
      imageMissing: true,
    };
  }
}

export function getConversation(conversationId) {
  const bundle = aiRepository.getConversationBundle(conversationId);
  return {
    conversation: bundle.conversation,
    messages: bundle.messages.map(attachImageData),
  };
}

export function deleteConversation(conversationId) {
  const result = aiRepository.deleteConversation(conversationId);
  for (const imagePath of result.imagePaths || []) {
    deleteAiImage(imagePath);
  }
  return { id: result.id };
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
  failed.messages = aiRepository
    .getMessagesByConversation(conversationId)
    .map(attachImageData);
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

function ensureConversation(conversationId) {
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
  return conversation;
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

  const conversation = ensureConversation(conversationId);
  const requestId = crypto.randomUUID();
  const userMessage = aiRepository.createMessage(conversation.id, "user", text);

  emitSafe(emit, {
    requestId,
    phase: "ready",
    conversationId: conversation.id,
    conversation: aiRepository.getConversationById(conversation.id),
    userMessage: attachImageData(userMessage),
    messages: aiRepository
      .getMessagesByConversation(conversation.id)
      .map(attachImageData),
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
      userMessage: attachImageData(userMessage),
      assistantMessage,
      messages: aiRepository
        .getMessagesByConversation(conversation.id)
        .map(attachImageData),
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
      messages: aiRepository
        .getMessagesByConversation(conversation.id)
        .map(attachImageData),
    });
    throw generationFailed(error, conversation.id);
  }
}

/**
 * Save an image locally, persist the user message, analyze with Qwen2.5-VL, persist the reply.
 * image: { mimeType: string, data: string } where data is raw base64 (no data: prefix)
 */
export async function sendImageMessage(
  conversationId,
  content,
  image,
  { emit } = {}
) {
  if (!image || typeof image.data !== "string" || !image.data.trim()) {
    throw new Error("Select an image before sending.");
  }

  let buffer;
  try {
    buffer = Buffer.from(image.data, "base64");
  } catch {
    throw new Error("Image conversion failed.");
  }
  if (!buffer.length) {
    throw new Error("Invalid image.");
  }

  const promptText =
    typeof content === "string" && content.trim()
      ? content.trim()
      : DEFAULT_IMAGE_PROMPT;

  const conversation = ensureConversation(conversationId);
  const requestId = crypto.randomUUID();

  let saved;
  try {
    saved = saveAiImage(buffer, image.mimeType || "image/png");
  } catch (error) {
    throw error instanceof Error ? error : new Error("Image conversion failed.");
  }

  const userMessage = aiRepository.createMessage(
    conversation.id,
    "user",
    promptText,
    {
      imagePath: saved.relativePath,
      imageMime: saved.mimeType,
    }
  );

  emitSafe(emit, {
    requestId,
    phase: "ready",
    conversationId: conversation.id,
    conversation: aiRepository.getConversationById(conversation.id),
    userMessage: attachImageData(userMessage),
    messages: aiRepository
      .getMessagesByConversation(conversation.id)
      .map(attachImageData),
    analyzing: true,
  });

  try {
    const imagePayload = readAiImageBase64(saved.relativePath, saved.mimeType);
    const reply = await analyzeImageWithVision({
      prompt: promptText,
      base64Image: imagePayload.base64,
    });

    const assistantMessage = aiRepository.createMessage(
      conversation.id,
      "assistant",
      reply.content,
      { maxContentLength: 100_000 }
    );

    const result = {
      requestId,
      conversation: aiRepository.getConversationById(conversation.id),
      userMessage: attachImageData(userMessage),
      assistantMessage,
      messages: aiRepository
        .getMessagesByConversation(conversation.id)
        .map(attachImageData),
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
    const friendly =
      error instanceof Error
        ? error.message
        : "Unable to analyze the image.\nMake sure Ollama is running and qwen2.5vl is installed.";
    emitSafe(emit, {
      requestId,
      phase: "error",
      conversationId: conversation.id,
      error: friendly,
      messages: aiRepository
        .getMessagesByConversation(conversation.id)
        .map(attachImageData),
    });
    throw generationFailed(
      error instanceof Error ? error : new Error(friendly),
      conversation.id
    );
  }
}

/**
 * Retry assistant generation when the last stored message is from the user.
 * Image messages retry via vision; text messages retry via chat stream.
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
    messages: messages.map(attachImageData),
    analyzing: Boolean(last.imagePath),
  });

  try {
    let reply;
    if (last.imagePath) {
      const imagePayload = readAiImageBase64(last.imagePath, last.imageMime);
      reply = await analyzeImageWithVision({
        prompt: last.content,
        base64Image: imagePayload.base64,
      });
    } else {
      const history = buildHistory(conversationId);
      reply = await streamChatWithAi(history, {
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
    }

    const assistantMessage = aiRepository.createMessage(
      conversationId,
      "assistant",
      reply.content,
      { maxContentLength: last.imagePath ? 100_000 : 12_000 }
    );

    const result = {
      requestId,
      conversation: aiRepository.getConversationById(conversationId),
      assistantMessage,
      messages: aiRepository
        .getMessagesByConversation(conversationId)
        .map(attachImageData),
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
      messages: aiRepository
        .getMessagesByConversation(conversationId)
        .map(attachImageData),
    });
    throw generationFailed(error, conversationId);
  }
}
