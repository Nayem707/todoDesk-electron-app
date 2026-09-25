import { counted, makeCheck, plural, sameSite } from "../checks.js";

const AMBIGUOUS_LINK_TEXT = new Set(["click here", "here", "read more", "more", "learn more", "link", "this", "click"]);

/**
 * @param {{ facts: any, navigation: any, extras: { robots: any, sitemap: any } }} ctx
 */
export function analyzeSeo({ facts, navigation, extras }) {
  const checks = [];
  const title = facts.title.trim();

  checks.push(
    !title
      ? makeCheck({
          id: "seo-title",
          title: "Page title",
          status: "critical",
          weight: 3,
          summary: "The page has no title.",
          why: "The title is the clickable headline shown in search results and on browser tabs.",
          fix: "Add a unique, descriptive <title> of about 10–60 characters.",
        })
      : makeCheck({
          id: "seo-title",
          title: "Page title",
          status: title.length < 10 || title.length > 60 ? "warning" : "pass",
          weight: 3,
          summary:
            title.length < 10 || title.length > 60
              ? `The title is ${title.length} characters long; 10–60 works best.`
              : `The page has a clear title (${title.length} characters).`,
          why: "Search engines cut off long titles and very short ones rarely describe the page well.",
          fix: "Rewrite the title so it describes the page in about 10–60 characters.",
          technical: title,
        })
  );

  const description = facts.metaDescription ?? "";
  checks.push(
    makeCheck({
      id: "seo-description",
      title: "Meta description",
      status: !description ? "warning" : description.length < 50 || description.length > 160 ? "warning" : "pass",
      weight: 2,
      summary: !description
        ? "The page has no meta description."
        : description.length < 50 || description.length > 160
          ? `The description is ${description.length} characters long; 50–160 works best.`
          : "The page has a good meta description.",
      why: "Search engines often show the description under the title in results. A good one makes people click.",
      fix: 'Add <meta name="description" content="…"> summarizing the page in 50–160 characters.',
      technical: description || null,
    })
  );

  checks.push(
    makeCheck({
      id: "seo-h1",
      title: "Main heading (H1)",
      status: facts.h1Count === 0 ? "warning" : facts.h1Count > 1 ? "info" : "pass",
      weight: 2,
      summary:
        facts.h1Count === 0
          ? "The page has no H1 heading."
          : facts.h1Count > 1
            ? `The page has ${facts.h1Count} H1 headings. That's allowed, but one clear main heading is easier to understand.`
            : "The page has one main heading.",
      why: "The main heading tells visitors and search engines what the page is about.",
      fix: "Add a single <h1> that describes the page's topic.",
      items: facts.headings.filter((h) => h.level === 1).map((h) => ({ label: h.text || "(empty heading)" })),
    })
  );

  const canonicalOffSite = facts.canonical && !sameSite(facts.canonical, navigation.finalUrl);
  checks.push(
    makeCheck({
      id: "seo-canonical",
      title: "Canonical URL",
      status: !facts.canonical || canonicalOffSite || facts.canonicalCount > 1 ? "warning" : "pass",
      weight: 1,
      summary: !facts.canonical
        ? "No canonical URL is set."
        : facts.canonicalCount > 1
          ? `There are ${facts.canonicalCount} canonical tags; search engines may ignore them all.`
          : canonicalOffSite
            ? "The canonical URL points to a different website."
            : "A canonical URL is set.",
      why: "A canonical URL tells search engines which address is the “real” one when the same content is reachable at several URLs.",
      fix: 'Add one <link rel="canonical" href="…"> pointing to the preferred URL of this page.',
      technical: facts.canonical,
    })
  );

  checks.push(
    makeCheck({
      id: "seo-viewport",
      title: "Mobile-friendly viewport",
      status: facts.viewport ? "pass" : "critical",
      weight: 2,
      summary: facts.viewport ? "The page is set up for mobile screens." : "The page has no viewport setting for mobile screens.",
      why: "Without a viewport tag, phones show a zoomed-out desktop page, and search engines rank mobile-unfriendly pages lower.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      technical: facts.viewport,
    })
  );

  const robotsHeader = navigation.headers["x-robots-tag"] ?? "";
  const noindex = /noindex/i.test(facts.robotsMeta ?? "") || /noindex/i.test(robotsHeader);
  checks.push(
    makeCheck({
      id: "seo-indexable",
      title: "Visible to search engines",
      status: noindex ? "critical" : "pass",
      weight: 3,
      summary: noindex
        ? "This page asks search engines not to list it (noindex)."
        : "Search engines are allowed to list this page.",
      why: "A noindex instruction removes the page from search results. That's fine for private pages but a problem for public ones.",
      fix: "If this page should appear in search results, remove the noindex robots meta tag or X-Robots-Tag header.",
      technical: [facts.robotsMeta && `meta robots: ${facts.robotsMeta}`, robotsHeader && `X-Robots-Tag: ${robotsHeader}`]
        .filter(Boolean)
        .join("\n") || null,
    })
  );

  const robots = extras.robots;
  if (robots) {
    const disallowAll = robots.status === 200 && blocksEverything(robots.body ?? "");
    checks.push(
      makeCheck({
        id: "seo-robots-txt",
        title: "robots.txt",
        status: robots.status === 200 ? (disallowAll ? "critical" : "pass") : "info",
        weight: 1,
        summary:
          robots.status === 200
            ? disallowAll
              ? "robots.txt blocks all search engines from the whole site."
              : "The site has a robots.txt file."
            : "The site has no robots.txt file. That's optional; search engines then crawl everything.",
        why: "robots.txt tells search engines which parts of the site they may crawl.",
        fix: disallowAll ? "Remove “Disallow: /” for “User-agent: *” unless the whole site should be hidden." : "Optionally add /robots.txt to guide search engines.",
        technical: robots.status === 200 ? (robots.body ?? "").slice(0, 600) : `HTTP ${robots.status ?? "error"}`,
      })
    );
  }

  const sitemap = extras.sitemap;
  if (sitemap) {
    checks.push(
      makeCheck({
        id: "seo-sitemap",
        title: "XML sitemap",
        status: sitemap.found ? "pass" : "warning",
        weight: 1,
        summary: sitemap.found ? "An XML sitemap was found." : "No XML sitemap was found.",
        why: "A sitemap lists your pages so search engines can discover them faster.",
        fix: "Publish /sitemap.xml and reference it from robots.txt with a “Sitemap:” line.",
        technical: sitemap.url ?? null,
      })
    );
  }

  const og = facts.openGraph;
  const missingOg = [!og.title && "og:title", !og.description && "og:description", !og.image && "og:image"].filter(Boolean);
  checks.push(
    makeCheck({
      id: "seo-social",
      title: "Social sharing preview",
      status: missingOg.length === 0 ? "pass" : missingOg.length === 3 ? "warning" : "info",
      weight: 1,
      summary:
        missingOg.length === 0
          ? "Open Graph tags are set for social sharing previews."
          : `Missing Open Graph tags: ${missingOg.join(", ")}.`,
      why: "When the page is shared on social media or chat apps, these tags control the title, description and image of the preview.",
      fix: "Add og:title, og:description and og:image meta tags.",
      technical: facts.twitterCard ? `twitter:card: ${facts.twitterCard}` : null,
    })
  );

  const invalidData = facts.structuredData.filter((entry) => !entry.valid).length;
  const types = [...new Set(facts.structuredData.flatMap((entry) => entry.types))];
  checks.push(
    makeCheck({
      id: "seo-structured-data",
      title: "Structured data",
      status: invalidData ? "warning" : facts.structuredData.length ? "pass" : "info",
      weight: 1,
      summary: invalidData
        ? `${plural(invalidData, "structured data block")} could not be read (invalid JSON).`
        : facts.structuredData.length
          ? `Structured data found${types.length ? `: ${types.join(", ")}` : ""}.`
          : "No structured data (JSON-LD) found. It's optional but can enable rich search results.",
      why: "Structured data helps search engines show rich results such as ratings, FAQs or product details.",
      fix: invalidData ? "Fix the JSON syntax in the application/ld+json scripts." : "Consider adding schema.org JSON-LD that describes the page.",
    })
  );

  const ambiguous = facts.links.filter((link) => link.visible && AMBIGUOUS_LINK_TEXT.has(link.text.toLowerCase()));
  checks.push(
    makeCheck({
      id: "seo-link-text",
      title: "Descriptive link text",
      status: ambiguous.length ? "warning" : "pass",
      weight: 1,
      summary: ambiguous.length
        ? `${counted(ambiguous.length, "link uses", "links use")} vague text such as “click here” or “read more”.`
        : "Links use descriptive text.",
      why: "Search engines and screen-reader users rely on link text to know where a link goes.",
      fix: "Replace vague link text with words that describe the destination, e.g. “View pricing plans”.",
      items: ambiguous.map((link) => ({ label: `“${link.text}”`, detail: link.href ?? link.selector })),
    })
  );

  return checks;
}

function blocksEverything(body) {
  let appliesToAll = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) {
      appliesToAll = value === "*";
    } else if (appliesToAll && /^disallow$/i.test(key) && value === "/") {
      return true;
    }
  }
  return false;
}
