import { formatBytes, makeCheck, plural } from "../checks.js";

const MAX_HTML_LENGTH = 500_000;

/**
 * @param {{ facts: any, consoleErrors: string[], pageErrors: string[] }} ctx
 */
export function analyzeHtml({ facts, consoleErrors, pageErrors }) {
  const checks = [];

  const html5 = facts.doctype?.toLowerCase() === "html";
  checks.push(
    makeCheck({
      id: "html-doctype",
      title: "Document type",
      status: html5 && facts.compatMode === "CSS1Compat" ? "pass" : "warning",
      weight: 2,
      summary: !facts.doctype
        ? "The page has no <!DOCTYPE html> declaration."
        : facts.compatMode !== "CSS1Compat"
          ? "The page renders in legacy “quirks mode”."
          : "The page uses the standard HTML5 doctype.",
      why: "Without the standard doctype, browsers fall back to quirks mode and the layout can differ between browsers.",
      fix: "Put <!DOCTYPE html> on the very first line of the page.",
      technical: `doctype: ${facts.doctype ?? "(none)"} · compatMode: ${facts.compatMode}`,
    })
  );

  checks.push(
    makeCheck({
      id: "html-charset",
      title: "Character encoding",
      status: facts.hasCharsetDeclaration ? "pass" : "warning",
      weight: 1,
      summary: facts.hasCharsetDeclaration
        ? `The character encoding is declared (${facts.characterSet}).`
        : "The page doesn't declare its character encoding.",
      why: "Without it, accented letters and symbols can show up as garbled characters.",
      fix: 'Add <meta charset="utf-8"> near the top of <head>.',
    })
  );

  checks.push(
    makeCheck({
      id: "html-duplicate-ids",
      title: "Unique element IDs",
      status: facts.duplicateIdTotal ? "warning" : "pass",
      weight: 2,
      summary: facts.duplicateIdTotal
        ? `${plural(facts.duplicateIdTotal, "ID is", "IDs are")} used more than once.`
        : "Every element ID is unique.",
      why: "Duplicate IDs break form labels, in-page links, accessibility tools and scripts that expect one match.",
      fix: "Give each element a unique id.",
      items: facts.duplicateIds.map((entry) => ({ label: `#${entry.id}`, detail: `used ${entry.count} times` })),
    })
  );

  const deprecatedCount = facts.deprecatedTags.reduce((sum, entry) => sum + entry.count, 0);
  checks.push(
    makeCheck({
      id: "html-deprecated",
      title: "Outdated HTML tags",
      status: deprecatedCount ? "warning" : "pass",
      weight: 1,
      summary: deprecatedCount
        ? `The page uses ${plural(deprecatedCount, "outdated tag")} such as <${facts.deprecatedTags[0].tag}>.`
        : "No outdated HTML tags were found.",
      why: "Obsolete tags may stop working in future browsers and are often inaccessible.",
      fix: "Replace them with modern HTML and CSS (e.g. use CSS text-align instead of <center>).",
      items: facts.deprecatedTags.map((entry) => ({ label: `<${entry.tag}>`, detail: `${entry.count}×` })),
    })
  );

  const errors = [...pageErrors.map((message) => ({ label: message, detail: "uncaught exception" })), ...consoleErrors.map((message) => ({ label: message, detail: "console error" }))];
  checks.push(
    makeCheck({
      id: "html-js-errors",
      title: "JavaScript errors",
      status: pageErrors.length ? "critical" : consoleErrors.length ? "warning" : "pass",
      weight: 2,
      summary: errors.length
        ? `${plural(errors.length, "error")} appeared while the page loaded.`
        : "No JavaScript errors appeared while the page loaded.",
      why: "Script errors can break menus, forms, checkout and other features without visitors knowing why.",
      fix: "Open the browser's developer console on this page and fix the listed errors.",
      items: errors,
    })
  );

  checks.push(
    makeCheck({
      id: "html-favicon",
      title: "Favicon",
      status: facts.hasFavicon ? "pass" : "warning",
      weight: 1,
      summary: facts.hasFavicon ? "The site has a favicon." : "No favicon is declared.",
      why: "The small icon in browser tabs and bookmarks helps people recognize your site.",
      fix: 'Add <link rel="icon" href="/favicon.ico"> (or a PNG/SVG icon).',
    })
  );

  checks.push(
    makeCheck({
      id: "html-size",
      title: "HTML size",
      status: facts.htmlLength > MAX_HTML_LENGTH ? "warning" : "pass",
      weight: 1,
      summary: `The HTML is about ${formatBytes(facts.htmlLength)}.`,
      why: "Very large HTML documents take longer to download and parse before anything shows.",
      fix: "Remove inlined data and unused markup; load large content on demand.",
    })
  );

  if (facts.inlineStyleCount > 50) {
    checks.push(
      makeCheck({
        id: "html-inline-styles",
        title: "Inline styles",
        status: "info",
        weight: 1,
        summary: `${facts.inlineStyleCount} elements use inline style attributes.`,
        why: "Lots of inline styles make a site harder to maintain and can conflict with a strict Content Security Policy.",
        fix: "Move repeated styles into CSS classes.",
      })
    );
  }

  return checks;
}
