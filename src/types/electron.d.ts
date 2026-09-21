import type {
  AiConversation,
  AiConversationBundle,
  AiImagePayload,
  AiMessage,
  AiSendResult,
  AiStatus,
  AiStreamEvent,
} from "./ai";
import type { ClipboardItem } from "./clipboard";
import type { MarkdownDocument } from "./markdown";
import type { AppSettings, DashboardStats, IpcResult, Todo, TodoInput } from "./todo";

export interface TodoAPI {
  getTodos: () => Promise<IpcResult<Todo[]>>;
  getTodo: (id: string) => Promise<IpcResult<Todo>>;
  createTodo: (todo: TodoInput) => Promise<IpcResult<Todo>>;
  updateTodo: (id: string, todo: Partial<TodoInput>) => Promise<IpcResult<Todo>>;
  deleteTodo: (id: string) => Promise<IpcResult<{ id: string }>>;
  toggleTodo: (id: string) => Promise<IpcResult<Todo>>;
  clearCompleted: () => Promise<IpcResult<{ cleared: boolean }>>;
  clearAll: () => Promise<IpcResult<{ cleared: boolean }>>;
  getStats: () => Promise<IpcResult<DashboardStats>>;
}

export interface SettingsAPI {
  getSettings: () => Promise<IpcResult<AppSettings>>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>;
}

export interface ClipboardAPI {
  getItems: () => Promise<IpcResult<ClipboardItem[]>>;
  copyAgain: (id: string) => Promise<IpcResult<ClipboardItem>>;
  deleteItem: (id: string) => Promise<IpcResult<{ id: string }>>;
  togglePin: (id: string) => Promise<IpcResult<ClipboardItem>>;
  onChanged: (callback: () => void) => () => void;
}

export interface MarkdownAPI {
  getDocuments: () => Promise<IpcResult<MarkdownDocument[]>>;
  saveDocument: (input: {
    id?: string | null;
    content: string;
  }) => Promise<IpcResult<MarkdownDocument>>;
  deleteDocument: (id: string) => Promise<IpcResult<{ id: string }>>;
}

export interface AiAPI {
  getStatus: () => Promise<IpcResult<AiStatus>>;
  getVisionStatus: () => Promise<IpcResult<AiStatus>>;
  getConversations: () => Promise<IpcResult<AiConversation[]>>;
  createConversation: () => Promise<IpcResult<AiConversation>>;
  getConversation: (id: string) => Promise<IpcResult<AiConversationBundle>>;
  deleteConversation: (id: string) => Promise<IpcResult<{ id: string }>>;
  getDraft: () => Promise<IpcResult<string>>;
  saveDraft: (content: string) => Promise<IpcResult<string>>;
  sendMessage: (
    conversationId: string | null,
    content: string
  ) => Promise<IpcResult<AiSendResult>>;
  sendImageMessage: (
    conversationId: string | null,
    content: string,
    image: AiImagePayload
  ) => Promise<IpcResult<AiSendResult>>;
  retry: (conversationId: string) => Promise<IpcResult<AiSendResult>>;
  onStream: (callback: (event: AiStreamEvent) => void) => () => void;
}

export interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (value: boolean) => void) => () => void;
}

declare global {
  interface Window {
    todoAPI: TodoAPI;
    settingsAPI: SettingsAPI;
    clipboardAPI: ClipboardAPI;
    markdownAPI: MarkdownAPI;
    aiAPI: AiAPI;
    windowAPI: WindowAPI;
  }
}

export {};
