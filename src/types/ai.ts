export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiStatus {
  available: boolean;
  modelReady: boolean;
  model: string;
  message: string;
}

export interface AiReply {
  role: "assistant";
  content: string;
  model: string;
}
