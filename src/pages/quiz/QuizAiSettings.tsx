import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, PlugZap, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "../../components/CopyButton";
import { CARD, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/quiz/styles";
import { useQuizAi } from "../../hooks/quiz/useQuizAi";
import { quizService } from "../../services/quizService";
import type { OllamaModel, QuizAiStatus } from "../../types/quiz";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/errors";
import { formatModelSize } from "../../utils/quizFormat";

const DEFAULT_URL = "http://localhost:11434";

const HELP_COMMANDS = [
  { label: "Start Ollama", command: "ollama serve" },
  { label: "Install a recommended model", command: "ollama pull qwen2.5:7b" },
  { label: "Smaller, faster model", command: "ollama pull llama3.2" },
];

export function QuizAiSettings() {
  const ai = useQuizAi();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URL);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.4);
  const [models, setModels] = useState<OllamaModel[] | null>(null);
  const [testStatus, setTestStatus] = useState<QuizAiStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (ai.config && !initialized) {
      setBaseUrl(ai.config.baseUrl);
      setModel(ai.config.model);
      setTemperature(ai.config.temperature);
      setInitialized(true);
    }
  }, [ai.config, initialized]);

  /** Results from a previous URL no longer apply; fall back to the saved configuration's status. */
  const changeUrl = (value: string) => {
    setBaseUrl(value);
    setTestStatus(null);
    setModels(null);
  };

  const status = testStatus ?? ai.status;
  const availableModels = models ?? status?.models ?? [];
  const dirty =
    Boolean(ai.config) &&
    (baseUrl.trim() !== ai.config?.baseUrl || model !== ai.config?.model || temperature !== ai.config?.temperature);

  const modelOptions = useMemo(() => {
    const names = availableModels.map((item) => item.name);
    return model && !names.includes(model) ? [...names, model] : names;
  }, [availableModels, model]);

  const test = async () => {
    const next = await ai.check({ baseUrl: baseUrl.trim(), model, temperature });
    if (next) {
      setTestStatus(next);
      setModels(next.models);
    }
  };

  const refreshModels = async () => {
    setRefreshing(true);
    try {
      const next = await quizService.ai.getModels(baseUrl.trim());
      setModels(next);
      toast.success(next.length ? `Found ${next.length} installed ${next.length === 1 ? "model" : "models"}` : "No models installed");
    } catch (error) {
      setModels([]);
      toast.error(getErrorMessage(error, "Could not load models from Ollama."));
    } finally {
      setRefreshing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const saved = await ai.save({ provider: "ollama", baseUrl: baseUrl.trim(), model, temperature });
    setSaving(false);
    if (saved) {
      setBaseUrl(saved.baseUrl);
      setTestStatus(null);
      setModels(null);
    }
  };

  if (ai.loading && !ai.config) {
    return <div className="h-80 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className={cn(CARD, "space-y-5")}>
        <div>
          <h2 className="text-base font-semibold">AI Settings</h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">
            Quiz questions and performance analysis run on your computer through Ollama. Nothing is sent to the internet.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Provider</span>
            <select className={cn(INPUT, "mt-1")} value="ollama" disabled aria-describedby="provider-hint">
              <option value="ollama">Ollama (local)</option>
            </select>
            <span id="provider-hint" className="mt-1 block text-xs text-[rgb(var(--muted))]">
              Only local providers are supported.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Ollama URL</span>
            <input
              className={cn(INPUT, "mt-1")}
              value={baseUrl}
              onChange={(event) => changeUrl(event.target.value)}
              placeholder={DEFAULT_URL}
              spellCheck={false}
            />
            {baseUrl.trim() !== DEFAULT_URL && (
              <button type="button" className="mt-1 text-xs text-[rgb(var(--accent))] hover:underline" onClick={() => changeUrl(DEFAULT_URL)}>
                Reset to default
              </button>
            )}
          </label>
        </div>

        <div>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-sm font-medium">Model</span>
              <select
                className={cn(INPUT, "mt-1")}
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setTestStatus(null);
                }}
              >
                <option value="">Automatic (pick a suitable installed model)</option>
                {modelOptions.map((name) => {
                  const info = availableModels.find((item) => item.name === name);
                  const details = info ? [info.parameterSize, formatModelSize(info.sizeBytes)].filter(Boolean).join(" · ") : "not installed";
                  return (
                    <option key={name} value={name}>
                      {name}
                      {details ? ` (${details})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => void refreshModels()} disabled={refreshing}>
              <RefreshCw size={14} className={cn(refreshing && "animate-spin")} /> Refresh Models
            </button>
          </div>
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">
            Larger instruction-tuned models (7B+) write noticeably more accurate questions. Vision and embedding models are not suitable.
          </p>
        </div>

        <label className="block">
          <span className="flex items-center justify-between text-sm font-medium">
            Temperature <span className="tabular-nums text-[rgb(var(--muted))]">{temperature.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temperature}
            onChange={(event) => setTemperature(Number(event.target.value))}
            className="mt-2 w-full accent-[rgb(var(--accent))]"
          />
          <span className="mt-0.5 flex justify-between text-xs text-[rgb(var(--muted))]">
            <span>Focused</span>
            <span>Varied</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 border-t border-[rgb(var(--border))] pt-4">
          <button type="button" className={SECONDARY_BUTTON} onClick={() => void test()} disabled={ai.checking}>
            {ai.checking ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Test Connection
          </button>
          <button type="button" className={cn(PRIMARY_BUTTON, "ml-auto")} onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </section>

      <aside className="space-y-5">
        <section className={CARD}>
          <h3 className="text-sm font-semibold">Status</h3>
          {testStatus && <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">Showing the result for the values in the form.</p>}
          <StatusLines status={status} model={model} checking={ai.checking} />
        </section>
        <section className={CARD}>
          <h3 className="text-sm font-semibold">Setup help</h3>
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">
            Install Ollama from ollama.com, then run these commands in a terminal.
          </p>
          <ul className="mt-3 space-y-2">
            {HELP_COMMANDS.map((item) => (
              <li key={item.command}>
                <p className="text-xs text-[rgb(var(--muted))]">{item.label}</p>
                <div className="mt-0.5 flex items-center justify-between gap-2 rounded-md bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">
                  <code>{item.command}</code>
                  <CopyButton value={item.command} label={`Copy "${item.command}"`} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[rgb(var(--muted))]">These settings apply to quizzes only; the Assistant keeps its own model choice.</p>
        </section>
      </aside>
    </div>
  );
}

function StatusLines({ status, model, checking }: { status: QuizAiStatus | null; model: string; checking: boolean }) {
  if (checking) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
        <Loader2 size={14} className="animate-spin" /> Checking Ollama…
      </p>
    );
  }
  if (!status) {
    return <p className="mt-3 text-sm text-[rgb(var(--muted))]">Press Test Connection to check Ollama.</p>;
  }

  const lines: { ok: boolean | null; text: string; detail?: string }[] = [];
  if (!status.connected) {
    lines.push({
      ok: false,
      text: status.code === "OLLAMA_NOT_INSTALLED" ? "Ollama is not installed" : "Ollama is not running",
      detail: status.message,
    });
  } else {
    lines.push({ ok: true, text: "Ollama Connected", detail: status.version ? `Version ${status.version}` : undefined });
    if (status.models.length === 0) {
      lines.push({ ok: false, text: "No models installed", detail: status.message });
    } else if (!model) {
      lines.push({ ok: true, text: `${status.models.length} ${status.models.length === 1 ? "model" : "models"} installed`, detail: "A suitable model is chosen automatically." });
    } else if (status.model === model && status.modelAvailable) {
      lines.push({ ok: true, text: "Model Available", detail: model });
    } else if (status.model === model) {
      lines.push({ ok: false, text: "Model not installed", detail: status.message });
    } else {
      lines.push({ ok: null, text: "Model changed", detail: "Press Test Connection to check it." });
    }
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {lines.map((line) => (
        <li key={line.text} className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white",
              line.ok === null ? "bg-slate-400" : line.ok ? "bg-emerald-500" : "bg-rose-500"
            )}
            aria-hidden
          >
            {line.ok === null ? null : line.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span className="sr-only">{line.ok === null ? "" : line.ok ? "OK: " : "Problem: "}</span>
              {line.text}
            </p>
            {line.detail && <p className="break-words text-xs text-[rgb(var(--muted))]">{line.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
