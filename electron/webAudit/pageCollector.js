/**
 * In-page collectors for Web Audit. Each function is serialized by Playwright and runs inside the
 * audited page, so it must be self-contained: no imports or references to outer scope.
 */

/**
 * Collects document facts (metadata, headings, links, images, accessibility and markup signals).
 * @param {{ maxLinks: number, maxImages: number, maxItems: number, maxText: number }} limits
 */
export function collectPageFacts({ maxLinks, maxImages, maxItems, maxText }) {
  const clip = (value, max = maxText) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
  const describe = (el) => {
    let selector = el.tagName.toLowerCase();
    if (el.id) {
      selector += `#${el.id}`;
    } else {
      const classes =
        typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (classes.length) {
        selector += `.${classes.join(".")}`;
      }
    }
    return clip(selector, 120);
  };
  const openingTag = (el) => clip(el.outerHTML.replace(/>[\s\S]*$/, ">"), 160);
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const meta = (selector, name = "content") => document.querySelector(selector)?.getAttribute(name)?.trim() ?? null;
  const textById = (id) => document.getElementById(id)?.textContent ?? "";
  const accessibleName = (el) => {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map(textById).join(" ").trim();
      if (text) {
        return text;
      }
    }
    const aria = el.getAttribute("aria-label")?.trim();
    if (aria) {
      return aria;
    }
    const text = (el.innerText ?? el.textContent ?? "").trim();
    if (text) {
      return text;
    }
    const img = el.querySelector?.("img[alt]:not([alt=''])");
    if (img) {
      return img.getAttribute("alt").trim();
    }
    const svgTitle = el.querySelector?.("svg title")?.textContent?.trim();
    if (svgTitle) {
      return svgTitle;
    }
    return el.getAttribute("title")?.trim() ?? "";
  };
  const resolve = (value) => {
    try {
      return new URL(value, location.href).toString();
    } catch {
      return null;
    }
  };

  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
    .slice(0, maxItems)
    .map((h) => ({ level: Number(h.tagName[1]), text: clip(h.textContent, 120) }));

  const allAnchors = [...document.querySelectorAll("a")];
  const links = allAnchors.slice(0, maxLinks).map((a) => {
    const raw = a.getAttribute("href");
    return {
      href: raw === null || typeof a.href !== "string" ? null : a.href,
      raw: raw === null ? null : clip(raw, 300),
      text: clip(accessibleName(a), 100),
      rel: (a.getAttribute("rel") || "").toLowerCase(),
      target: (a.getAttribute("target") || "").toLowerCase(),
      visible: isVisible(a),
      selector: describe(a),
    };
  });

  const viewportHeight = window.innerHeight;
  const images = [...document.images].slice(0, maxImages).map((img) => {
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    return {
      src: clip(img.currentSrc || img.src, 400),
      alt: img.getAttribute("alt"),
      decorative: img.getAttribute("role") === "presentation" || img.getAttribute("role") === "none" || img.getAttribute("aria-hidden") === "true",
      hasDimensions: Boolean(img.getAttribute("width") && img.getAttribute("height")) || style.aspectRatio !== "auto",
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: Math.round(rect.width),
      displayHeight: Math.round(rect.height),
      loading: (img.getAttribute("loading") || "").toLowerCase(),
      complete: img.complete,
      aboveFold: rect.top < viewportHeight,
      visible: isVisible(img),
      selector: describe(img),
    };
  });

  const hasLabel = (el) => {
    if (el.labels && [...el.labels].some((label) => label.textContent.trim())) {
      return true;
    }
    if (el.getAttribute("aria-label")?.trim() || el.getAttribute("title")?.trim()) {
      return true;
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    return Boolean(labelledBy && labelledBy.split(/\s+/).map(textById).join("").trim());
  };
  const unlabeledControls = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => !(el instanceof HTMLInputElement && ["hidden", "submit", "button", "reset", "image"].includes(el.type)))
    .filter(isVisible)
    .filter((el) => !hasLabel(el))
    .slice(0, maxItems)
    .map((el) => ({ selector: describe(el), html: openingTag(el), placeholder: el.getAttribute("placeholder") || null }));

  const unnamedButtons = [
    ...document.querySelectorAll("button, [role=button], input[type=button], input[type=image]"),
  ]
    .filter(isVisible)
    .filter((el) => {
      if (el instanceof HTMLInputElement) {
        return el.type === "image" ? !el.alt?.trim() : !el.value?.trim() && !hasLabel(el);
      }
      return !accessibleName(el);
    })
    .slice(0, maxItems)
    .map((el) => ({ selector: describe(el), html: openingTag(el) }));

  const idCounts = new Map();
  for (const el of [...document.querySelectorAll("[id]")].slice(0, 5000)) {
    idCounts.set(el.id, (idCounts.get(el.id) ?? 0) + 1);
  }
  const duplicateIds = [...idCounts.entries()]
    .filter(([id, count]) => id && count > 1)
    .map(([id, count]) => ({ id: clip(id, 80), count }));

  const DEPRECATED = ["center", "font", "marquee", "blink", "frame", "frameset", "big", "strike", "tt", "acronym", "applet", "basefont", "dir"];
  const deprecatedTags = DEPRECATED.map((tag) => ({ tag, count: document.getElementsByTagName(tag).length })).filter(
    (entry) => entry.count > 0
  );

  const structuredData = [...document.querySelectorAll('script[type="application/ld+json" i]')]
    .slice(0, 20)
    .map((script) => {
      try {
        const parsed = JSON.parse(script.textContent || "");
        const nodes = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ?? [parsed];
        const types = nodes.flatMap((node) => node?.["@type"] ?? []).map(String);
        return { valid: true, types: types.slice(0, 5) };
      } catch {
        return { valid: false, types: [] };
      }
    });

  const isHttps = location.protocol === "https:";
  const mixedContent = isHttps
    ? [
        ...document.querySelectorAll(
          "img[src], script[src], iframe[src], link[rel~='stylesheet' i][href], source[src], video[src], audio[src], embed[src], object[data]"
        ),
      ]
        .map((el) => ({
          url: resolve(el.getAttribute("src") ?? el.getAttribute("href") ?? el.getAttribute("data") ?? ""),
          tag: el.tagName.toLowerCase(),
        }))
        .filter((entry) => entry.url?.startsWith("http:"))
        .slice(0, maxItems)
    : [];

  const forms = [...document.forms].slice(0, 50).map((form) => ({
    action: resolve(form.getAttribute("action") ?? location.href),
    method: (form.getAttribute("method") || "get").toLowerCase(),
    hasPassword: Boolean(form.querySelector("input[type=password]")),
  }));

  const html = document.documentElement;
  const viewport = meta('meta[name="viewport" i]');

  return {
    url: location.href,
    protocol: location.protocol,
    title: document.title ?? "",
    titleCount: [...document.querySelectorAll("title")].filter((t) => !t.closest("svg")).length,
    metaDescription: meta('meta[name="description" i]'),
    metaDescriptionCount: document.querySelectorAll('meta[name="description" i]').length,
    canonical: document.querySelector('link[rel="canonical" i]')?.href ?? null,
    canonicalCount: document.querySelectorAll('link[rel="canonical" i]').length,
    robotsMeta: meta('meta[name="robots" i]'),
    viewport,
    viewportBlocksZoom: Boolean(viewport && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0+)?(?![\d.])/i.test(viewport)),
    lang: html.getAttribute("lang")?.trim() || null,
    openGraph: {
      title: meta('meta[property="og:title" i]'),
      description: meta('meta[property="og:description" i]'),
      image: meta('meta[property="og:image" i]'),
    },
    twitterCard: meta('meta[name="twitter:card" i]'),
    structuredData,
    headings,
    h1Count: document.querySelectorAll("h1").length,
    links,
    linkTotal: allAnchors.length,
    images,
    imageTotal: document.images.length,
    unlabeledControls,
    unnamedButtons,
    positiveTabindex: [...document.querySelectorAll("[tabindex]")]
      .filter((el) => Number(el.getAttribute("tabindex")) > 0)
      .slice(0, maxItems)
      .map((el) => ({ selector: describe(el), tabindex: el.getAttribute("tabindex") })),
    iframes: [...document.querySelectorAll("iframe")].slice(0, maxItems).map((frame) => ({
      src: clip(frame.getAttribute("src") ?? "", 200),
      title: frame.getAttribute("title")?.trim() || null,
      selector: describe(frame),
    })),
    hasMainLandmark: Boolean(document.querySelector("main, [role=main]")),
    doctype: document.doctype ? document.doctype.name : null,
    compatMode: document.compatMode,
    characterSet: document.characterSet,
    hasCharsetDeclaration: Boolean(document.querySelector('meta[charset], meta[http-equiv="content-type" i]')),
    duplicateIds: duplicateIds.slice(0, maxItems),
    duplicateIdTotal: duplicateIds.length,
    deprecatedTags,
    inlineStyleCount: document.querySelectorAll("[style]").length,
    hasFavicon: Boolean(document.querySelector("link[rel~='icon' i]")),
    domNodes: document.getElementsByTagName("*").length,
    htmlLength: html.outerHTML.length,
    mixedContent,
    forms,
    hasPasswordField: Boolean(document.querySelector("input[type=password]")),
    blankWithoutNoopener: allAnchors.filter(
      (a) => a.target === "_blank" && !/noopener|noreferrer/i.test(a.getAttribute("rel") || "")
    ).length,
    renderBlockingScripts: [...document.querySelectorAll("head script[src]")]
      .filter((s) => !s.async && !s.defer && s.type !== "module")
      .slice(0, maxItems)
      .map((s) => clip(s.src, 300)),
  };
}

