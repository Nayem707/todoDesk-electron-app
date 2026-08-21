const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("todoAPI", {
  getTodos: () => invoke("todos:getAll"),
  getTodo: (id) => invoke("todos:getById", id),
  createTodo: (todo) => invoke("todos:create", todo),
  updateTodo: (id, todo) => invoke("todos:update", id, todo),
  deleteTodo: (id) => invoke("todos:delete", id),
  toggleTodo: (id) => invoke("todos:toggle", id),
  clearCompleted: () => invoke("todos:clearCompleted"),
  clearAll: () => invoke("todos:clearAll"),
  getStats: () => invoke("todos:getStats"),
});

contextBridge.exposeInMainWorld("settingsAPI", {
  getSettings: () => invoke("settings:get"),
  updateSettings: (patch) => invoke("settings:update", patch),
});

contextBridge.exposeInMainWorld("windowAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => invoke("window:isMaximized"),
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
});
