/**
 * Temporary Ollama performance probe (read-only diagnostics).
 * Run: node scripts/probe-ollama-perf.mjs
 */
const OLLAMA_BASE = "http://127.0.0.1:11434";
const MODEL = "llama3.2";

async function readNdjsonStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let firstTokenAt = null;
  let chunkCount = 0;
  let doneMeta = null;
  const startedAt = performance.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const chunk = JSON.parse(trimmed);
      const delta = chunk?.message?.content || "";
      if (delta) {
        if (firstTokenAt === null) firstTokenAt = performance.now();
        fullText += delta;
        chunkCount += 1;
      }
      if (chunk?.done) doneMeta = chunk;
    }
  }

  return {
    startedAt,
    firstTokenAt,
    completedAt: performance.now(),
    fullText,
    chunkCount,
    doneMeta,
  };
}

function nsToMs(ns) {
  return ns ? Number((ns / 1e6).toFixed(1)) : null;
}

function summarize(label, result) {
  const evalCount = Number(result.doneMeta?.eval_count) || 0;
  const evalNs = Number(result.doneMeta?.eval_duration) || 0;
  const promptNs = Number(result.doneMeta?.prompt_eval_duration) || 0;
  const loadNs = Number(result.doneMeta?.load_duration) || 0;
  const totalNs = Number(result.doneMeta?.total_duration) || 0;
  const ttft =
    result.firstTokenAt === null
      ? null
      : Number((result.firstTokenAt - result.startedAt).toFixed(0));
  const totalMs = Number((result.completedAt - result.startedAt).toFixed(0));
  const tokPerSec = evalNs > 0 ? Number(((evalCount / evalNs) * 1e9).toFixed(2)) : null;

  console.log(`\n=== ${label} ===`);
  console.log("First token (TTFT):", ttft, "ms");
  console.log("Total response time:", totalMs, "ms");
  console.log("Stream chunks:", result.chunkCount);
  console.log("Response chars:", result.fullText.length);
  console.log("Total tokens (eval_count):", evalCount || null);
  console.log("Tokens/sec (Ollama eval):", tokPerSec);
  console.log("load_duration:", nsToMs(loadNs), "ms");
  console.log("prompt_eval_duration:", nsToMs(promptNs), "ms");
  console.log("eval_duration:", nsToMs(evalNs), "ms");
  console.log("total_duration:", nsToMs(totalNs), "ms");
}

async function main() {
  console.log("Probing Ollama at", OLLAMA_BASE);

  const tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!tagsRes.ok) throw new Error("Ollama /api/tags failed");
  const tags = await tagsRes.json();
  const models = (tags.models || []).map((m) => m.name);
  console.log("Installed models:", models.join(", ") || "(none)");

  const psRes = await fetch(`${OLLAMA_BASE}/api/ps`);
  const ps = psRes.ok ? await psRes.json() : { models: [] };
  console.log("Currently loaded:", JSON.stringify(ps.models || [], null, 2));

  // Warm / reveal runner details via a tiny generate
  const warmStarted = performance.now();
  const warmRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    }),
  });
  if (!warmRes.ok) throw new Error(`Warm chat failed: ${warmRes.status}`);
  const warm = await readNdjsonStream(warmRes);
  console.log(`Warm request wall time: ${(performance.now() - warmStarted).toFixed(0)} ms`);
  summarize("Warm (short) chat stream=true", warm);

  const psAfter = await fetch(`${OLLAMA_BASE}/api/ps`);
  const loaded = psAfter.ok ? await psAfter.json() : { models: [] };
  console.log("\nLoaded model details after warm:");
  for (const m of loaded.models || []) {
    console.log({
      name: m.name,
      size: m.size,
      size_vram: m.size_vram,
      details: m.details,
      // size_vram > 0 typically means GPU-resident
      likelyGpu: Number(m.size_vram) > 0,
      processor: m.details?.family || m.details?.parameter_size,
    });
  }

  const benchRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: "Write a short 80-word explanation of Node.js event loop.",
        },
      ],
    }),
  });
  if (!benchRes.ok) throw new Error(`Bench chat failed: ${benchRes.status}`);
  const bench = await readNdjsonStream(benchRes);
  summarize("Bench (~80 words) chat stream=true", bench);

  // Compare stream false for same prompt size (second request, model warm)
  const nonStreamStarted = performance.now();
  const nonStreamRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: "Write a short 80-word explanation of React hooks.",
        },
      ],
    }),
  });
  const nonStreamBody = await nonStreamRes.json();
  const nonStreamMs = performance.now() - nonStreamStarted;
  console.log("\n=== Non-stream comparison ===");
  console.log("Total response time:", Number(nonStreamMs.toFixed(0)), "ms");
  console.log("eval_count:", nonStreamBody.eval_count);
  console.log(
    "tokens/sec:",
    nonStreamBody.eval_duration
      ? Number(((nonStreamBody.eval_count / nonStreamBody.eval_duration) * 1e9).toFixed(2))
      : null
  );
  console.log("load_duration ms:", nsToMs(nonStreamBody.load_duration));
  console.log("prompt_eval_duration ms:", nsToMs(nonStreamBody.prompt_eval_duration));
  console.log("eval_duration ms:", nsToMs(nonStreamBody.eval_duration));
}

main().catch((error) => {
  console.error("Probe failed:", error.message || error);
  process.exit(1);
});
