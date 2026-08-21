import { useEffect } from "react";

interface Options {
  onNew?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts({ onNew, onSearch, onEscape }: Options) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        onEscape?.();
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        return;
      }

      if (event.key.toLowerCase() === "n" && !typing) {
        event.preventDefault();
        onNew?.();
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        onSearch?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNew, onSearch, onEscape]);
}
