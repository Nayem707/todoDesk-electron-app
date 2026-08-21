import { useEffect, useState, type ReactNode } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { windowService } from "../services/windowService";
import { cn } from "../utils/cn";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    windowService
      .isMaximized()
      .then((value) => {
        if (mounted) {
          setMaximized(value);
        }
      })
      .catch((error) => console.error("[window] isMaximized", error));
    const unsubscribe = windowService.onMaximizedChange(setMaximized);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <header className="titlebar-drag flex h-10 shrink-0 items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--sidebar))]">
      <div className="flex items-center gap-2 px-3">
        <AppMark />
        <span className="text-[13px] font-semibold tracking-wide text-[rgb(var(--text))]">
          TodoDesk
        </span>
      </div>
      <div className="titlebar-no-drag flex h-full">
        <WindowButton label="Minimize" onClick={() => windowService.minimize()}>
          <Minus size={14} />
        </WindowButton>
        <WindowButton
          label={maximized ? "Restore" : "Maximize"}
          onClick={() => windowService.maximize()}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </WindowButton>
        <WindowButton
          label="Close"
          danger
          onClick={() => windowService.close()}
        >
          <X size={14} />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  children,
  onClick,
  label,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-11 items-center justify-center text-[rgb(var(--muted))] transition-colors",
        danger
          ? "hover:bg-[rgb(var(--danger))] hover:text-white"
          : "hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

export function AppMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-[6px] bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]",
        className
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
        <path
          d="M3.2 8.3 6.1 11.1 12.8 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
