import fs from "fs";
import path from "path";

/**
 * Configurable Ollama client (base URL, model, temperature). The Assistant chat keeps using
 * ollamaClient.js with its fixed model; features that let the user pick a model use this module.
 */

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

const STATUS_TIMEOUT_MS = 5_000;
const DEFAULT_GENERATE_TIMEOUT_MS = 240_000;
const CONTEXT_TOKENS = 8192;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class OllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
  }
}

/** Accept only plain http(s) origins; paths, queries and credentials are dropped or refused. */
export function normalizeOllamaUrl(value) {
  const text = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_OLLAMA_URL;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new OllamaError("INVALID_URL", "Enter a valid Ollama URL, such as http://localhost:11434.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OllamaError("INVALID_URL", "The Ollama URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new OllamaError("INVALID_URL", "The Ollama URL must not contain a user name or password.");
  }
  return url.origin;
}

function isLoopback(baseUrl) {
  try {
    return LOOPBACK_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/** Ollama listens on IPv4 loopback by default; "localhost" may resolve to ::1 first. */
function endpoint(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  return url;
}

/** Best-effort, read-only check for an Ollama install. Never executes anything. */
export function isOllamaInstalled() {
  const exe = process.platform === "win32" ? "ollama.exe" : "ollama";
  const candidates = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, exe));
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", exe));
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, "Ollama", exe));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Ollama.app", "/usr/local/bin/ollama", "/opt/homebrew/bin/ollama");
  } else {
    candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama", "/snap/bin/ollama");
  }
  return candidates.some((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function isConnectionFailure(error) {
  const code = String(error?.cause?.code || error?.code || "");
  return (
    ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(code) ||
    /fetch failed|ECONNREFUSED|network/i.test(String(error?.message || ""))
  );
}

function unreachable(baseUrl) {
  if (isLoopback(baseUrl) && !isOllamaInstalled()) {
    return new OllamaError(
      "OLLAMA_NOT_INSTALLED",
      "Ollama doesn't appear to be installed. Install it from ollama.com, start it, then try again."
    );
  }
  return new OllamaError("OLLAMA_UNAVAILABLE", `Ollama is not running at ${baseUrl}. Start Ollama, then try again.`);
}

/**
 * fetch() with a timeout and an optional caller signal. Distinguishes cancellation, timeouts and
 * connection failures so the UI can explain what happened.
 */
async function request(baseUrl, pathname, { method = "GET", body, timeoutMs, signal } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await fetch(endpoint(baseUrl, pathname), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new OllamaError("CANCELLED", "The request was cancelled.");
    }
    if (timeout.aborted) {
      throw new OllamaError(
        pathname === "/api/chat" ? "MODEL_TIMEOUT" : "OLLAMA_UNAVAILABLE",
        pathname === "/api/chat"
          ? "The local model took too long to respond. Try fewer questions or a smaller model."
          : `Ollama did not respond at ${baseUrl}. Check that it is running.`
      );
    }
    if (isConnectionFailure(error)) {
      throw unreachable(baseUrl);
    }
    console.error("[ollama] request failed", error);
    throw new OllamaError("OLLAMA_UNAVAILABLE", `Could not reach Ollama at ${baseUrl}.`);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Model names match with or without the implicit ":latest" tag. */
export function matchesModel(installed, wanted) {
  if (!installed || !wanted) {
    return false;
  }
  return installed === wanted || installed === `${wanted}:latest` || wanted === `${installed}:latest`;
}

export async function listModels(baseUrl, { signal } = {}) {
  const response = await request(baseUrl, "/api/tags", { timeoutMs: STATUS_TIMEOUT_MS, signal });
  if (!response.ok) {
    throw new OllamaError("OLLAMA_UNAVAILABLE", "Ollama responded with an error. Check that it is running.");
  }
  const body = await readJson(response);
  const models = Array.isArray(body?.models) ? body.models : [];
  return models
    .map((model) => ({
      name: String(model?.name || model?.model || ""),
      sizeBytes: Number(model?.size) || 0,
      parameterSize: typeof model?.details?.parameter_size === "string" ? model.details.parameter_size : "",
      family: typeof model?.details?.family === "string" ? model.details.family : "",
      modifiedAt: typeof model?.modified_at === "string" ? model.modified_at : "",
    }))
    .filter((model) => model.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getVersion(baseUrl) {
  try {
    const response = await request(baseUrl, "/api/version", { timeoutMs: STATUS_TIMEOUT_MS });
    const body = response.ok ? await readJson(response) : null;
    return typeof body?.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

/** Connection + model availability, phrased for the settings screen. Never throws. */
export async function checkConnection({ baseUrl, model }) {
  let models;
  try {
    models = await listModels(baseUrl);
  } catch (error) {
    return {
      connected: false,
      baseUrl,
      version: null,
      models: [],
      model: model || "",
      modelAvailable: false,
      code: error instanceof OllamaError ? error.code : "OLLAMA_UNAVAILABLE",
      message: error instanceof OllamaError ? error.message : "Could not reach Ollama.",
    };
  }
  const version = await getVersion(baseUrl);
  const modelAvailable = Boolean(model) && models.some((item) => matchesModel(item.name, model));
  let code = null;
  let message = "";
  if (models.length === 0) {
    code = "NO_MODELS";
    message = "Ollama is running but has no models installed. Run: ollama pull llama3.2";
  } else if (!model) {
    code = "MODEL_NOT_SELECTED";
    message = "Select a model to use.";
  } else if (!modelAvailable) {
    code = "MODEL_UNAVAILABLE";
    message = `The model "${model}" is not installed. Run: ollama pull ${model}`;
  }
  return { connected: true, baseUrl, version, models, model: model || "", modelAvailable, code, message };
}

/**
 * Non-streaming chat that asks Ollama to constrain output to `schema` (structured outputs).
 * Returns the raw text; callers must still parse and validate it as untrusted data.
 */
export async function chatJson({ baseUrl, model, temperature, messages, schema, timeoutMs, signal }) {
  const send = (format) =>
    request(baseUrl, "/api/chat", {
      method: "POST",
      timeoutMs: timeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS,
      signal,
      body: {
        model,
        messages,
        stream: false,
        format,
        options: { temperature, num_ctx: CONTEXT_TOKENS },
      },
    });

  let response = await send(schema ?? "json");
  let body = await readJson(response);

  // Ollama releases before structured outputs only accept format: "json".
  if (!response.ok && schema && /format|schema/i.test(String(body?.error || ""))) {
    response = await send("json");
    body = await readJson(response);
  }

  if (!response.ok) {
    const detail = String(body?.error || "");
    if (response.status === 404 || /not found|pull/i.test(detail)) {
      throw new OllamaError("MODEL_UNAVAILABLE", `The model "${model}" is not installed. Run: ollama pull ${model}`);
    }
    console.error("[ollama] chat failed", response.status, detail);
    throw new OllamaError("AI_FAILED", "The local model could not generate a response. Try again.");
  }

  const content = typeof body?.message?.content === "string" ? body.message.content : "";
  if (!content.trim()) {
    throw new OllamaError("AI_EMPTY", "The local model returned an empty response.");
  }
  return { content, model: typeof body?.model === "string" ? body.model : model };
}
