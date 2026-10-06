import { Cpu, Loader2 } from "lucide-react";
import type { QuizAiConfig, QuizAiStatus } from "../../types/quiz";
import { cn } from "../../utils/cn";

/** Compact "model · connected" indicator; clicking it opens AI Settings. */
export function AiStatusBadge({
  config,
  status,
  checking,
  onClick,
}: {
  config: QuizAiConfig | null;
  status: QuizAiStatus | null;
  checking: boolean;
  onClick: () => void;
}) {
  const ready = Boolean(status?.connected && (status.modelAvailable || (!config?.model && status.models.length > 0)));
  let label = "Checking Ollama…";
  if (!checking && status) {
    if (!status.connected) {
      label = "Ollama offline";
    } else if (!config?.model) {
      label = status.models.length ? "Model: automatic" : "No models installed";
    } else {
      label = status.modelAvailable ? config.model : `${config.model} missing`;
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={status?.message || "Open AI Settings"}
      className="inline-flex max-w-[16rem] items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
    >
      {checking ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", ready ? "bg-emerald-500" : "bg-rose-500")} aria-hidden />
      )}
      <Cpu size={12} className="shrink-0 text-[rgb(var(--muted))]" />
      <span className="truncate">{label}</span>
    </button>
  );
}
