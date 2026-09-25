export const CATEGORIES = [
  { id: "seo", label: "SEO", description: "How well search engines can find, understand and present this page." },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Whether people using screen readers, keyboards or with low vision can use the page.",
  },
  {
    id: "performance",
    label: "Performance",
    description: "How quickly the page loads and settles, measured once from this computer. Results vary between runs.",
  },
  { id: "security", label: "Security", description: "HTTPS, security headers, cookies and content that could put visitors at risk." },
  { id: "html", label: "HTML / Technical", description: "Document structure, markup quality and errors in the page's code." },
  { id: "links", label: "Links", description: "Whether links on the page work and point somewhere safe and meaningful." },
  { id: "images", label: "Images", description: "Broken, oversized or unoptimized images that hurt loading and layout." },
];

const CREDIT = { pass: 1, warning: 0.5, critical: 0 };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, pass: 3 };
const TOP_ISSUES = 5;

/** Weighted pass rate: warnings earn half credit, info checks don't count. Null when nothing is scored. */
export function scoreChecks(checks) {
  const scored = checks.filter((check) => check.status in CREDIT);
  if (!scored.length) {
    return null;
  }
  const total = scored.reduce((sum, check) => sum + check.weight, 0);
  const earned = scored.reduce((sum, check) => sum + check.weight * CREDIT[check.status], 0);
  return Math.round((earned / total) * 100);
}

function bySeverity(a, b) {
  return SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] || b.weight - a.weight;
}

function countChecks(checks) {
  return {
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warning").length,
    critical: checks.filter((c) => c.status === "critical").length,
    info: checks.filter((c) => c.status === "info").length,
  };
}

/**
 * @param {{ url: string, finalUrl: string, title: string, durationMs: number,
 *   results: Record<string, { checks: any[], error?: string | null }>, metrics: object, notes: string[] }} input
 */
export function buildReport({ url, finalUrl, title, durationMs, results, metrics, notes }) {
  const categories = CATEGORIES.map((definition) => {
    const result = results[definition.id] ?? { checks: [], error: "This category wasn't checked." };
    const checks = [...result.checks].sort(bySeverity);
    return {
      ...definition,
      score: scoreChecks(checks),
      counts: countChecks(checks),
      checks,
      incomplete: Boolean(result.error),
      note: result.error ?? null,
    };
  });

  const scores = categories.map((category) => category.score).filter((score) => score !== null);
  const overallScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const allChecks = categories.flatMap((category) => category.checks.map((check) => ({ ...check, categoryId: category.id })));

  return {
    url,
    finalUrl,
    title,
    durationMs,
    overallScore,
    totals: countChecks(allChecks),
    categories,
    topIssues: allChecks
      .filter((check) => check.status === "critical" || check.status === "warning")
      .sort(bySeverity)
      .slice(0, TOP_ISSUES)
      .map(({ categoryId, id, title: checkTitle, status, summary }) => ({ categoryId, checkId: id, title: checkTitle, status, summary })),
    metrics,
    partial: categories.some((category) => category.incomplete),
    notes,
  };
}
