import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  MessageSquarePlus,
  PanelLeft,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ChatMarkdown } from "../components/ChatMarkdown";
import { aiService } from "../services/aiService";
import type {
  AiConversation,
  AiImagePayload,
  AiMessage,
  AiSendResult,
  AiStatus,
  AiStreamEvent,
} from "../types/ai";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

const DRAFT_SAVE_DELAY_MS = 250;
const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

/** In-memory draft so navigating away/back restores instantly without a flash. */
let cachedDraft: string | null = null;

type PendingImage = {
  name: string;
  mimeType: string;
  previewUrl: string;
  data: string;
};

export function AssistantPage() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState(() => cachedDraft ?? "");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [visionStatus, setVisionStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [generationFailed, setGenerationFailed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRequestIdRef = useRef<string | null>(null);
  const streamPerfRef = useRef<{
    requestId: string;
    startedAt: number;
    firstChunkAt: number | null;
    chunkCount: number;
  } | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftHydratedRef = useRef(cachedDraft !== null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;

  const resizeDraftInput = () => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingY =
      (Number.parseFloat(styles.paddingTop) || 0) +
      (Number.parseFloat(styles.paddingBottom) || 0);
    const borderY =
      (Number.parseFloat(styles.borderTopWidth) || 0) +
      (Number.parseFloat(styles.borderBottomWidth) || 0);
    const minHeight = lineHeight * 2 + paddingY + borderY;
    const maxHeight = lineHeight * 8 + paddingY + borderY;

    el.style.height = "0px";
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight + 1 ? "auto" : "hidden";
  };

  const persistDraft = (value: string, immediate = false) => {
    cachedDraft = value;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const write = () => {
      draftSaveTimerRef.current = null;
      void aiService.saveDraft(value).catch((error) => {
        console.error("[ai] draft save failed", error);
      });
    };
    if (immediate) {
      write();
      return;
    }
    draftSaveTimerRef.current = setTimeout(write, DRAFT_SAVE_DELAY_MS);
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    persistDraft(value);
  };

  const clearDraft = () => {
    setDraft("");
    persistDraft("", true);
  };

  const clearPendingImage = () => {
    setPendingImage(null);
  };

  const readFileAsPendingImage = (file: File) =>
    new Promise<PendingImage>((resolve, reject) => {
      const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
      if (!ACCEPTED_IMAGE_TYPES.includes(mime) && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        reject(new Error("Unsupported image format. Use PNG, JPG, WEBP, or GIF."));
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        reject(new Error("Image is too large. Use a file under 12 MB."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        if (!base64 || !result.startsWith("data:")) {
          reject(new Error("Image conversion failed."));
          return;
        }
        resolve({
          name: file.name || "image",
          mimeType: mime || "image/png",
          previewUrl: result,
          data: base64,
        });
      };
      reader.onerror = () => reject(new Error("Image conversion failed."));
      reader.readAsDataURL(file);
    });

  const attachImageFile = async (file: File | null | undefined) => {
    if (!file || sending) {
      return;
    }
    try {
      const next = await readFileAsPendingImage(file);
      setPendingImage(next);
      setError("");
      inputRef.current?.focus();
    } catch (attachError) {
      setError(getErrorMessage(attachError, "Could not attach image."));
    }
  };

  const refreshStatus = async () => {
    setChecking(true);
    try {
      const [chatStatus, vision] = await Promise.all([
        aiService.status(),
        aiService.visionStatus(),
      ]);
      setStatus(chatStatus);
      setVisionStatus(vision);
      if (chatStatus.available && chatStatus.modelReady) {
        setError("");
      }
    } catch (loadError) {
      setStatus({
        available: false,
        modelReady: false,
        model: "llama3.2",
        message: getErrorMessage(loadError, "Could not reach Ollama."),
      });
      setVisionStatus({
        available: false,
        modelReady: false,
        model: "qwen2.5vl",
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

  const handleStreamEvent = (event: AiStreamEvent) => {
    if (event.phase === "ready") {
      streamRequestIdRef.current = event.requestId;
      streamPerfRef.current = {
        requestId: event.requestId,
        startedAt: performance.now(),
        firstChunkAt: null,
        chunkCount: 0,
      };
      console.log("[ai:perf:ui] Stream ready", event.requestId);
      setAnalyzingImage(Boolean(event.analyzing));
      setActiveId(event.conversationId);
      if (event.messages) {
        setMessages(event.messages);
      }
      setStreamText("");
      return;
    }

    if (
      streamRequestIdRef.current &&
      event.requestId !== streamRequestIdRef.current
    ) {
      return;
    }

    if (event.phase === "chunk") {
      const perf = streamPerfRef.current;
      if (perf && perf.requestId === event.requestId) {
        perf.chunkCount += 1;
        if (perf.firstChunkAt === null) {
          perf.firstChunkAt = performance.now();
          console.log(
            `[ai:perf:ui] First chunk painted: ${(perf.firstChunkAt - perf.startedAt).toFixed(0)} ms`
          );
        }
      }
      setStreamText(event.content ?? "");
      return;
    }

    if (event.phase === "done") {
      const perf = streamPerfRef.current;
      if (perf && perf.requestId === event.requestId) {
        console.log("[ai:perf:ui] Stream done", {
          chunks: perf.chunkCount,
          totalMs: Number((performance.now() - perf.startedAt).toFixed(0)),
        });
      }
      if (event.messages) {
        setMessages(event.messages);
      }
      setStreamText(null);
      setAnalyzingImage(false);
      return;
    }

    if (event.phase === "error") {
      if (event.messages) {
        setMessages(event.messages);
      }
      setStreamText(null);
      setAnalyzingImage(false);
      setGenerationFailed(true);
      setError(event.error || "The AI request failed. Try again.");
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
    setStreamText(null);
    setAnalyzingImage(false);
    if (result.failed) {
      setGenerationFailed(true);
      setError(result.error || "The AI request failed. Try again.");
      void refreshStatus();
      return false;
    }
    setGenerationFailed(false);
    setError("");
    return true;
  };

  const openConversation = async (id: string) => {
    if (sending) {
      return;
    }
    setLoadingChat(true);
    setError("");
    setGenerationFailed(false);
    setStreamText(null);
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
      if (!draftHydratedRef.current) {
        try {
          const saved = await aiService.getDraft();
          cachedDraft = saved;
          setDraft(saved);
          draftHydratedRef.current = true;
          requestAnimationFrame(resizeDraftInput);
        } catch (error) {
          console.error("[ai] draft load failed", error);
          draftHydratedRef.current = true;
        }
      } else if (cachedDraft !== null) {
        setDraft(cachedDraft);
        requestAnimationFrame(resizeDraftInput);
      }

      await refreshStatus();
      const list = await refreshConversations();
      if (list[0]) {
        await openConversation(list[0].id);
      }
    })();

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
        if (cachedDraft !== null) {
          void aiService.saveDraft(cachedDraft).catch(() => {
            /* ignore flush errors on unmount */
          });
        }
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (!mounted) {
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, 8_000);
    };

    const poll = async () => {
      try {
        const [chatStatus, vision] = await Promise.all([
          aiService.status(),
          aiService.visionStatus(),
        ]);
        if (mounted) {
          setStatus(chatStatus);
          setVisionStatus(vision);
          setChecking(false);
        }
      } catch {
        if (mounted) {
          setStatus({
            available: false,
            modelReady: false,
            model: "llama3.2",
            message: "Could not reach Ollama.",
          });
          setVisionStatus({
            available: false,
            modelReady: false,
            model: "qwen2.5vl",
            message: "Could not reach Ollama.",
          });
          setChecking(false);
        }
      } finally {
        scheduleNext();
      }
    };

    timer = setTimeout(() => {
      void poll();
    }, 8_000);

    const onFocus = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void poll();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      if (timer) {
        clearTimeout(timer);
      }
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, sending, streamText]);

  useEffect(() => {
    resizeDraftInput();
  }, [draft, sending]);

  const startNewChat = async () => {
    if (sending) {
      return;
    }
    setError("");
    setGenerationFailed(false);
    setStreamText(null);
    try {
      const conversation = await aiService.createConversation();
      setActiveId(conversation.id);
      setMessages([]);
      await refreshConversations();
      inputRef.current?.focus();
    } catch (createError) {
      setError(getErrorMessage(createError, "Could not create a conversation."));
    }
  };

  const deleteActive = async (id: string) => {
    if (sending) {
      return;
    }
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

  const runGeneration = async (action: () => Promise<AiSendResult>, options?: { analyzing?: boolean }) => {
    streamRequestIdRef.current = null;
    setSending(true);
    setAnalyzingImage(Boolean(options?.analyzing));
    setError("");
    setGenerationFailed(false);
    setStreamText("");

    const stopListening = aiService.onStream(handleStreamEvent);

    try {
      const result = await action();
      const ok = applySendResult(result);
      await refreshConversations();
      return ok;
    } catch (runError) {
      setStreamText(null);
      setGenerationFailed(true);
      setError(getErrorMessage(runError, "The AI request failed. Try again."));
      void refreshStatus();
      if (activeId) {
        try {
          const bundle = await aiService.getConversation(activeId);
          setMessages(bundle.messages);
        } catch {
          /* keep current bubbles */
        }
      }
      await refreshConversations();
      return false;
    } finally {
      stopListening();
      streamRequestIdRef.current = null;
      setSending(false);
      setAnalyzingImage(false);
      inputRef.current?.focus();
    }
  };

  const send = async () => {
    const content = draft.trim();
    const image = pendingImage;
    if (sending) {
      return;
    }
    if (!content && !image) {
      setError("Enter a message or attach an image before sending.");
      return;
    }

    if (image) {
      const imagePayload: AiImagePayload = {
        mimeType: image.mimeType,
        data: image.data,
        name: image.name,
      };
      const promptForBubble = content || "Extract all text from this image.";
      setDraft("");
      setMessages((current) => [
        ...current,
        {
          role: "user",
          content: promptForBubble,
          imageUrl: image.previewUrl,
        },
      ]);
      clearPendingImage();
      const ok = await runGeneration(
        () => aiService.sendImageMessage(activeId, content, imagePayload),
        { analyzing: true }
      );
      if (ok) {
        clearDraft();
      } else {
        updateDraft(content);
      }
      return;
    }

    setDraft("");
    setMessages((current) => [...current, { role: "user", content }]);
    const ok = await runGeneration(() => aiService.sendMessage(activeId, content));
    if (ok) {
      clearDraft();
    } else {
      updateDraft(content);
    }
  };

  const retry = async () => {
    if (!activeId || sending) {
      return;
    }
    await runGeneration(() => aiService.retry(activeId));
  };

  const usingVision = Boolean(pendingImage || analyzingImage);
  const activeStatus = usingVision ? visionStatus : status;
  const aiNavState: AiNavState =
    checking && !activeStatus
      ? "checking"
      : !activeStatus || !activeStatus.available
        ? "offline"
        : !activeStatus.modelReady
          ? "missing"
          : "active";
  const statusModel = usingVision
    ? activeStatus?.model || "qwen2.5vl"
    : activeStatus?.model || "llama3.2";
  const canRetry =
    generationFailed &&
    Boolean(activeId) &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "user";
  const headerTitle = activeConversation?.title ?? "Assistant";
  const showEmpty = messages.length === 0 && !sending && streamText === null;

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
            disabled={sending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] disabled:opacity-40"
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
                  disabled={sending}
                  className="min-w-0 flex-1 text-left disabled:opacity-60"
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
                  disabled={sending}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteActive(conversation.id);
                  }}
                  className="rounded-md p-1.5 text-[rgb(var(--muted))] opacity-0 hover:bg-black/5 hover:text-[rgb(var(--danger))] group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 dark:hover:bg-white/10"
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
            {sending && (
              <p className="truncate text-xs text-[rgb(var(--muted))]">
                {analyzingImage ? "Analyzing image…" : "Generating…"}
              </p>
            )}
          </div>
          <AiStatusButton
            state={aiNavState}
            model={statusModel}
            detail={activeStatus?.message}
            onRefresh={() => void refreshStatus()}
          />
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={sending}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
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
          ) : showEmpty ? (
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
              {streamText ? <StreamingBubble content={streamText} /> : null}
              {sending && !streamText ? (
                <TypingIndicator label={analyzingImage ? "Analyzing image…" : undefined} />
              ) : null}
            </div>
          )}
        </div>

        <form
          className="shrink-0 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!sending) {
              setDragOver(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            void attachImageFile(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void attachImageFile(file);
              event.target.value = "";
            }}
          />

          {pendingImage && (
            <div className="mb-2 flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
              <img
                src={pendingImage.previewUrl}
                alt={pendingImage.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pendingImage.name}</p>
                <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
                  Ready to analyze with qwen2.5vl
                </p>
              </div>
              <button
                type="button"
                onClick={clearPendingImage}
                disabled={sending}
                className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--danger))] disabled:opacity-40 dark:hover:bg-white/10"
                aria-label="Remove image"
                title="Remove image"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div
            className={cn(
              "flex w-full items-end gap-2 rounded-xl border bg-[rgb(var(--surface))] p-2",
              dragOver
                ? "border-[rgb(var(--accent))] ring-2 ring-[rgb(var(--accent))]/30"
                : "border-[rgb(var(--border))]"
            )}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 text-sm text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] disabled:opacity-40 dark:hover:bg-white/10"
              title="Attach Image"
              aria-label="Attach Image"
            >
              <ImagePlus size={16} />
              <span className="hidden sm:inline">Attach</span>
            </button>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                updateDraft(event.target.value);
                requestAnimationFrame(resizeDraftInput);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              disabled={sending}
              placeholder={
                pendingImage
                  ? "Add an instruction for qwen2.5vl, or send to extract all text…"
                  : "Message llama3.2"
              }
              aria-label="Message"
              className="todo-scroll min-h-[42px] flex-1 resize-none overflow-hidden rounded-lg bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-[rgb(var(--muted))] disabled:opacity-60"
            />
          </div>
        </form>
      </section>
    </div>
  );
}

