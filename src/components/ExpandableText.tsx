import { useEffect, useRef, useState } from "react";
import { cn } from "../utils/cn";

interface ExpandableTextProps {
  text: string;
  lines?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

/**
 * Shows up to `lines` (default 2). If the text overflows, offers Load More / Show Less.
 */
export function ExpandableText({
  text,
  lines = 2,
  className,
  expandLabel = "Load More",
  collapseLabel = "Show Less",
}: ExpandableTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const node = ref.current;
    if (!node || expanded) {
      return;
    }

    const measure = () => {
      setOverflows(node.scrollHeight > node.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, lines, expanded]);

  if (!text) {
    return null;
  }

  return (
    <div className={cn("mt-1", className)}>
      <p
        ref={ref}
        className={cn(
          "text-sm text-[rgb(var(--muted))] whitespace-pre-wrap break-words",
          !expanded && "overflow-hidden"
        )}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
              }
        }
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          className="mt-1 text-xs font-medium text-[rgb(var(--accent))] hover:underline"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}
