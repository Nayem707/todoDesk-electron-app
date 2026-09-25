export type AuditCategoryId =
  | "seo"
  | "accessibility"
  | "performance"
  | "security"
  | "html"
  | "links"
  | "images";

export type AuditCheckStatus = "pass" | "warning" | "critical" | "info";

export interface AuditCheckItem {
  label: string;
  detail?: string;
}

export interface AuditCheck {
  id: string;
  title: string;
  status: AuditCheckStatus;
  weight: number;
  summary: string;
  why: string;
  fix: string | null;
  items: AuditCheckItem[];
  totalItems: number;
  technical: string | null;
}

export interface AuditCounts {
  passed: number;
  warnings: number;
  critical: number;
  info: number;
}

export interface AuditCategory {
  id: AuditCategoryId;
  label: string;
  description: string;
  score: number | null;
  counts: AuditCounts;
  checks: AuditCheck[];
  incomplete: boolean;
  note: string | null;
}

export interface AuditTopIssue {
  categoryId: AuditCategoryId;
  checkId: string;
  title: string;
  status: AuditCheckStatus;
  summary: string;
}

export interface AuditMetrics {
  httpStatus: number | null;
  redirectCount: number;
  ttfbMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  loadMs: number | null;
  totalBytes: number | null;
  requestCount: number | null;
  domNodes: number;
  linkCount: number;
  imageCount: number;
}

export interface AuditReport {
  url: string;
  finalUrl: string;
  title: string;
  durationMs: number;
  overallScore: number | null;
  totals: AuditCounts;
  categories: AuditCategory[];
  topIssues: AuditTopIssue[];
  metrics: AuditMetrics;
  partial: boolean;
  notes: string[];
}

export interface WebAuditSummary {
  id: string;
  url: string;
  finalUrl: string | null;
  title: string;
  status: "completed" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  overallScore: number | null;
  criticalCount: number;
  warningCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebAudit extends WebAuditSummary {
  report: AuditReport | null;
  durationMs: number | null;
}

export type WebAuditErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "SSL_ERROR"
  | "PAGE_LOAD_FAILED"
  | "BROWSER_UNAVAILABLE"
  | "BROWSER_ERROR"
  | "AUTH_REQUIRED"
  | "CAPTCHA_DETECTED"
  | "BLOCKED"
  | "TOO_MANY_REDIRECTS"
  | "CANCELLED"
  | "BUSY";

export interface WebAuditError {
  code: WebAuditErrorCode | string;
  message: string;
}

export interface WebAuditResult {
  audit: WebAudit | null;
  error: WebAuditError | null;
}

export type WebAuditStep =
  | "loading"
  | "inspecting"
  | "metadata"
  | "links"
  | "images"
  | "accessibility"
  | "performance"
  | "recommendations";

export interface WebAuditProgressEvent {
  requestId: string;
  step: WebAuditStep;
}
