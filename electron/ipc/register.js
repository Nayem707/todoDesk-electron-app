import { ipcMain } from "electron";
import * as todoRepository from "../database/todoRepository.js";
import * as settingsRepository from "../database/settingsRepository.js";
import * as clipboardRepository from "../database/clipboardRepository.js";
import * as markdownRepository from "../database/markdownRepository.js";
import * as aiService from "../ai/aiService.js";
import * as formAssistantService from "../formAssistant/formAssistantService.js";
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
  handle("ai:getDraft", () => aiService.getChatDraft());
  handle("ai:saveDraft", (content) => aiService.saveChatDraft(content));
  handle("ai:visionStatus", () => aiService.getVisionStatus());

  ipcMain.handle("ai:sendMessage", async (event, conversationId, content) => {
    try {
      const data = await aiService.sendMessage(conversationId, content, {
        emit: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:stream", payload);
          }
        },
      });
      return { ok: true, data };
    } catch (error) {
      if (error && error.code === "AI_GENERATION_FAILED") {
        return {
          ok: true,
          data: {
            failed: true,
            error: error.message,
            conversationId: error.conversationId,
            messages: error.messages ?? [],
          },
        };
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[IPC ai:sendMessage]", error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("ai:sendImageMessage", async (event, conversationId, content, image) => {
    try {
      const data = await aiService.sendImageMessage(conversationId, content, image, {
        emit: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:stream", payload);
          }
        },
      });
      return { ok: true, data };
    } catch (error) {
      if (error && error.code === "AI_GENERATION_FAILED") {
        return {
          ok: true,
          data: {
            failed: true,
            error: error.message,
            conversationId: error.conversationId,
            messages: error.messages ?? [],
          },
        };
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[IPC ai:sendImageMessage]", error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("ai:retry", async (event, conversationId) => {
    try {
      const data = await aiService.retryAssistant(conversationId, {
        emit: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:stream", payload);
          }
        },
      });
      return { ok: true, data };
    } catch (error) {
      if (error && error.code === "AI_GENERATION_FAILED") {
        return {
          ok: true,
          data: {
            failed: true,
            error: error.message,
            conversationId: error.conversationId,
            messages: error.messages ?? [],
          },
        };
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[IPC ai:retry]", error);
      return { ok: false, error: message };
    }
  });

  registerFormAssistantHandlers(getMainWindow);
}

function registerFormAssistantHandlers(getMainWindow) {
  const fromMainWindow = (event) => event.sender === getMainWindow()?.webContents;

  const handleTrusted = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromMainWindow(event)) {
        return { ok: false, error: "Request rejected." };
      }
      try {
        return { ok: true, data: await handler(event, ...args) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        console.error(`[IPC ${channel}]`, error);
        return { ok: false, error: message };
      }
    });
  };

  handleTrusted("formAssistant:getHistory", () => formAssistantService.listAnalyses());
  handleTrusted("formAssistant:get", (_event, id) => formAssistantService.getAnalysis(id));
  handleTrusted("formAssistant:delete", (_event, id) => formAssistantService.deleteAnalysis(id));
  handleTrusted("formAssistant:updateMapping", (_event, id, fieldKey, mappedField) =>
    formAssistantService.updateFieldMapping(id, fieldKey, mappedField ?? null)
  );
  handleTrusted("formAssistant:cancel", (_event, requestId) =>
    formAssistantService.cancelAnalysis(typeof requestId === "string" ? requestId : null)
  );
  handleTrusted("formAssistant:previewAutofill", (_event, id) => formAssistantService.previewAutofill(id));
  handleTrusted("formAssistant:cancelAutofill", (_event, requestId) =>
    formAssistantService.cancelAutofill(typeof requestId === "string" ? requestId : null)
  );
  handleTrusted("formAssistant:closeBrowser", () => formAssistantService.closeAutofillBrowser());
  handleTrusted("formAssistant:autofill", (event, id, requestId) => {
    if (typeof requestId !== "string" || !requestId || requestId.length > 100) {
      throw new Error("Invalid request.");
    }
    return formAssistantService.autofill(id, {
      requestId,
      emit: (payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("formAssistant:fillProgress", payload);
        }
      },
    });
  });
  handleTrusted("formAssistant:analyze", (event, url, requestId) => {
    if (typeof requestId !== "string" || !requestId || requestId.length > 100) {
      throw new Error("Invalid request.");
    }
    return formAssistantService.analyze(url, {
      requestId,
      emit: (payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("formAssistant:progress", payload);
        }
      },
    });
  });
}
