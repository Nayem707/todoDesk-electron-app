import type { MouseEvent } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../utils/cn";

interface CopyButtonProps {
  value: string;
  /** Accessible name and tooltip, e.g. "Copy IP address". */
  label: string;
  showText?: boolean;
  className?: string;
}

/** Small copy-to-clipboard button using the app's clipboard + toast pattern. */
export function CopyButton({ value, label, showText = false, className }: CopyButtonProps) {
  const copy = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => void copy(event)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md p-1 text-[rgb(var(--muted))] transition hover:bg-black/5 hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] dark:hover:bg-white/10",
        showText && "px-2 text-xs font-medium",
        className
      )}
    >
      <Copy size={13} />
      {showText && "Copy"}
    </button>
  );
}
