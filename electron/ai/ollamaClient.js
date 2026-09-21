const OLLAMA_BASE = "http://127.0.0.1:11434";
const MODEL = "llama3.2";
const VISION_MODEL = "qwen2.5vl";
const STATUS_TIMEOUT_MS = 4_000;
const CHAT_TIMEOUT_MS = 120_000;
const VISION_TIMEOUT_MS = 180_000;
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

const MISSING_VISION_MODEL_MESSAGE = [
  "Unable to analyze the image.",
  "Make sure Ollama is running and qwen2.5vl is installed.",
  "",
  "Run:",
  "",
  "ollama pull qwen2.5vl",
].join("\n");

const OFFLINE_MESSAGE = "Ollama is not running. Start Ollama, then try again.";

function isModelName(name, expected) {
  return name === expected || name.startsWith(`${expected}:`);
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
  const matched = models.find((model) =>
    isModelName(String(model?.name || model?.model || ""), MODEL)
  );
  const modelName = matched
    ? String(matched.name || matched.model || MODEL)
    : MODEL;
  const modelReady = Boolean(matched);

  return {
    available: true,
    modelReady,
    model: modelName,
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
  const requestStartedAt = performance.now();
  console.log("[ai:perf] Request started");

  const statusStartedAt = performance.now();
  const status = await getAiStatus();
  console.log(
    `[ai:perf] Status check: ${(performance.now() - statusStartedAt).toFixed(0)} ms (available=${status.available}, modelReady=${status.modelReady}, model=${status.model})`
  );
  if (!status.available || !status.modelReady) {
    throw new Error(status.message || OFFLINE_MESSAGE);
  }

  const payload = normalizeMessages(messages);
  const historyChars = payload.reduce(
    (sum, message) => sum + String(message.content || "").length,
    0
  );
  console.log(
    `[ai:perf] Prompt prepared: ${payload.length} messages (${historyChars} chars), stream=true, model=${MODEL}`
  );

  let response;
  const fetchStartedAt = performance.now();
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
  console.log(
    `[ai:perf] HTTP response headers: ${(performance.now() - fetchStartedAt).toFixed(0)} ms (status=${response.status})`
  );

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
  let firstTokenAt = null;
  let chunkCount = 0;
  let lastDoneMeta = null;

  const handleChunk = (chunk) => {
    if (typeof chunk?.error === "string" && chunk.error) {
      if (/not found|pull/i.test(chunk.error)) {
        throw new Error(MISSING_MODEL_MESSAGE);
      }
      throw new Error(chunk.error);
    }

    const delta =
      typeof chunk?.message?.content === "string" ? chunk.message.content : "";
    if (delta) {
      if (firstTokenAt === null) {
        firstTokenAt = performance.now();
        console.log(
          `[ai:perf] First token received: ${(firstTokenAt - requestStartedAt).toFixed(0)} ms`
        );
      }
      fullText += delta;
      chunkCount += 1;
      if (typeof onChunk === "function") {
        onChunk(delta, fullText);
      }
    }

    if (chunk?.done === true) {
      sawDone = true;
      lastDoneMeta = chunk;
    }
  };

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
        handleChunk(chunk);
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim());
        handleChunk(chunk);
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

  const completedAt = performance.now();
  const content = fullText.trim();
  if (!content) {
    throw new Error(
      sawDone
        ? "The AI response was empty. Try again."
        : "The AI stream ended before a reply was ready."
    );
  }

  const totalMs = completedAt - requestStartedAt;
  const genMs =
    firstTokenAt === null ? totalMs : completedAt - firstTokenAt;
  const evalCount = Number(lastDoneMeta?.eval_count) || 0;
  const evalDurationNs = Number(lastDoneMeta?.eval_duration) || 0;
  const promptEvalCount = Number(lastDoneMeta?.prompt_eval_count) || 0;
  const promptEvalDurationNs = Number(lastDoneMeta?.prompt_eval_duration) || 0;
  const loadDurationNs = Number(lastDoneMeta?.load_duration) || 0;
  const totalDurationNs = Number(lastDoneMeta?.total_duration) || 0;
  const ollamaTokPerSec =
    evalDurationNs > 0 ? (evalCount / evalDurationNs) * 1e9 : 0;
  const wallTokPerSec = genMs > 0 ? (evalCount || chunkCount) / (genMs / 1000) : 0;

  console.log("[ai:perf] Generation completed:", {
    firstTokenMs: firstTokenAt === null ? null : Number((firstTokenAt - requestStartedAt).toFixed(0)),
    generationMs: Number(genMs.toFixed(0)),
    totalResponseMs: Number(totalMs.toFixed(0)),
    streamChunks: chunkCount,
    responseChars: content.length,
    totalTokens: evalCount || null,
    tokensPerSecOllama: ollamaTokPerSec ? Number(ollamaTokPerSec.toFixed(2)) : null,
    tokensPerSecWall: Number(wallTokPerSec.toFixed(2)),
    promptTokens: promptEvalCount || null,
    promptEvalMs: promptEvalDurationNs
      ? Number((promptEvalDurationNs / 1e6).toFixed(0))
      : null,
    loadMs: loadDurationNs ? Number((loadDurationNs / 1e6).toFixed(0)) : null,
    ollamaTotalMs: totalDurationNs
      ? Number((totalDurationNs / 1e6).toFixed(0))
      : null,
  });

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

export async function getVisionStatus() {
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: timeoutSignal(STATUS_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      available: false,
      modelReady: false,
      model: VISION_MODEL,
      message: asErrorMessage(error, OFFLINE_MESSAGE),
    };
  }

  if (!response.ok) {
    return {
      available: false,
      modelReady: false,
      model: VISION_MODEL,
      message: "Ollama responded with an error. Check that it is running.",
    };
  }

  const body = await readJson(response);
  const models = Array.isArray(body?.models) ? body.models : [];
  const matched = models.find((model) =>
    isModelName(String(model?.name || model?.model || ""), VISION_MODEL)
  );
  const modelName = matched
    ? String(matched.name || matched.model || VISION_MODEL)
    : VISION_MODEL;

  return {
    available: true,
    modelReady: Boolean(matched),
    model: modelName,
    message: matched ? "" : MISSING_VISION_MODEL_MESSAGE,
  };
}

