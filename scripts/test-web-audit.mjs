import http from "http";
import { runWebAudit, AUDIT_STEPS } from "../electron/webAudit/auditRunner.js";
import { scoreChecks, buildReport, CATEGORIES } from "../electron/webAudit/reportBuilder.js";
import { makeCheck } from "../electron/webAudit/checks.js";
import { safeFetch } from "../electron/webAnalyze/safeFetch.js";
import { strictUrlPolicy } from "../electron/webAnalyze/urlSafety.js";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const findCheck = (report, categoryId, checkId) =>
  report.categories.find((c) => c.id === categoryId)?.checks.find((c) => c.id === checkId);
const statusOf = (report, categoryId, checkId) => findCheck(report, categoryId, checkId)?.status ?? "(missing)";

console.log("\nScoring");
{
  const pass = makeCheck({ id: "a", title: "A", status: "pass", weight: 3, summary: "", why: "" });
  const warn = makeCheck({ id: "b", title: "B", status: "warning", weight: 1, summary: "", why: "" });
  const crit = makeCheck({ id: "c", title: "C", status: "critical", weight: 2, summary: "", why: "" });
  const info = makeCheck({ id: "d", title: "D", status: "info", weight: 3, summary: "", why: "" });
  check("all passing scores 100", scoreChecks([pass]) === 100);
  check("weighted: (3 + 0.5) / 6 = 58", scoreChecks([pass, warn, crit]) === 58, String(scoreChecks([pass, warn, crit])));
  check("info checks don't count", scoreChecks([pass, info]) === 100);
  check("nothing scored → null", scoreChecks([info]) === null);
  check("passing checks drop their fix text", pass.fix === null);
  const report = buildReport({
    url: "https://x.test/",
    finalUrl: "https://x.test/",
    title: "X",
    durationMs: 1,
    results: { seo: { checks: [pass, crit] }, links: { checks: [], error: "Links couldn't be checked." } },
    metrics: {},
    notes: [],
  });
  check("report has all 7 categories", report.categories.length === CATEGORIES.length && CATEGORIES.length === 7);
  check("missing/errored categories are incomplete → partial", report.partial && report.categories.find((c) => c.id === "links").incomplete);
  check("overall ignores unscored categories", report.overallScore === scoreChecks([pass, crit]));
  check("top issues list the critical check first", report.topIssues[0]?.checkId === "c");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const GOOD_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme Widgets — Handmade widgets</title>
  <meta name="description" content="Acme makes handmade widgets in small batches. Browse the catalog, read care guides and order online.">
  <link rel="canonical" href="/good">
  <link rel="icon" href="/img/ok.png">
  <meta property="og:title" content="Acme Widgets">
  <meta property="og:description" content="Handmade widgets">
  <meta property="og:image" content="/img/ok.png">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head>
<body>
  <main>
    <h1>Handmade widgets</h1>
    <h2>Catalog</h2>
    <img src="/img/ok.png" alt="A blue widget" width="40" height="40">
    <p style="color:#111;background:#fff">Plenty of contrast here.</p>
    <a href="/about">About Acme</a>
    <a href="/redirect">Our story</a>
    <form action="/search" method="get"><label for="q">Search</label><input id="q" name="q"></form>
  </main>
</body>
</html>`;

const BAD_PAGE = `<html>
<head>
  <meta name="viewport" content="width=device-width, user-scalable=no">
  <meta name="robots" content="noindex">
  <script src="/blocking.js"></script>
</head>
<body style="background:#ffffff">
  <center>Old school</center>
  <div id="dup">one</div><div id="dup">two</div>
  <h2>Section</h2>
  <h4>Skipped level</h4>
  <img src="/missing.png" width="50" height="50">
  <input type="text" placeholder="Your name">
  <button><svg width="10" height="10"></svg></button>
  <p style="color:#bbbbbb">This light grey text is hard to read on white.</p>
  <a href="/missing">click here</a>
  <a href="#">Nothing</a>
  <a href="/forbidden">Members</a>
  <a href="/slow-link">Slow page</a>
  <a href="/to-private">Intranet</a>
  <a href="https://nonexistent-domain.invalid/page">Gone</a>
  <span tabindex="3">Focus me first</span>
  <script>console.error("oops from fixture"); throw new Error("boom from fixture");</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const securityHeaders = {
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
  };
  switch (path) {
    case "/good":
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...securityHeaders });
      return res.end(GOOD_PAGE);
    case "/bad":
      res.writeHead(200, { "content-type": "text/html", server: "Apache/2.4.1 (Unix)", "x-powered-by": "PHP/7.1.2" });
      return res.end(BAD_PAGE);
    case "/img/ok.png":
      res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" });
      return res.end(PNG);
    case "/blocking.js":
      res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" });
      return res.end("window.__blocking = true;");
    case "/about":
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<!DOCTYPE html><title>About</title>");
    case "/redirect":
      res.writeHead(301, { location: "/about" });
      return res.end();
    case "/forbidden":
      res.writeHead(403, { "content-type": "text/html" });
      return res.end("no bots");
    case "/to-private":
      res.writeHead(302, { location: "http://10.0.0.1/admin" });
      return res.end();
    case "/slow-link":
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 4000);
      return;
    case "/robots.txt":
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end(`User-agent: *\nDisallow:\nSitemap: http://127.0.0.1:${server.address().port}/sitemap.xml\n`);
    case "/sitemap.xml":
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end("<urlset></urlset>");
    case "/401":
      res.writeHead(401, { "content-type": "text/html" });
      return res.end("sign in");
    case "/hang":
      return;
    default:
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const testPolicy = {
  parse: (input) => new URL(input),
  assertHostAllowed: async (hostname) => {
    if (hostname !== "127.0.0.1") {
      await strictUrlPolicy.assertHostAllowed(hostname);
    }
  },
};
const fast = { navigationTimeoutMs: 6000, settleTimeoutMs: 3000, browserTimeoutMs: 30000 };
const linkLimits = { timeoutMs: 1500, budgetMs: 10000 };

