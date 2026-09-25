import { counted, makeCheck, plural } from "../checks.js";

const REASON_TEXT = {
  dns: "domain not found",
  timeout: "timed out",
  network: "connection failed",
  blocked: "points to a local or private address (not checked)",
  redirects: "too many redirects",
  unsupported: "unsupported address",
  cancelled: "not checked",
};

function describeResult(result) {
  if (result.status) {
    return `HTTP ${result.status}`;
  }
  return REASON_TEXT[result.error] ?? "not reachable";
}

/**
 * @param {{ facts: any, linkResults: import('../linkChecker.js').LinkCheckResult }} ctx
 */
export function analyzeLinks({ facts, linkResults }) {
  const checks = [];
  const { results, internalCount, externalCount, skippedCount } = linkResults;
  const broken = results.filter((r) => r.outcome === "broken");
  const unverified = results.filter((r) => r.outcome === "unverified");
  const redirected = results.filter((r) => r.outcome === "ok" && r.redirected && r.internal);

  checks.push(
    makeCheck({
      id: "links-broken",
      title: "Broken links",
      status: broken.length ? "critical" : results.length ? "pass" : "info",
      weight: 3,
      summary: broken.length
        ? `${counted(broken.length, "link leads", "links lead")} to missing or failing pages.`
        : results.length
          ? `${counted(results.length - unverified.length, "checked link works", "checked links work")}.`
          : "The page has no links to check.",
      why: "Broken links frustrate visitors and signal a poorly maintained site to search engines.",
      fix: "Update or remove the listed links.",
      items: broken.map((r) => ({ label: r.url, detail: `${describeResult(r)} · ${r.internal ? "internal" : "external"}` })),
      technical: `Checked ${results.length} of ${internalCount + externalCount} unique links (${internalCount} internal, ${externalCount} external)${skippedCount ? `; ${skippedCount} not checked because of limits` : ""}.`,
    })
  );

  if (unverified.length) {
    checks.push(
      makeCheck({
        id: "links-unverified",
        title: "Links that couldn't be verified",
        status: "info",
        weight: 1,
        summary: `${plural(unverified.length, "link")} couldn't be verified automatically. Some sites block automated checks, so these may still work.`,
        why: "These links didn't answer normally to an automated check. Open them in your browser to confirm.",
        fix: null,
        items: unverified.map((r) => ({ label: r.url, detail: describeResult(r) })),
      })
    );
  }

  if (redirected.length) {
    checks.push(
      makeCheck({
        id: "links-redirects",
        title: "Internal links that redirect",
        status: "info",
        weight: 1,
        summary: `${counted(redirected.length, "internal link goes", "internal links go")} through a redirect first.`,
        why: "Each redirect adds a delay. Linking straight to the final address is faster.",
        fix: "Point these links directly at their final URL.",
        items: redirected.map((r) => ({ label: r.url, detail: `→ ${r.finalUrl}` })),
      })
    );
  }

  const empty = facts.links.filter(
    (link) => link.visible && (link.raw === null || link.raw === "" || link.raw === "#" || /^javascript:/i.test(link.raw))
  );
  checks.push(
    makeCheck({
      id: "links-empty",
      title: "Links without a destination",
      status: empty.length ? "warning" : "pass",
      weight: 1,
      summary: empty.length
        ? `${counted(empty.length, "link has", "links have")} no real destination (empty, “#” or javascript:).`
        : "Every visible link has a real destination.",
      why: "These links don't work without JavaScript, can't be opened in a new tab, and confuse screen readers.",
      fix: "Use a real URL for navigation, or a <button> for actions.",
      items: empty.map((link) => ({ label: link.text || link.selector, detail: link.raw === null ? "no href" : `href="${link.raw}"` })),
    })
  );

  if (facts.protocol === "https:") {
    const insecure = facts.links.filter((link) => link.href?.startsWith("http:"));
    checks.push(
      makeCheck({
        id: "links-insecure",
        title: "Links to insecure pages",
        status: insecure.length ? "warning" : "pass",
        weight: 1,
        summary: insecure.length
          ? `${counted(insecure.length, "link points", "links point")} to insecure http:// addresses.`
          : "Links point to secure https:// addresses.",
        why: "Sending visitors to insecure pages exposes them to tampering and browser warnings.",
        fix: "Switch these links to https:// where the destination supports it.",
        items: insecure.map((link) => ({ label: link.href, detail: link.text })),
      })
    );
  }

  return checks;
}
