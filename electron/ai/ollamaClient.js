const OLLAMA_BASE = "http://127.0.0.1:11434";
const MODEL = "llama3.2";
const STATUS_TIMEOUT_MS = 4_000;
const CHAT_TIMEOUT_MS = 120_000;
const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 12_000;

const SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are TodoDesk's local assistant. Help with planning, writing, summarizing, and explaining text. Keep answers concise. Do not claim you created, edited, or deleted tasks or clipboard items.",
};

const MISSING_MODEL_MESSAGE = [
  "Llama 3.2 is not installed.",
  "",
  "Run:",
  "",
  "ollama pull llama3.2",
].join("\n");

const OFFLINE_MESSAGE = "Ollama is not running. Start Ollama, then try again.";

function isModelName(name) {
  return name === MODEL || name.startsWith(`${MODEL}:`);
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

function asErrorMessage(error, fallback) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "The AI request took too long. Try a shorter message.";
    }
    const cause = error.cause;
    const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      /fetch failed|ECONNREFUSED|network/i.test(error.message)
    ) {
      return OFFLINE_MESSAGE;
    }
    return error.message || fallback;
  }
  return fallback;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("Ollama returned a response that could not be read.");
  }
}

export async function getAiStatus() {
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: timeoutSignal(STATUS_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      available: false,
      modelReady: false,
      model: MODEL,
      message: asErrorMessage(error, OFFLINE_MESSAGE),
    };
  }

  if (!response.ok) {
    return {
      available: false,
      modelReady: false,
      model: MODEL,
      message: "Ollama responded with an error. Check that it is running.",
    };
  }

  const body = await readJson(response);
  const models = Array.isArray(body?.models) ? body.models : [];
  const modelReady = models.some((model) =>
    isModelName(String(model?.name || model?.model || ""))
  );

  return {
    available: true,
    modelReady,
    model: MODEL,
    message: modelReady ? "" : MISSING_MODEL_MESSAGE,
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Enter a message before sending.");
  }

  const recent = messages.slice(-MAX_MESSAGES);
  const normalized = [];

  for (const message of recent) {
    const role = message?.role;
    const content = typeof message?.content === "string" ? message.content.trim() : "";
    if (role !== "user" && role !== "assistant") {
      throw new Error("The conversation contains an unsupported message.");
    }
    if (!content) {
      continue;
    }
    normalized.push({
      role,
      content: content.slice(0, MAX_CONTENT_LENGTH),
    });
  }

  if (normalized.length === 0 || normalized[normalized.length - 1].role !== "user") {
    throw new Error("Enter a message before sending.");
  }

  return [SYSTEM_MESSAGE, ...normalized];
}

/**
 * Stream a chat completion from Ollama (`stream: true`).
 * Calls onChunk(delta, fullText) for each content piece, then returns the final text.
 */
export async function streamChatWithAi(messages, { onChunk } = {}) {
  const status = await getAiStatus();
  if (!status.available || !status.modelReady) {
    throw new Error(status.message || OFFLINE_MESSAGE);
  }

  const payload = normalizeMessages(messages);
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: payload,
        stream: true,
      }),
      signal: timeoutSignal(CHAT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error, "Could not reach Ollama."));
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await readJson(response);
      detail = typeof errorBody?.error === "string" ? errorBody.error : "";
    } catch {
      /* ignore parse errors */
    }
    if (/not found|pull/i.test(detail)) {
      throw new Error(MISSING_MODEL_MESSAGE);
    }
    throw new Error("The AI request failed. Try again.");
  }

  if (!response.body) {
    throw new Error("Ollama did not return a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let sawDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        let chunk;
        try {
          chunk = JSON.parse(trimmed);
        } catch {
          throw new Error("Ollama returned a malformed stream chunk.");
        }

        if (typeof chunk?.error === "string" && chunk.error) {
          if (/not found|pull/i.test(chunk.error)) {
            throw new Error(MISSING_MODEL_MESSAGE);
          }
          throw new Error(chunk.error);
        }

        const delta =
          typeof chunk?.message?.content === "string" ? chunk.message.content : "";
        if (delta) {
          fullText += delta;
          if (typeof onChunk === "function") {
            onChunk(delta, fullText);
          }
        }

        if (chunk?.done === true) {
          sawDone = true;
        }
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim());
        const delta =
          typeof chunk?.message?.content === "string" ? chunk.message.content : "";
        if (delta) {
          fullText += delta;
          if (typeof onChunk === "function") {
            onChunk(delta, fullText);
          }
        }
        if (chunk?.done === true) {
          sawDone = true;
        }
      } catch {
        /* trailing incomplete buffer after disconnect */
      }
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      /* ignore cancel errors */
    }
    throw new Error(asErrorMessage(error, "The AI stream was interrupted."));
  }

  const content = fullText.trim();
  if (!content) {
    throw new Error(
      sawDone
        ? "The AI response was empty. Try again."
        : "The AI stream ended before a reply was ready."
    );
  }

  return {
    role: "assistant",
    content,
    model: MODEL,
  };
}

/** Non-streaming helper kept for callers that only need the final text. */
export async function chatWithAi(messages) {
  return streamChatWithAi(messages);
}
