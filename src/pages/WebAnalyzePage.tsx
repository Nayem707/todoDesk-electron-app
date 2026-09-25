import { useState } from "react";
import { Gauge, ScanSearch } from "lucide-react";
import { cn } from "../utils/cn";
import { FormAssistantPage } from "./FormAssistantPage";
import { WebAuditPage } from "./WebAuditPage";

type WebAnalyzeTool = "formAssistant" | "webAudit";

const TOOLS: { id: WebAnalyzeTool; label: string; icon: typeof Gauge; description: string }[] = [
  {
    id: "formAssistant",
    label: "Form Assistant",
    icon: ScanSearch,
    description: "Detect the form fields on a website and see what each one asks for.",
  },
  {
    id: "webAudit",
    label: "Web Audit",
    icon: Gauge,
    description: "Check a page's SEO, accessibility, performance, security, HTML, links and images.",
  },
];

/** Remembered across navigation so returning to Web Analyze reopens the last tool. */
let lastTool: WebAnalyzeTool = "formAssistant";

export function WebAnalyzePage() {
  const [tool, setToolState] = useState<WebAnalyzeTool>(lastTool);
  const active = TOOLS.find((item) => item.id === tool);

  const setTool = (next: WebAnalyzeTool) => {
    lastTool = next;
    setToolState(next);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Web Analyze</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">{active?.description}</p>
        </div>
        <div
          role="group"
          aria-label="Web Analyze tool"
          className="flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5"
        >
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const selected = item.id === tool;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setTool(item.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
                  selected
                    ? "bg-[rgb(var(--accent))] font-medium text-[rgb(var(--accent-foreground))]"
                    : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                )}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {tool === "formAssistant" ? <FormAssistantPage /> : <WebAuditPage />}
    </div>
  );
}
