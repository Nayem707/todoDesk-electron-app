import { ipcMain } from "electron";
import * as todoRepository from "../database/todoRepository.js";
import * as settingsRepository from "../database/settingsRepository.js";
import * as clipboardRepository from "../database/clipboardRepository.js";
import * as markdownRepository from "../database/markdownRepository.js";
import * as aiService from "../ai/aiService.js";
import * as formAssistantService from "../formAssistant/formAssistantService.js";
import * as webAuditService from "../webAudit/webAuditService.js";
import * as tracerouteService from "../traceroute/tracerouteService.js";
import * as quizService from "../quiz/quizService.js";
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

  const handleTrusted = createTrustedHandler(getMainWindow);
  registerFormAssistantHandlers(handleTrusted);
  registerWebAuditHandlers(handleTrusted);
  registerTracerouteHandlers(handleTrusted);
  registerQuizHandlers(handleTrusted);
}

/** Handlers that drive a real browser only accept requests from the app's own window. */
function createTrustedHandler(getMainWindow) {
  const fromMainWindow = (event) => event.sender === getMainWindow()?.webContents;

  return (channel, handler) => {
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
}

function isValidRequestId(requestId) {
  return typeof requestId === "string" && requestId.length > 0 && requestId.length <= 100;
}

function registerWebAuditHandlers(handleTrusted) {
  handleTrusted("webAudit:getHistory", () => webAuditService.listAudits());
  handleTrusted("webAudit:get", (_event, id) => webAuditService.getAudit(id));
  handleTrusted("webAudit:delete", (_event, id) => webAuditService.deleteAudit(id));
  handleTrusted("webAudit:cancel", (_event, requestId) =>
    webAuditService.cancelAudit(typeof requestId === "string" ? requestId : null)
  );
  handleTrusted("webAudit:start", (event, url, requestId) => {
    if (!isValidRequestId(requestId)) {
      throw new Error("Invalid request.");
    }
    return webAuditService.startAudit(url, {
      requestId,
      emit: (payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("webAudit:progress", payload);
        }
      },
    });
  });
}

function registerTracerouteHandlers(handleTrusted) {
  handleTrusted("traceroute:cancel", (_event, requestId) =>
    tracerouteService.cancelTrace(typeof requestId === "string" ? requestId : null)
  );
  handleTrusted("traceroute:start", async (event, target, requestId) => {
    if (!isValidRequestId(requestId)) {
      throw new Error("Invalid request.");
    }
    const cancelOnClose = () => tracerouteService.cancelTrace(requestId);
    event.sender.once("destroyed", cancelOnClose);
    try {
      return await tracerouteService.startTrace(target, {
        requestId,
        emit: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("traceroute:progress", payload);
          }
        },
      });
    } finally {
      if (!event.sender.isDestroyed()) {
        event.sender.removeListener("destroyed", cancelOnClose);
      }
    }
  });
}

function registerQuizHandlers(handleTrusted) {
  handleTrusted("quizAi:getConfig", () => quizService.getAiConfig());
  handleTrusted("quizAi:saveConfig", (_event, patch) => quizService.saveAiConfig(patch));
  handleTrusted("quizAi:getModels", (_event, baseUrl) => quizService.getModels(baseUrl));
  handleTrusted("quizAi:checkConnection", (_event, input) => quizService.checkConnection(input));
  handleTrusted("quizAi:analyzePerformance", (_event, attemptId, force) =>
    quizService.analyzePerformance(attemptId, { force: force === true })
  );

  handleTrusted("quiz:generate", async (event, config, requestId) => {
    if (!isValidRequestId(requestId)) {
      throw new Error("Invalid request.");
    }
    const cancelOnClose = () => quizService.cancelGeneration(requestId);
    event.sender.once("destroyed", cancelOnClose);
    try {
      return await quizService.generateQuiz(config, {
        requestId,
        emit: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("quiz:generateProgress", payload);
          }
        },
      });
    } finally {
      if (!event.sender.isDestroyed()) {
        event.sender.removeListener("destroyed", cancelOnClose);
      }
    }
  });
  handleTrusted("quiz:cancelGenerate", (_event, requestId) =>
    quizService.cancelGeneration(typeof requestId === "string" ? requestId : null)
  );
  handleTrusted("quiz:list", () => quizService.listQuizzes());
  handleTrusted("quiz:delete", (_event, quizId) => quizService.deleteQuiz(quizId));
  handleTrusted("quiz:start", (_event, quizId, options) => quizService.startQuiz(quizId, options));
  handleTrusted("quiz:getActive", () => quizService.getActiveAttempt());
  handleTrusted("quiz:getById", (_event, attemptId) => quizService.getAttempt(attemptId));
  handleTrusted("quiz:saveAnswer", (_event, attemptId, questionId, input) =>
    quizService.saveAnswer(attemptId, questionId, input)
  );
  handleTrusted("quiz:navigate", (_event, attemptId, toIndex) => quizService.navigate(attemptId, toIndex));
  handleTrusted("quiz:advance", (_event, attemptId, fromIndex, reason) =>
    quizService.advance(attemptId, fromIndex, reason === "timeout" ? "timeout" : "manual")
  );
  handleTrusted("quiz:submit", (_event, attemptId, reason) =>
    quizService.submitQuiz(attemptId, reason === "timeout" ? "timeout" : "manual")
  );
  handleTrusted("quiz:pause", (_event, attemptId) => quizService.pauseAttempt(attemptId));
  handleTrusted("quiz:resume", (_event, attemptId) => quizService.resumeAttempt(attemptId));
  handleTrusted("quiz:discard", (_event, attemptId) => quizService.discardAttempt(attemptId));
  handleTrusted("quiz:deleteAttempt", (_event, attemptId) => quizService.deleteAttempt(attemptId));
  handleTrusted("quiz:history", () => quizService.getHistory());
  handleTrusted("quiz:stats", () => quizService.getStats());
}

function registerFormAssistantHandlers(handleTrusted) {
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
