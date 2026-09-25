import { counted, formatBytes, formatMs, makeCheck, plural, sameSite } from "../checks.js";

const TEXT_TYPES = /text\/(html|css|javascript|plain|xml)|application\/(javascript|x-javascript|json|xml)|image\/svg\+xml/i;
const CACHEABLE_TYPES = new Set(["script", "stylesheet", "image", "font"]);
const MIN_CACHE_SECONDS = 3600;

function thresholdStatus(value, good, poor) {
  if (value <= good) {
    return "pass";
  }
  return value <= poor ? "warning" : "critical";
}

function metricCheck({ id, title, value, good, poor, weight, format, why, fix, label }) {
  if (value === null || value === undefined) {
    return makeCheck({
      id,
      title,
      status: "info",
      weight,
      summary: `${label} couldn't be measured on this page.`,
      why,
    });
  }
  const status = thresholdStatus(value, good, poor);
  const verdict = status === "pass" ? "good" : status === "warning" ? "needs improvement" : "poor";
  return makeCheck({
    id,
    title,
    status,
    weight,
    summary: `${label}: ${format(value)}, ${verdict} (target: under ${format(good)}).`,
    why,
    fix,
  });
}

/** Resource sizes from Resource Timing, falling back to Content-Length for cross-origin files. */
export function estimatePageWeight(perf, responses) {
  const lengths = new Map();
  for (const response of responses) {
    const length = Number(response.headers["content-length"]);
    if (Number.isFinite(length) && length > 0) {
      lengths.set(response.url, length);
    }
  }
  const resources = perf.resources.map((resource) => ({
    ...resource,
    bytes: resource.bytes || lengths.get(resource.url) || 0,
  }));
  const totalBytes = resources.reduce((sum, resource) => sum + resource.bytes, perf.documentBytes);
  return { resources, totalBytes };
}

/**
 * @param {{ facts: any, perf: any, responses: any[], navigation: any }} ctx
 */