/**
 * Analyze an image with local Qwen2.5-VL via Ollama /api/generate (stream: false).
 */
export async function analyzeImageWithVision({ prompt, base64Image }) {
  const status = await getVisionStatus();
  if (!status.available || !status.modelReady) {
    throw new Error(status.message || MISSING_VISION_MODEL_MESSAGE);
  }

  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (!text) {
    throw new Error("Enter a prompt for the image analysis.");
  }
  if (typeof base64Image !== "string" || !base64Image.trim()) {
    throw new Error("Invalid image.");
  }

  // Strip data-URL prefix if a caller accidentally included it.
  const imageData = base64Image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");

  let response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt: text,
        images: [imageData],
        stream: false,
      }),
      signal: timeoutSignal(VISION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error, "Could not reach Ollama."));
  }

  const body = await readJson(response);
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : "";
    if (/not found|pull/i.test(detail)) {
      throw new Error(MISSING_VISION_MODEL_MESSAGE);
    }
    throw new Error(
      "Unable to analyze the image.\nMake sure Ollama is running and qwen2.5vl is installed."
    );
  }

  const content =
    typeof body?.response === "string"
      ? body.response.trim()
      : typeof body?.message?.content === "string"
        ? body.message.content.trim()
        : "";

  if (!content) {
    throw new Error("The vision model returned an empty response. Try again.");
  }

  return {
    role: "assistant",
    content,
    model: VISION_MODEL,
  };
}
