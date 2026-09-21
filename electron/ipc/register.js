import { ipcMain } from "electron";
import * as todoRepository from "../database/todoRepository.js";
import * as settingsRepository from "../database/settingsRepository.js";
import * as clipboardRepository from "../database/clipboardRepository.js";
import * as markdownRepository from "../database/markdownRepository.js";
import * as aiService from "../ai/aiService.js";
import { writeClipboardInternal } from "../clipboardWatcher.js";

function handle(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await handler(...args);
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error(`[IPC ${channel}]`, error);
      return { ok: false, error: message };
    }
  });
}

export function registerIpcHandlers(getMainWindow) {
  handle("todos:getAll", () => todoRepository.getAllTodos());
  handle("todos:getById", (id) => {
    const todo = todoRepository.getTodoById(id);
    if (!todo) {
      throw new Error("Todo not found.");
    }
    return todo;
  });
  handle("todos:create", (input) => todoRepository.createTodo(input));
  handle("todos:update", (id, input) => todoRepository.updateTodo(id, input));
  handle("todos:delete", (id) => todoRepository.deleteTodo(id));
  handle("todos:toggle", (id) => todoRepository.toggleTodo(id));
  handle("todos:clearCompleted", () => todoRepository.clearCompletedTodos());
  handle("todos:clearAll", () => todoRepository.clearAllTodos());
  handle("todos:getStats", () => todoRepository.getTodoStats());

  handle("settings:get", () => settingsRepository.getSettings());
  handle("settings:update", (patch) => settingsRepository.updateSettings(patch));

  handle("clipboard:getAll", () => clipboardRepository.getAllClipboardItems());
  handle("clipboard:copyAgain", (id) => {
    const existing = clipboardRepository.getClipboardItemById(id);
    if (!existing) {
      throw new Error("Clipboard item not found.");
    }
    writeClipboardInternal(existing.content);
    return clipboardRepository.copyClipboardItemAgain(id);
  });
  handle("clipboard:delete", (id) => clipboardRepository.deleteClipboardItem(id));
  handle("clipboard:togglePin", (id) => clipboardRepository.toggleClipboardPin(id));

  handle("markdown:getAll", () => markdownRepository.getAllMarkdownDocuments());
  handle("markdown:save", (input) => markdownRepository.saveMarkdownDocument(input));
  handle("markdown:delete", (id) => markdownRepository.deleteMarkdownDocument(id));

  handle("ai:status", () => aiService.getAiStatus());
  handle("ai:getConversations", () => aiService.listConversations());
  handle("ai:createConversation", () => aiService.createConversation());
  handle("ai:getConversation", (id) => aiService.getConversation(id));
  handle("ai:deleteConversation", (id) => aiService.deleteConversation(id));
  handle("ai:sendMessage", async (conversationId, content) => {
    try {
      return await aiService.sendMessage(conversationId, content);
    } catch (error) {
      if (error && error.code === "AI_GENERATION_FAILED") {
        return {
          failed: true,
          error: error.message,
          conversationId: error.conversationId,
          messages: error.messages ?? [],
        };
      }
      throw error;
    }
  });
  handle("ai:retry", async (conversationId) => {
    try {
      return await aiService.retryAssistant(conversationId);
    } catch (error) {
      if (error && error.code === "AI_GENERATION_FAILED") {
        return {
          failed: true,
          error: error.message,
          conversationId: error.conversationId,
          messages: error.messages ?? [],
        };
      }
      throw error;
    }
  });

  void getMainWindow;
}
