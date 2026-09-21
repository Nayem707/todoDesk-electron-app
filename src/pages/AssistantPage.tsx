import { useEffect, useRef, useState } from "react";
import {
  MessageSquarePlus,
  PanelLeft,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { aiService } from "../services/aiService";
import type { AiConversation, AiMessage, AiSendResult, AiStatus } from "../types/ai";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

export function AssistantPage() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [generationFailed, setGenerationFailed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;

  const refreshStatus = async () => {
    setChecking(true);
    try {
      const next = await aiService.status();
      setStatus(next);
      if (next.available && next.modelReady) {
        setError("");
      }
    } catch (loadError) {
      setStatus({
        available: false,
        modelReady: false,
        model: "llama3.2",
        message: getErrorMessage(loadError, "Could not reach Ollama."),
      });
    } finally {
      setChecking(false);
    }
  };

  const refreshConversations = async () => {
    try {
      const next = await aiService.getConversations();
      setConversations(next);
      return next;
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load conversations."));
      return [] as AiConversation[];
    } finally {
      setLoadingList(false);
    }
  };

  const applySendResult = (result: AiSendResult) => {
    if (result.conversation?.id) {
      setActiveId(result.conversation.id);
    } else if (result.conversationId) {
      setActiveId(result.conversationId);
    }
    if (result.messages) {
      setMessages(result.messages);
    }
    if (result.failed) {
      setGenerationFailed(true);
      setError(result.error || "The AI request failed. Try again.");
      void refreshStatus();
      return;
    }
    setGenerationFailed(false);
    setError("");
  };

  const openConversation = async (id: string) => {
    setLoadingChat(true);
    setError("");
    setGenerationFailed(false);
    try {
      const bundle = await aiService.getConversation(id);
      setActiveId(bundle.conversation.id);
      setMessages(bundle.messages);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not open conversation."));
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await refreshStatus();
      const list = await refreshConversations();
      if (list[0]) {
        await openConversation(list[0].id);
      }
    })();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, sending]);

  const startNewChat = async () => {
    setError("");
    setGenerationFailed(false);
    try {
      const conversation = await aiService.createConversation();
      setActiveId(conversation.id);
      setMessages([]);
      setDraft("");
      await refreshConversations();
      inputRef.current?.focus();
    } catch (createError) {
      setError(getErrorMessage(createError, "Could not create a conversation."));
    }
  };

  const deleteActive = async (id: string) => {
    try {
      await aiService.deleteConversation(id);
      const remaining = await refreshConversations();
      if (activeId === id) {
        if (remaining[0]) {
          await openConversation(remaining[0].id);
        } else {
          setActiveId(null);
          setMessages([]);
          setGenerationFailed(false);
          setError("");
        }
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Could not delete conversation."));
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) {
      if (!content) {
        setError("Enter a message before sending.");
      }
      return;
    }

    setDraft("");
    setSending(true);
    setError("");
    setGenerationFailed(false);
    setMessages((current) => [...current, { role: "user", content }]);

    try {
      const result = await aiService.sendMessage(activeId, content);
      applySendResult(result);
      await refreshConversations();
    } catch (sendError) {
      setGenerationFailed(true);
      setError(getErrorMessage(sendError, "The AI request failed. Try again."));
      void refreshStatus();
      if (activeId) {
        try {
          const bundle = await aiService.getConversation(activeId);
          setMessages(bundle.messages);
        } catch {
          /* keep optimistic user bubble */
        }
      }
      await refreshConversations();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const retry = async () => {
    if (!activeId || sending) {
      return;
    }
    setSending(true);
    setError("");
    setGenerationFailed(false);
    try {
      const result = await aiService.retry(activeId);
      applySendResult(result);
      await refreshConversations();
    } catch (retryError) {
      setGenerationFailed(true);
      setError(getErrorMessage(retryError, "The AI request failed. Try again."));
      void refreshStatus();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const blocked = Boolean(status && (!status.available || !status.modelReady));
  const statusMessage = checking
    ? "Checking Ollama…"
    : blocked
      ? status?.message
      : `Ready · ${status?.model ?? "llama3.2"}`;
  const canRetry =
    generationFailed &&
    Boolean(activeId) &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "user";
  const headerTitle = activeConversation?.title ?? "Assistant";

  return (
    <div className="flex h-[calc(100vh-40px)] min-h-0 overflow-hidden bg-[rgb(var(--bg))]">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-[width,opacity] duration-200",
          sidebarOpen ? "w-64 opacity-100" : "w-0 overflow-hidden border-r-0 opacity-0"
        )}
        aria-hidden={!sidebarOpen}
      >
        <div className="shrink-0 border-b border-[rgb(var(--border))] p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
            Conversations
          </p>
          <button
            type="button"
            onClick={() => void startNewChat()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
          >
            <MessageSquarePlus size={15} />
            New Chat
          </button>
        </div>
        <div className="todo-scroll min-h-0 flex-1 space-y-0.5 p-2">
          {loadingList ? (
            <p className="px-2 py-3 text-sm text-[rgb(var(--muted))]">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[rgb(var(--muted))]">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex items-start gap-1 rounded-xl px-2 py-2",
                  activeId === conversation.id
                    ? "bg-[rgb(var(--accent))]/15"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => void openConversation(conversation.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">
                    {formatDateTime(conversation.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  title="Delete conversation"
                  aria-label={`Delete ${conversation.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteActive(conversation.id);
                  }}
                  className="rounded-md p-1.5 text-[rgb(var(--muted))] opacity-0 hover:bg-black/5 hover:text-[rgb(var(--danger))] group-hover:opacity-100 focus:opacity-100 dark:hover:bg-white/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
            title={sidebarOpen ? "Hide conversations" : "Show conversations"}
          >
            <PanelLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{headerTitle}</h1>
            <p className="truncate whitespace-pre-line text-xs text-[rgb(var(--muted))]">
              {statusMessage}
            </p>
          </div>
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => void startNewChat()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <MessageSquarePlus size={15} />
              New Chat
            </button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--danger))]/30 bg-[rgb(var(--danger))]/10 px-4 py-3 text-sm text-[rgb(var(--danger))]"
          >
            <p className="whitespace-pre-line">{error}</p>
            {canRetry && (
              <button
                type="button"
                onClick={() => void retry()}
                disabled={sending}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[rgb(var(--danger))]/40 px-3 py-1.5 text-sm hover:bg-[rgb(var(--danger))]/10 disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={listRef} className="todo-scroll min-h-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {loadingChat ? (
            <p className="text-sm text-[rgb(var(--muted))]">Loading conversation…</p>
          ) : messages.length === 0 && !sending ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                title="Ask the local assistant"
                description="Conversations are saved locally and survive restarts. Ollama runs llama3.2 on this computer."
                action={
                  <span className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
                    <Sparkles size={15} />
                    Try “Summarize my day” or paste text to explain.
                  </span>
                }
              />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {messages.map((message) => (
                <MessageBubble key={messageKey(message)} message={message} />
              ))}
              {sending && <TypingIndicator />}
            </div>
          )}
        </div>

        <form
          className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              disabled={sending}
              placeholder="Message llama3.2"
              aria-label="Message"
              className="todo-scroll max-h-40 min-h-[52px] flex-1 resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2.5 text-sm outline-none ring-[rgb(var(--accent))] placeholder:text-[rgb(var(--muted))] focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-[rgb(var(--accent))] px-4 text-sm font-medium text-[rgb(var(--accent-foreground))] disabled:opacity-40"
            >
              <Send size={15} />
              Send
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function messageKey(message: AiMessage) {
  return message.id ?? `${message.role}-${message.createdAt}-${message.content.slice(0, 24)}`;
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  return (
    <article
      className={cn(
        "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
        isUser
          ? "ml-auto bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
          : "mr-auto border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      )}
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
        {isUser ? "You" : "Assistant"}
      </p>
      <p className="select-text whitespace-pre-wrap break-words">{message.content}</p>
    </article>
  );
}

function TypingIndicator() {
  return (
    <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
        Assistant
      </p>
      <span className="flex items-center gap-1" aria-label="Generating a reply">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--muted))]" />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--muted))]"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--muted))]"
          style={{ animationDelay: "300ms" }}
        />
      </span>
    </div>
  );
}