function messageKey(message: AiMessage) {
  return message.id ?? `${message.role}-${message.createdAt}-${message.content.slice(0, 24)}`;
}

type AiNavState = "checking" | "active" | "offline" | "missing";

function AiStatusButton({
  state,
  model,
  detail,
  onRefresh,
}: {
  state: AiNavState;
  model: string;
  detail?: string;
  onRefresh: () => void;
}) {
  const modelLabel = model.trim() || "llama3.2";
  const label =
    state === "active"
      ? modelLabel
      : state === "missing"
        ? `${modelLabel} missing`
        : state === "checking"
          ? "Checking…"
          : "Offline";

  const title =
    detail?.trim() ||
    (state === "active"
      ? `Ollama is running with ${modelLabel}`
      : state === "missing"
        ? `Ollama is running, but ${modelLabel} is not installed`
        : state === "checking"
          ? "Checking Ollama…"
          : "Ollama is not running");

  return (
    <button
      type="button"
      onClick={onRefresh}
      title={title}
      aria-label={label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
        state === "active" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300",
        state === "missing" &&
          "border-amber-500/35 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300",
        (state === "offline" || state === "checking") &&
          "border-[rgb(var(--border))] bg-black/5 text-[rgb(var(--muted))] hover:bg-black/10 dark:hover:bg-white/10"
      )}
    >
      {state === "active" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      ) : state === "missing" ? (
        <span aria-hidden="true">⚠</span>
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full border border-current opacity-70"
          aria-hidden="true"
        />
      )}
      <span className="max-w-[10rem] truncate whitespace-nowrap">{label}</span>
    </button>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  const imageSrc = message.imageUrl || null;
  return (
    <article
      className={cn(
        "rounded-2xl px-4 py-3 text-sm leading-6",
        isUser
          ? "ml-auto max-w-[85%] bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
          : "mr-auto w-full max-w-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      )}
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
        {isUser ? "You" : "Assistant"}
      </p>
      {isUser && imageSrc ? (
        <img
          src={imageSrc}
          alt="Attached"
          className="mb-2 max-h-64 w-full rounded-xl object-contain bg-black/10"
        />
      ) : null}
      {isUser && message.imageMissing ? (
        <p className="mb-2 text-xs opacity-80">Attached image is missing on disk.</p>
      ) : null}
      {isUser ? (
        <CollapsibleUserText content={message.content} />
      ) : (
        <ChatMarkdown content={message.content} />
      )}
    </article>
  );
}

const USER_MESSAGE_COLLAPSED_LINES = 8;

function CollapsibleUserText({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [maxHeightPx, setMaxHeightPx] = useState(0);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [content]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }

    const measure = () => {
      const styles = window.getComputedStyle(el);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
      const limit = Math.ceil(lineHeight * USER_MESSAGE_COLLAPSED_LINES);

      const previousMaxHeight = el.style.maxHeight;
      const previousOverflow = el.style.overflow;
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
      const fullHeight = el.scrollHeight;
      el.style.maxHeight = previousMaxHeight;
      el.style.overflow = previousOverflow;

      setMaxHeightPx((current) => (current === limit ? current : limit));
      setOverflows(fullHeight > limit + 1);
    };

    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [content]);

  const collapsed = !expanded && overflows && maxHeightPx > 0;

  return (
    <div>
      <div className="relative">
        <p
          ref={textRef}
          className="select-text whitespace-pre-wrap break-words leading-6"
          style={
            collapsed
              ? { maxHeight: `${maxHeightPx}px`, overflow: "hidden" }
              : undefined
          }
        >
          {content}
        </p>
        {collapsed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[rgb(var(--accent))] via-[rgb(var(--accent))]/85 to-transparent"
          />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="relative z-[1] mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[rgb(var(--accent-foreground))] opacity-95 hover:opacity-100"
        >
          {expanded ? "Show less" : "Show more"}
          {expanded ? (
            <ChevronUp size={16} strokeWidth={2.5} />
          ) : (
            <ChevronDown size={16} strokeWidth={2.5} />
          )}
        </button>
      )}
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  if (!content) {
    return null;
  }

  return (
    <article className="mr-auto w-full max-w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm leading-6">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
        Assistant
      </p>
      <ChatMarkdown content={content} />
      <span
        className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-[rgb(var(--muted))]"
        aria-hidden="true"
      />
    </article>
  );
}

function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="mr-auto flex w-full max-w-full items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
        Assistant
      </p>
      <span className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
        <span className="flex items-center gap-1" aria-label={label || "Generating a reply"}>
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
        {label || "Generating…"}
      </span>
    </div>
  );
}