try {
  console.log("\nsafeFetch");
  {
    const ok = await safeFetch(`${base}/redirect`, { urlPolicy: testPolicy });
    check("follows safe redirects", ok.status === 200 && ok.redirects.length === 1, JSON.stringify(ok));
    const blocked = await safeFetch(`${base}/to-private`, { urlPolicy: testPolicy });
    check("refuses a redirect to a private address", blocked.status === null && blocked.error === "blocked", JSON.stringify(blocked));
    const direct = await safeFetch("http://192.168.1.1/", { urlPolicy: strictUrlPolicy });
    check("refuses private addresses outright", direct.error === "blocked");
    const timeout = await safeFetch(`${base}/hang`, { urlPolicy: testPolicy, timeoutMs: 500 });
    check("times out", timeout.error === "timeout");
    const manual = await safeFetch(`${base}/redirect`, { urlPolicy: testPolicy, followRedirects: false });
    check("can report a redirect without following it", manual.status === 301 && manual.headers.location === "/about");
    const scheme = await safeFetch("file:///C:/Windows/win.ini", { urlPolicy: testPolicy });
    check("rejects non-http schemes", scheme.error === "unsupported");
  }

  console.log("\nAudit of a well-built page");
  const steps = [];
  const good = await runWebAudit(`${base}/good`, {
    urlPolicy: testPolicy,
    timeouts: fast,
    linkLimits,
    onProgress: (step) => steps.push(step),
  });
  check("reports every progress step in order", steps.join(",") === AUDIT_STEPS.join(","), steps.join(","));
  check("7 categories", good.categories.length === 7);
  check("scores within 0–100", good.categories.every((c) => c.score === null || (c.score >= 0 && c.score <= 100)));
  check("title passes", statusOf(good, "seo", "seo-title") === "pass");
  check("description passes", statusOf(good, "seo", "seo-description") === "pass");
  check("canonical passes", statusOf(good, "seo", "seo-canonical") === "pass");
  check("robots.txt found", statusOf(good, "seo", "seo-robots-txt") === "pass");
  check("sitemap found via robots.txt", statusOf(good, "seo", "seo-sitemap") === "pass");
  check("structured data read", statusOf(good, "seo", "seo-structured-data") === "pass");
  check("alt text passes", statusOf(good, "accessibility", "a11y-image-alt") === "pass");
  check("labels pass", statusOf(good, "accessibility", "a11y-form-labels") === "pass");
  check("contrast passes", statusOf(good, "accessibility", "a11y-contrast") === "pass");
  check("CSP detected", statusOf(good, "security", "sec-csp") === "pass");
  check("frame-ancestors counts as clickjacking protection", statusOf(good, "security", "sec-clickjacking") === "pass");
  check("plain HTTP flagged critical", statusOf(good, "security", "sec-https") === "critical");
  check("no broken links", statusOf(good, "links", "links-broken") === "pass");
  check("redirecting internal link noted", statusOf(good, "links", "links-redirects") === "info");
  check("image loads", statusOf(good, "images", "img-broken") === "pass");
  check("doctype passes", statusOf(good, "html", "html-doctype") === "pass");
  check("no JS errors", statusOf(good, "html", "html-js-errors") === "pass", JSON.stringify(findCheck(good, "html", "html-js-errors")?.items));
  check("performance measured", good.metrics.fcpMs !== null && good.metrics.requestCount >= 2, JSON.stringify(good.metrics));
  check("SEO score high", good.categories.find((c) => c.id === "seo").score >= 90);
  check("not partial", good.partial === false, JSON.stringify(good.categories.filter((c) => c.incomplete).map((c) => c.note)));

  console.log("\nAudit of a page with many problems");
  const bad = await runWebAudit(`${base}/bad`, { urlPolicy: testPolicy, timeouts: fast, linkLimits });
  check("missing title critical", statusOf(bad, "seo", "seo-title") === "critical");
  check("missing description", statusOf(bad, "seo", "seo-description") === "warning");
  check("noindex critical", statusOf(bad, "seo", "seo-indexable") === "critical");
  check("vague link text", statusOf(bad, "seo", "seo-link-text") === "warning");
  check("image without alt", statusOf(bad, "accessibility", "a11y-image-alt") === "critical");
  check("unlabeled input", statusOf(bad, "accessibility", "a11y-form-labels") === "critical");
  check("unnamed button", statusOf(bad, "accessibility", "a11y-button-names") === "critical");
  check("missing lang", statusOf(bad, "accessibility", "a11y-lang") === "warning");
  check("zoom blocked", statusOf(bad, "accessibility", "a11y-zoom") === "critical");
  check("positive tabindex", statusOf(bad, "accessibility", "a11y-tabindex") === "warning");
  check("skipped heading level", statusOf(bad, "accessibility", "a11y-headings") === "warning");
  const contrast = findCheck(bad, "accessibility", "a11y-contrast");
  check("low contrast found", contrast?.status === "warning" && contrast.items.some((i) => i.label.includes("light grey")), JSON.stringify(contrast?.items));
  check("no doctype", statusOf(bad, "html", "html-doctype") === "warning");
  check("duplicate ids", statusOf(bad, "html", "html-duplicate-ids") === "warning");
  check("deprecated <center>", statusOf(bad, "html", "html-deprecated") === "warning");
  const jsErrors = findCheck(bad, "html", "html-js-errors");
  check("uncaught error critical + console error listed", jsErrors?.status === "critical" && jsErrors.items.length === 2, JSON.stringify(jsErrors?.items));
  check("render-blocking script", statusOf(bad, "performance", "perf-render-blocking") === "warning");
  check("uncacheable asset", statusOf(bad, "performance", "perf-caching") === "warning");
  check("version disclosure", statusOf(bad, "security", "sec-version-disclosure") === "warning");
  check("missing CSP", statusOf(bad, "security", "sec-csp") === "warning");
  check("broken image", statusOf(bad, "images", "img-broken") === "critical");
  const broken = findCheck(bad, "links", "links-broken");
  const brokenUrls = broken?.items.map((i) => i.label) ?? [];
  check("404 link broken", brokenUrls.includes(`${base}/missing`), brokenUrls.join(" | "));
  check("nonexistent domain broken", brokenUrls.some((u) => u.includes("nonexistent-domain.invalid")), brokenUrls.join(" | "));
  const unverified = findCheck(bad, "links", "links-unverified")?.items.map((i) => i.label) ?? [];
  check("403 link unverified, not broken", unverified.includes(`${base}/forbidden`) && !brokenUrls.includes(`${base}/forbidden`));
  check("slow link unverified (timeout)", unverified.includes(`${base}/slow-link`), unverified.join(" | "));
  check("private redirect not followed, unverified", unverified.includes(`${base}/to-private`), unverified.join(" | "));
  check("empty href flagged", statusOf(bad, "links", "links-empty") === "warning");
  const goodOverall = good.overallScore;
  check("bad page scores lower overall", bad.overallScore < goodOverall, `${bad.overallScore} vs ${goodOverall}`);
  check("top issues are critical first", bad.topIssues.length > 0 && bad.topIssues[0].status === "critical");

  console.log("\nErrors and cancellation");
  for (const [name, input, code] of [
    ["404 page", `${base}/nope`, "PAGE_LOAD_FAILED"],
    ["401 page", `${base}/401`, "AUTH_REQUIRED"],
  ]) {
    try {
      await runWebAudit(input, { urlPolicy: testPolicy, timeouts: fast, linkLimits });
      check(name, false, "no error thrown");
    } catch (error) {
      check(`${name} → ${code}`, error.code === code, `${error.code}: ${error.message}`);
    }
  }
  for (const [name, input, code] of [
    ["file:// rejected", "file:///C:/Windows/win.ini", "UNSUPPORTED_URL"],
    ["localhost rejected", "http://localhost:3000", "UNSUPPORTED_URL"],
    ["private IP rejected", "http://192.168.0.10/", "UNSUPPORTED_URL"],
    ["garbage rejected", "http://exa mple", "INVALID_URL"],
  ]) {
    try {
      await runWebAudit(input);
      check(name, false, "no error thrown");
    } catch (error) {
      check(name, error.code === code, `${error.code}: ${error.message}`);
    }
  }
  {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 1500);
    try {
      await runWebAudit(`${base}/hang`, { urlPolicy: testPolicy, timeouts: { ...fast, navigationTimeoutMs: 20000 }, signal: controller.signal });
      check("cancel", false, "no error thrown");
    } catch (error) {
      check("cancel stops a hanging audit quickly", error.code === "CANCELLED" && Date.now() - started < 8000, `${error.code} after ${Date.now() - started}ms`);
    }
  }
  {
    try {
      await runWebAudit(`${base}/hang`, { urlPolicy: testPolicy, timeouts: { navigationTimeoutMs: 1500, settleTimeoutMs: 1000, browserTimeoutMs: 20000 } });
      check("timeout", false, "no error thrown");
    } catch (error) {
      check("navigation timeout → TIMEOUT", error.code === "TIMEOUT", `${error.code}: ${error.message}`);
    }
  }

  if (process.argv.includes("--online")) {
    console.log("\nOnline");
    const report = await runWebAudit("https://example.com");
    check("example.com audited", report.categories.length === 7 && report.overallScore !== null, `score ${report.overallScore}`);
    check("example.com HTTPS", statusOf(report, "security", "sec-https") === "pass");
    console.log(`       overall ${report.overallScore}; ${report.categories.map((c) => `${c.id}:${c.score}`).join(" ")}`);
  }
} finally {
  server.close();
}

console.log(failures ? `\n${failures} web audit check(s) FAILED` : "\nAll web audit checks passed");
process.exit(failures ? 1 : 0);
