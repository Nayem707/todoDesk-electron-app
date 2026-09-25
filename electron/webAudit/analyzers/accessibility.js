import { counted, makeCheck, plural } from "../checks.js";

/**
 * @param {{ facts: any, contrast: any }} ctx
 */
export function analyzeAccessibility({ facts, contrast }) {
  const checks = [];

  const missingAlt = facts.images.filter((img) => img.visible && img.alt === null && !img.decorative);
  checks.push(
    makeCheck({
      id: "a11y-image-alt",
      title: "Image descriptions (alt text)",
      status: missingAlt.length ? "critical" : "pass",
      weight: 3,
      summary: missingAlt.length
        ? `${counted(missingAlt.length, "image has", "images have")} no alt text.`
        : facts.images.length
          ? "All visible images have alt text."
          : "The page has no images that need alt text.",
      why: "Screen readers read alt text aloud to blind visitors. Without it they only hear the file name or nothing at all.",
      fix: 'Add an alt attribute describing each image. Use alt="" for purely decorative images.',
      items: missingAlt.map((img) => ({ label: img.selector, detail: img.src })),
    })
  );

  checks.push(
    makeCheck({
      id: "a11y-form-labels",
      title: "Form field labels",
      status: facts.unlabeledControls.length ? "critical" : "pass",
      weight: 3,
      summary: facts.unlabeledControls.length
        ? `${counted(facts.unlabeledControls.length, "form field has", "form fields have")} no label.`
        : "All visible form fields have labels.",
      why: "Labels tell screen-reader users what to type. A placeholder alone disappears while typing and isn't reliably announced.",
      fix: "Connect a <label for=\"…\"> to each field, or add an aria-label.",
      items: facts.unlabeledControls.map((control) => ({
        label: control.selector,
        detail: control.placeholder ? `placeholder only: “${control.placeholder}”` : control.html,
      })),
    })
  );

  checks.push(
    makeCheck({
      id: "a11y-button-names",
      title: "Button names",
      status: facts.unnamedButtons.length ? "critical" : "pass",
      weight: 3,
      summary: facts.unnamedButtons.length
        ? `${counted(facts.unnamedButtons.length, "button has", "buttons have")} no readable name.`
        : "All visible buttons have readable names.",
      why: "Icon-only buttons without a name are announced as just “button”, so people can't tell what they do.",
      fix: "Give each button visible text or an aria-label (e.g. aria-label=\"Close\").",
      items: facts.unnamedButtons.map((button) => ({ label: button.selector, detail: button.html })),
    })
  );

  const unnamedLinks = facts.links.filter((link) => link.visible && link.href && !link.text);
  checks.push(
    makeCheck({
      id: "a11y-link-names",
      title: "Link names",
      status: unnamedLinks.length ? "warning" : "pass",
      weight: 2,
      summary: unnamedLinks.length
        ? `${counted(unnamedLinks.length, "link has", "links have")} no readable text.`
        : "All visible links have readable text.",
      why: "Links without text, such as icon links, are announced only by their address, if at all.",
      fix: "Add link text, an aria-label, or alt text on the image inside the link.",
      items: unnamedLinks.map((link) => ({ label: link.selector, detail: link.href })),
    })
  );

  checks.push(
    makeCheck({
      id: "a11y-lang",
      title: "Page language",
      status: facts.lang ? "pass" : "warning",
      weight: 2,
      summary: facts.lang ? `The page language is set (${facts.lang}).` : "The page doesn't declare its language.",
      why: "Screen readers use the language to pronounce words correctly.",
      fix: 'Add a lang attribute to the <html> tag, e.g. <html lang="en">.',
    })
  );

  if (contrast) {
    const ratioWord = contrast.failing === 1 ? "text element" : "text elements";
    checks.push(
      makeCheck({
        id: "a11y-contrast",
        title: "Text contrast",
        status: contrast.failing === 0 ? "pass" : contrast.failing > 10 ? "critical" : "warning",
        weight: 3,
        summary:
          contrast.failing === 0
            ? `All ${contrast.checked} sampled text elements are readable against their background.`
            : `${contrast.failing} ${ratioWord} may be hard to read because of low contrast (estimated from ${contrast.checked} sampled).`,
        why: "Low-contrast text is hard to read for people with low vision, in sunlight, or on cheap screens.",
        fix: "Darken the text or lighten the background until it meets WCAG AA: 4.5:1, or 3:1 for large text.",
        items: contrast.issues.map((issue) => ({
          label: `“${issue.text}” — ${issue.ratio}:1 (needs ${issue.required}:1)`,
          detail: `${issue.selector} · ${issue.color} on ${issue.background}`,
        })),
        technical:
          contrast.skipped > 0
            ? `${contrast.skipped} elements were skipped because they sit on images or use colors that can't be measured.`
            : null,
      })
    );
  }

  const skipped = [];
  for (let index = 1; index < facts.headings.length; index += 1) {
    const previous = facts.headings[index - 1].level;
    const current = facts.headings[index];
    if (current.level > previous + 1) {
      skipped.push({ label: `H${previous} → H${current.level}`, detail: current.text || "(empty heading)" });
    }
  }
  checks.push(
    makeCheck({
      id: "a11y-headings",
      title: "Heading structure",
      status: facts.headings.length === 0 ? "warning" : skipped.length ? "warning" : "pass",
      weight: 1,
      summary:
        facts.headings.length === 0
          ? "The page has no headings."
          : skipped.length
            ? `Heading levels are skipped ${plural(skipped.length, "time")}.`
            : "Headings follow a logical order.",
      why: "Screen-reader users jump between headings to scan a page, and skipped levels make the structure confusing.",
      fix: "Use headings in order (H1, then H2, then H3) without skipping levels.",
      items: skipped,
    })
  );

  checks.push(
    makeCheck({
      id: "a11y-zoom",
      title: "Zooming allowed",
      status: facts.viewportBlocksZoom ? "critical" : "pass",
      weight: 2,
      summary: facts.viewportBlocksZoom ? "The page prevents zooming on mobile." : "Visitors can zoom the page.",
      why: "People with low vision need to pinch-zoom to read.",
      fix: "Remove user-scalable=no and maximum-scale=1 from the viewport meta tag.",
      technical: facts.viewport,
    })
  );

  checks.push(
    makeCheck({
      id: "a11y-tabindex",
      title: "Keyboard order",
      status: facts.positiveTabindex.length ? "warning" : "pass",
      weight: 1,
      summary: facts.positiveTabindex.length
        ? `${counted(facts.positiveTabindex.length, "element forces", "elements force")} a custom keyboard order (tabindex > 0).`
        : "The keyboard order follows the page layout.",
      why: "Positive tabindex values make the Tab key jump around unpredictably for keyboard users.",
      fix: 'Use tabindex="0" or remove tabindex and order elements naturally in the HTML.',
      items: facts.positiveTabindex.map((entry) => ({ label: entry.selector, detail: `tabindex="${entry.tabindex}"` })),
    })
  );

  const untitledFrames = facts.iframes.filter((frame) => !frame.title);
  if (facts.iframes.length) {
    checks.push(
      makeCheck({
        id: "a11y-iframe-title",
        title: "Embedded frame titles",
        status: untitledFrames.length ? "warning" : "pass",
        weight: 1,
        summary: untitledFrames.length
          ? `${counted(untitledFrames.length, "embedded frame has", "embedded frames have")} no title.`
          : "All embedded frames have titles.",
        why: "A title tells screen-reader users what an embedded frame (video, map, widget) contains.",
        fix: 'Add a title attribute to each <iframe>, e.g. title="Store location map".',
        items: untitledFrames.map((frame) => ({ label: frame.selector, detail: frame.src })),
      })
    );
  }

  checks.push(
    makeCheck({
      id: "a11y-main-landmark",
      title: "Main content area",
      status: facts.hasMainLandmark ? "pass" : "warning",
      weight: 1,
      summary: facts.hasMainLandmark ? "The main content area is marked up." : "The page doesn't mark its main content area.",
      why: "A <main> landmark lets screen-reader and keyboard users skip straight past menus to the content.",
      fix: "Wrap the primary content in a <main> element.",
    })
  );

  return checks;
}
