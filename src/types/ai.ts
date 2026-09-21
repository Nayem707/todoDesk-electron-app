export type AiRole = "user" | "assistant" | "system";

export interface AiMessage {
  id?: string;
  conversationId?: string;
  role: AiRole;
  content: string;
  createdAt?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiStatus {
  available: boolean;
  modelReady: boolean;
  model: string;
  message: string;
}

export interface AiSendResult {
  failed?: boolean;
  error?: string;
  conversationId?: string;
  conversation?: AiConversation;
  userMessage?: AiMessage;
  assistantMessage?: AiMessage;
  messages?: AiMessage[];
}

export interface AiConversationBundle {
  conversation: AiConversation;
  messages: AiMessage[];
}
