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

contextBridge.exposeInMainWorld("clipboardAPI", {
  getItems: () => invoke("clipboard:getAll"),
  copyAgain: (id) => invoke("clipboard:copyAgain", id),
  deleteItem: (id) => invoke("clipboard:delete", id),
  togglePin: (id) => invoke("clipboard:togglePin", id),
  onChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("clipboard:changed", listener);
    return () => ipcRenderer.removeListener("clipboard:changed", listener);
  },
});

contextBridge.exposeInMainWorld("markdownAPI", {
  getDocuments: () => invoke("markdown:getAll"),
  saveDocument: (input) => invoke("markdown:save", input),
  deleteDocument: (id) => invoke("markdown:delete", id),
});

contextBridge.exposeInMainWorld("aiAPI", {
  getStatus: () => invoke("ai:status"),
  getVisionStatus: () => invoke("ai:visionStatus"),
  getConversations: () => invoke("ai:getConversations"),
  createConversation: () => invoke("ai:createConversation"),
  getConversation: (id) => invoke("ai:getConversation", id),
  deleteConversation: (id) => invoke("ai:deleteConversation", id),
  getDraft: () => invoke("ai:getDraft"),
  saveDraft: (content) => invoke("ai:saveDraft", content),
  sendMessage: (conversationId, content) =>
    invoke("ai:sendMessage", conversationId, content),
  sendImageMessage: (conversationId, content, image) =>
    invoke("ai:sendImageMessage", conversationId, content, image),
  retry: (conversationId) => invoke("ai:retry", conversationId),
  onStream: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("ai:stream", listener);
    return () => ipcRenderer.removeListener("ai:stream", listener);
  },
});

contextBridge.exposeInMainWorld("formAssistantAPI", {
  analyze: (url, requestId) => invoke("formAssistant:analyze", url, requestId),
  cancel: (requestId) => invoke("formAssistant:cancel", requestId),
  getHistory: () => invoke("formAssistant:getHistory"),
  getAnalysis: (id) => invoke("formAssistant:get", id),
  deleteAnalysis: (id) => invoke("formAssistant:delete", id),
  updateMapping: (id, fieldKey, mappedField) =>
    invoke("formAssistant:updateMapping", id, fieldKey, mappedField),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("formAssistant:progress", listener);
    return () => ipcRenderer.removeListener("formAssistant:progress", listener);
  },
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
