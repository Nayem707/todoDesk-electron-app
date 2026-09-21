import { useEffect, useRef, useState } from "react";
import { Eraser, Send, Sparkles } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { aiService } from "../services/aiService";
import type { AiMessage, AiStatus } from "../types/ai";
import { cn } from "../utils/cn";
import { getErrorMessage } from "../utils/errors";

export function AssistantPage() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) {
      if (!content) {
        setError("Enter a message before sending.");
      }
      return;
    }

    const nextMessages: AiMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setSending(true);
    setError("");

    try {
      const reply = await aiService.chat(nextMessages);
      setMessages((current) => [...current, { role: "assistant", content: reply.content }]);
    } catch (sendError) {
      setError(getErrorMessage(sendError, "The AI request failed. Try again."));
      void refreshStatus();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setError("");
    setDraft("");
  };

  const blocked = Boolean(status && (!status.available || !status.modelReady));
  const statusMessage = checking
    ? "Checking Ollama…"
    : blocked
      ? status?.message
      : `Ready · ${status?.model ?? "llama3.2"}`;

  return (
    <div className="mx-auto flex h-[calc(100vh-40px)] min-h-0 max-w-4xl flex-col p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assistant</h1>
          <p className="mt-1 whitespace-pre-line text-sm text-[rgb(var(--muted))]">
            {statusMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={clearConversation}
          disabled={messages.length === 0 && !draft}
          className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
        >
          <Eraser size={15} />
          Clear
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 whitespace-pre-line rounded-xl border border-[rgb(var(--danger))]/40 bg-[rgb(var(--danger))]/10 px-4 py-3 text-sm text-[rgb(var(--danger))]"
        >
          {error}
        </p>
      )}

      <div
        ref={listRef}
        className="todo-scroll min-h-0 flex-1 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
      >
        {messages.length === 0 && !sending ? (
          <EmptyState
            title="Ask the local assistant"
            description="Messages stay in this conversation until you clear them. Ollama runs llama3.2 on this computer."
            action={
              <span className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
                <Sparkles size={15} />
                Try “Summarize my day” or paste text to explain.
              </span>
            }
          />
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                  message.role === "user"
                    ? "ml-auto bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                    : "mr-auto border border-[rgb(var(--border))] bg-[rgb(var(--bg))]"
                )}
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
                  {message.role === "user" ? "You" : "Assistant"}
                </p>
                <p className="select-text whitespace-pre-wrap break-words">{message.content}</p>
              </article>
            ))}
            {sending && (
              <p className="text-sm text-[rgb(var(--muted))]">Generating a reply…</p>
            )}
          </div>
        )}
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
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
          rows={3}
          disabled={sending}
          placeholder="Message llama3.2"
          aria-label="Message"
          className="todo-scroll min-h-[76px] flex-1 resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm outline-none ring-[rgb(var(--accent))] placeholder:text-[rgb(var(--muted))] focus:ring-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] disabled:opacity-40"
        >
          <Send size={15} />
          Send
        </button>
      </form>
    </div>
  );
}
