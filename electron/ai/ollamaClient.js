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

export async function chatWithAi(messages) {
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
        stream: false,
      }),
      signal: timeoutSignal(CHAT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error, "Could not reach Ollama."));
  }

  const body = await readJson(response);
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : "";
    if (/not found|pull/i.test(detail)) {
      throw new Error(MISSING_MODEL_MESSAGE);
    }
    throw new Error("The AI request failed. Try again.");
  }

  const content = body?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The AI response was empty. Try again.");
  }

  return {
    role: "assistant",
    content: content.trim(),
    model: MODEL,
  };
}
