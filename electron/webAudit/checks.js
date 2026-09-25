const MAX_ITEMS = 25;

/**
 * Builds one audit check.
 *
 * `status`: pass | warning | critical | info (info is shown but never affects the score).
 * `weight`: 1–3, how much the check counts toward its category score.
 * `summary` is what was found; `why` and `fix` are plain-language explanations; `items` and
 * `technical` hold the affected elements/values for the technical-details view.
 *
 * @param {{ id: string, title: string, status: 'pass' | 'warning' | 'critical' | 'info',
 *   weight?: number, summary: string, why: string, fix?: string | null,
 *   items?: { label: string, detail?: string }[], technical?: string | null }} input
 */
export function makeCheck({ id, title, status, weight = 1, summary, why, fix = null, items = [], technical = null }) {
  return {
    id,
    title,
    status,
    weight,
    summary,
    why,
    fix: status === "pass" ? null : fix,
    items: items.slice(0, MAX_ITEMS),
    totalItems: items.length,
    technical,
  };
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Count plus a phrase whose verb agrees with it, e.g. counted(1, "image has", "images have"). */
export function counted(count, singularPhrase, pluralPhrase) {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

export function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Same site if the hostnames match ignoring a leading "www.". */
export function sameSite(a, b) {
  const strip = (host) => host.toLowerCase().replace(/^www\./, "");
  try {
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}