/**
 * Collects navigation/paint timings, Core Web Vitals and loaded resources for this page load.
 * @param {{ maxResources: number }} limits
 */
export async function collectPerformanceInPage({ maxResources }) {
  const nav = performance.getEntriesByType("navigation")[0] ?? null;
  const fcp = performance.getEntriesByName("first-contentful-paint")[0] ?? null;
  const observe = (type, initial, reduce) =>
    new Promise((resolve) => {
      let value = initial;
      let observer;
      try {
        observer = new PerformanceObserver((list) => {
          value = reduce(value, list.getEntries());
        });
        observer.observe({ type, buffered: true });
      } catch {
        resolve(null);
        return;
      }
      setTimeout(() => {
        try {
          value = reduce(value, observer.takeRecords());
          observer.disconnect();
        } catch {
          // Observer already gone; keep what was recorded.
        }
        resolve(value);
      }, 300);
    });

  const [lcp, cls] = await Promise.all([
    observe("largest-contentful-paint", null, (prev, entries) =>
      entries.length ? entries[entries.length - 1].startTime : prev
    ),
    observe("layout-shift", 0, (prev, entries) =>
      entries.reduce((sum, entry) => (entry.hadRecentInput ? sum : sum + entry.value), prev ?? 0)
    ),
  ]);

  const entries = performance.getEntriesByType("resource");
  const resources = entries.slice(0, maxResources).map((entry) => ({
    url: entry.name.slice(0, 400),
    type: entry.initiatorType || "other",
    bytes: entry.transferSize || entry.encodedBodySize || 0,
    durationMs: Math.round(entry.duration),
  }));

  return {
    ttfbMs: nav ? Math.round(nav.responseStart - nav.startTime) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null,
    fcpMs: fcp ? Math.round(fcp.startTime) : null,
    lcpMs: typeof lcp === "number" ? Math.round(lcp) : null,
    cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
    documentBytes: nav ? nav.transferSize || nav.encodedBodySize || 0 : 0,
    resourceCount: entries.length,
    resources,
  };
}