export function analyzePerformance({ facts, perf, responses, navigation }) {
  const checks = [];
  const { resources, totalBytes } = estimatePageWeight(perf, responses);

  checks.push(
    metricCheck({
      id: "perf-ttfb",
      title: "Server response time",
      label: "Time to first byte",
      value: perf.ttfbMs,
      good: 800,
      poor: 1800,
      weight: 2,
      format: formatMs,
      why: "This is how long the server takes to start sending the page. Everything else waits for it.",
      fix: "Use server-side caching, a CDN, or faster hosting, and avoid slow database work on page load.",
    })
  );
  checks.push(
    metricCheck({
      id: "perf-fcp",
      title: "First content shown",
      label: "First Contentful Paint",
      value: perf.fcpMs,
      good: 1800,
      poor: 3000,
      weight: 2,
      format: formatMs,
      why: "This is when visitors first see something on screen. Until then the page looks blank.",
      fix: "Reduce render-blocking CSS and JavaScript and make the server respond faster.",
    })
  );
  checks.push(
    metricCheck({
      id: "perf-lcp",
      title: "Main content loaded",
      label: "Largest Contentful Paint",
      value: perf.lcpMs,
      good: 2500,
      poor: 4000,
      weight: 3,
      format: formatMs,
      why: "This is when the biggest visible element (usually a hero image or headline) appears. It's a Core Web Vital Google uses for ranking.",
      fix: "Optimize and preload the hero image, reduce blocking scripts, and serve images in modern formats.",
    })
  );
  checks.push(
    metricCheck({
      id: "perf-cls",
      title: "Layout stability",
      label: "Cumulative Layout Shift",
      value: perf.cls,
      good: 0.1,
      poor: 0.25,
      weight: 2,
      format: (value) => value.toFixed(2),
      why: "Content that jumps around while loading makes people click the wrong thing. It's a Core Web Vital.",
      fix: "Set width and height on images and embeds, and reserve space for ads and banners.",
    })
  );

  const heaviest = [...resources].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  checks.push(
    makeCheck({
      id: "perf-page-weight",
      title: "Page size",
      status: thresholdStatus(totalBytes, 2 * 1024 * 1024, 5 * 1024 * 1024),
      weight: 2,
      summary: `The page downloaded about ${formatBytes(totalBytes)}.`,
      why: "Large pages load slowly on mobile networks and cost visitors data.",
      fix: "Compress images, remove unused JavaScript and CSS, and lazy-load content below the fold.",
      items: heaviest.filter((r) => r.bytes > 0).map((r) => ({ label: formatBytes(r.bytes), detail: `${r.type} · ${r.url}` })),
      technical: "Sizes come from the browser's resource timing. Some third-party files don't report their size, so the total may be an underestimate.",
    })
  );

  const requestCount = perf.resourceCount + 1;
  checks.push(
    makeCheck({
      id: "perf-requests",
      title: "Number of requests",
      status: thresholdStatus(requestCount, 80, 150),
      weight: 1,
      summary: `The page made ${requestCount} network requests.`,
      why: "Every request adds overhead. Many small files, trackers and widgets slow the page down.",
      fix: "Bundle files, remove unused third-party scripts, and lazy-load widgets.",
    })
  );

  checks.push(
    makeCheck({
      id: "perf-dom-size",
      title: "Page complexity",
      status: thresholdStatus(facts.domNodes, 1500, 3000),
      weight: 1,
      summary: `The page has ${facts.domNodes.toLocaleString("en-US")} HTML elements.`,
      why: "Very large pages use more memory and make scrolling and interactions sluggish, especially on phones.",
      fix: "Simplify the markup and render long lists or hidden sections only when needed.",
    })
  );

  checks.push(
    makeCheck({
      id: "perf-render-blocking",
      title: "Render-blocking scripts",
      status: facts.renderBlockingScripts.length ? "warning" : "pass",
      weight: 1,
      summary: facts.renderBlockingScripts.length
        ? `${counted(facts.renderBlockingScripts.length, "script in the page head blocks", "scripts in the page head block")} the page from showing.`
        : "No scripts block the page from showing.",
      why: "The browser stops drawing the page until these scripts download and run.",
      fix: "Add defer or async to scripts in <head>, or move them to the end of the page.",
      items: facts.renderBlockingScripts.map((src) => ({ label: src })),
    })
  );

  const uncompressed = responses.filter((response) => {
    const size = Number(response.headers["content-length"]) || resources.find((r) => r.url === response.url)?.bytes || 0;
    return (
      response.status === 200 &&
      size > 1024 &&
      TEXT_TYPES.test(response.headers["content-type"] ?? "") &&
      !response.headers["content-encoding"]
    );
  });
  checks.push(
    makeCheck({
      id: "perf-compression",
      title: "Text compression",
      status: uncompressed.length ? "warning" : "pass",
      weight: 1,
      summary: uncompressed.length
        ? `${counted(uncompressed.length, "text file was", "text files were")} sent without compression.`
        : "Text files are compressed.",
      why: "Gzip or Brotli compression typically shrinks HTML, CSS and JavaScript by 60–80%.",
      fix: "Enable gzip or Brotli compression on the web server or CDN.",
      items: uncompressed.map((response) => ({ label: response.url, detail: response.headers["content-type"] })),
    })
  );

  const poorlyCached = responses.filter((response) => {
    if (response.status !== 200 || !CACHEABLE_TYPES.has(response.type) || !sameSite(response.url, navigation.finalUrl)) {
      return false;
    }
    const cacheControl = response.headers["cache-control"] ?? "";
    if (/no-store|no-cache/i.test(cacheControl)) {
      return true;
    }
    const maxAge = /max-age=(\d+)/i.exec(cacheControl);
    if (maxAge) {
      return Number(maxAge[1]) < MIN_CACHE_SECONDS;
    }
    return !response.headers.expires;
  });
  checks.push(
    makeCheck({
      id: "perf-caching",
      title: "Browser caching",
      status: poorlyCached.length ? "warning" : "pass",
      weight: 1,
      summary: poorlyCached.length
        ? `${plural(poorlyCached.length, "file")} from this site can't be cached by browsers for long.`
        : "Static files from this site are cacheable.",
      why: "With caching, returning visitors don't have to download the same images, styles and scripts again.",
      fix: "Serve static files with a long Cache-Control max-age (and versioned file names).",
      items: poorlyCached.map((response) => ({
        label: response.url,
        detail: response.headers["cache-control"] ? `Cache-Control: ${response.headers["cache-control"]}` : "no Cache-Control header",
      })),
    })
  );

  return { checks, metrics: { totalBytes, requestCount } };
}
