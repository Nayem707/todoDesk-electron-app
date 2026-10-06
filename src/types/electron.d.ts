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
import type {
  AutofillProgressEvent,
  AutofillResponse,
  FillPlanEntry,
  FormAnalysis,
  FormAnalysisProgressEvent,
  FormAnalysisSummary,
  FormAnalyzeResult,
  SemanticField,
} from "./formAssistant";
import type { MarkdownDocument } from "./markdown";
import type { AppSettings, DashboardStats, IpcResult, Todo, TodoInput } from "./todo";
import type {
  OllamaModel,
  PerformanceAnalysis,
  QuizActiveResponse,
  QuizAiConfig,
  QuizAiStatus,
  QuizAttempt,
  QuizConfigInput,
  QuizGenerateProgress,
  QuizGenerateResponse,
  QuizHistoryItem,
  QuizSaveAnswerResponse,
  QuizStartResponse,
  QuizStats,
  QuizSubmitReason,
  QuizSummary,
} from "./quiz";
import type { TraceProgressEvent, TraceResponse } from "./traceroute";
import type { WebAudit, WebAuditProgressEvent, WebAuditResult, WebAuditSummary } from "./webAudit";

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

export interface FormAssistantAPI {
  analyze: (url: string, requestId: string) => Promise<IpcResult<FormAnalyzeResult>>;
  cancel: (requestId: string) => Promise<IpcResult<{ cancelled: boolean }>>;
  getHistory: () => Promise<IpcResult<FormAnalysisSummary[]>>;
  getAnalysis: (id: string) => Promise<IpcResult<FormAnalysis>>;
  deleteAnalysis: (id: string) => Promise<IpcResult<{ id: string }>>;
  updateMapping: (
    id: string,
    fieldKey: string,
    mappedField: SemanticField | null
  ) => Promise<IpcResult<FormAnalysis>>;
  onProgress: (callback: (event: FormAnalysisProgressEvent) => void) => () => void;
  previewAutofill: (id: string) => Promise<IpcResult<FillPlanEntry[]>>;
  autofill: (id: string, requestId: string) => Promise<IpcResult<AutofillResponse>>;
  cancelAutofill: (requestId: string) => Promise<IpcResult<{ cancelled: boolean }>>;
  closeBrowser: () => Promise<IpcResult<{ closed: boolean }>>;
  onFillProgress: (callback: (event: AutofillProgressEvent) => void) => () => void;
}

export interface WebAuditAPI {
  start: (url: string, requestId: string) => Promise<IpcResult<WebAuditResult>>;
  cancel: (requestId: string) => Promise<IpcResult<{ cancelled: boolean }>>;
  getHistory: () => Promise<IpcResult<WebAuditSummary[]>>;
  getAudit: (id: string) => Promise<IpcResult<WebAudit>>;
  deleteAudit: (id: string) => Promise<IpcResult<{ id: string }>>;
  onProgress: (callback: (event: WebAuditProgressEvent) => void) => () => void;
}

export interface TracerouteAPI {
  start: (target: string, requestId: string) => Promise<IpcResult<TraceResponse>>;
  cancel: (requestId: string) => Promise<IpcResult<{ cancelled: boolean }>>;
  onProgress: (callback: (event: TraceProgressEvent) => void) => () => void;
}

export interface QuizAiAPI {
  getConfig: () => Promise<IpcResult<QuizAiConfig>>;
  saveConfig: (patch: Partial<QuizAiConfig>) => Promise<IpcResult<QuizAiConfig>>;
  getModels: (baseUrl?: string) => Promise<IpcResult<OllamaModel[]>>;
  checkConnection: (input?: Partial<QuizAiConfig>) => Promise<IpcResult<QuizAiStatus>>;
  analyzePerformance: (attemptId: string, force?: boolean) => Promise<IpcResult<PerformanceAnalysis>>;
}

export interface QuizAPI {
  generate: (config: QuizConfigInput, requestId: string) => Promise<IpcResult<QuizGenerateResponse>>;
  cancelGenerate: (requestId: string) => Promise<IpcResult<{ cancelled: boolean }>>;
  onGenerateProgress: (callback: (event: QuizGenerateProgress) => void) => () => void;
  list: () => Promise<IpcResult<QuizSummary[]>>;
  deleteQuiz: (quizId: string) => Promise<IpcResult<{ id: string }>>;
  start: (quizId: string, options?: { replaceActive?: boolean }) => Promise<IpcResult<QuizStartResponse>>;
  getActive: () => Promise<IpcResult<QuizActiveResponse>>;
  getById: (attemptId: string) => Promise<IpcResult<QuizAttempt>>;
  saveAnswer: (
    attemptId: string,
    questionId: string,
    input: { selected?: string[]; marked?: boolean }
  ) => Promise<IpcResult<QuizSaveAnswerResponse>>;
  navigate: (attemptId: string, toIndex: number) => Promise<IpcResult<QuizAttempt>>;
  advance: (attemptId: string, fromIndex: number, reason: QuizSubmitReason) => Promise<IpcResult<QuizAttempt>>;
  submit: (attemptId: string, reason: QuizSubmitReason) => Promise<IpcResult<QuizAttempt>>;
  pause: (attemptId: string) => Promise<IpcResult<{ paused: boolean }>>;
  resume: (attemptId: string) => Promise<IpcResult<QuizAttempt>>;
  discard: (attemptId: string) => Promise<IpcResult<{ id: string }>>;
  deleteAttempt: (attemptId: string) => Promise<IpcResult<{ id: string }>>;
  history: () => Promise<IpcResult<QuizHistoryItem[]>>;
  stats: () => Promise<IpcResult<QuizStats>>;
  ai: QuizAiAPI;
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
    formAssistantAPI: FormAssistantAPI;
    webAuditAPI: WebAuditAPI;
    tracerouteAPI: TracerouteAPI;
    quizAPI: QuizAPI;
    windowAPI: WindowAPI;
  }
}

export {};
