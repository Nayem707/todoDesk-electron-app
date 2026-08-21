import { ipcMain } from "electron";
import * as todoRepository from "../database/todoRepository.js";
import * as settingsRepository from "../database/settingsRepository.js";

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

  void getMainWindow;
}