/**
 * Estimates WCAG AA text contrast for a sample of visible text. Elements over background images
 * or with unparseable colors are skipped rather than guessed.
 * @param {{ maxElements: number, maxIssues: number }} limits
 */
export function collectContrastInPage({ maxElements, maxIssues }) {
  const parse = (value) => {
    const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (!match) {
      return null;
    }
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      return null;
    }
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  const backgroundOf = (el) => {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") {
        return null;
      }
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) {
        layers.push(color);
        if (color.a >= 1) {
          break;
        }
      }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      result = blend(layers[index], result);
    }
    return result;
  };
  const describe = (el) => {
    let selector = el.tagName.toLowerCase();
    if (el.id) {
      selector += `#${el.id}`;
    } else if (typeof el.className === "string" && el.className.trim()) {
      selector += `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`;
    }
    return selector.slice(0, 120);
  };
  const rgb = ({ r, g, b }) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

  const seen = new Set();
  const issues = [];
  let checked = 0;
  let skipped = 0;
  let failing = 0;
  if (!document.body) {
    return { checked, skipped, failing, issues };
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && checked < maxElements) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el || seen.has(el) || (node.textContent ?? "").trim().length < 2) {
      continue;
    }
    seen.add(el);
    if (el.closest("script, style, noscript, svg, template, [aria-hidden='true']")) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || Number(style.opacity) === 0) {
      continue;
    }
    checked += 1;
    const fg = parse(style.color);
    const bg = backgroundOf(el);
    if (!fg || !bg) {
      skipped += 1;
      continue;
    }
    const ratio = contrast(fg.a < 1 ? blend(fg, bg) : fg, bg);
    const size = Number.parseFloat(style.fontSize) || 16;
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      failing += 1;
      if (issues.length < maxIssues) {
        issues.push({
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
          ratio: Math.round(ratio * 100) / 100,
          required,
          selector: describe(el),
          color: rgb(fg),
          background: rgb(bg),
        });
      }
    }
  }
  return { checked, skipped, failing, issues };
}
