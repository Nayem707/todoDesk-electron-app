import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../utils/cn";

const ERROR_TITLES: Record<string, string> = {
  INVALID_URL: "Invalid URL",
  UNSUPPORTED_URL: "Unsupported address",
  UNREACHABLE: "Website unreachable",
  TIMEOUT: "Navigation timed out",
  SSL_ERROR: "Certificate problem",
  NO_FORMS: "No forms found",
  PAGE_LOAD_FAILED: "Page failed to load",
  BROWSER_UNAVAILABLE: "Browser not available",
  BROWSER_ERROR: "Browser error",
  AUTH_REQUIRED: "Sign-in required",
  CAPTCHA_DETECTED: "CAPTCHA detected",
  BLOCKED: "Access blocked",
  TOO_MANY_REDIRECTS: "Too many redirects",
  CANCELLED: "Analysis stopped",
  BUSY: "Analysis in progress",
};

const INFORMATIONAL_CODES = new Set(["NO_FORMS", "CANCELLED"]);

/** Short, user-facing title for a Web Analyze error code. */
export function errorTitle(code: string | null | undefined, overrides?: Record<string, string>) {
  if (!code) {
    return undefined;
  }
  return overrides?.[code] ?? ERROR_TITLES[code];
}

export function AnalysisErrorCard({
  error,
  fallbackTitle = "Analysis failed",
  titleOverrides,
  action,
}: {
  error: { code: string; message: string };
  fallbackTitle?: string;
  titleOverrides?: Record<string, string>;
  action?: ReactNode;
}) {
  const title = errorTitle(error.code, titleOverrides) ?? fallbackTitle;
  const informational = INFORMATIONAL_CODES.has(error.code);
  return (
    <section
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-5",
        informational
          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
          : "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40"
      )}
    >
      <AlertTriangle
        size={18}
        className={cn("mt-0.5 shrink-0", informational ? "text-[rgb(var(--muted))]" : "text-[rgb(var(--danger))]")}
      />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">{error.message}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </section>
  );
}
