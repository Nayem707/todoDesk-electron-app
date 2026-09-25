/**
 * Runs inside the target page (serialized by Playwright `frame.evaluate`), so it must be fully
 * self-contained: no imports, no closures over module scope.
 *
 * @param {{ maxFields: number, maxOptions: number, maxText: number }} limits
 */
export function extractFormFieldsInPage(limits) {
  const { maxFields, maxOptions, maxText } = limits;
  const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);
  const GROUPED_TYPES = new Set(["radio", "checkbox"]);

  const clean = (value, max = maxText) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);

  const textWithoutControls = (node) => {
    if (!node) {
      return "";
    }
    const copy = node.cloneNode(true);
    copy.querySelectorAll("input, select, textarea, option, script, style, button").forEach((child) =>
      child.remove()
    );
    return clean(copy.textContent);
  };

  const elements = [];
  const visit = (root) => {
    root.querySelectorAll("input, textarea, select").forEach((element) => elements.push(element));
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) {
        visit(element.shadowRoot);
      }
    });
  };
  visit(document);

  const rootOf = (element) => {
    const root = element.getRootNode();
    return root && typeof root.getElementById === "function" ? root : document;
  };

  const labelFor = (element) => {
    const parts = [];
    if (element.labels && element.labels.length) {
      for (const label of element.labels) {
        parts.push(textWithoutControls(label));
      }
    } else if (element.id) {
      const root = rootOf(element);
      const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) {
        parts.push(textWithoutControls(label));
      }
    }
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const root = rootOf(element);
      for (const id of labelledBy.split(/\s+/)) {
        const target = root.getElementById(id);
        if (target) {
          parts.push(textWithoutControls(target));
        }
      }
    }
    return clean(parts.filter(Boolean).join(" "));
  };

  const legendFor = (element) => {
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    if (legend) {
      return textWithoutControls(legend);
    }
    const group = element.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const aria = group.getAttribute("aria-label");
      if (aria) {
        return clean(aria);
      }
      const labelledBy = group.getAttribute("aria-labelledby");
      const target = labelledBy ? rootOf(group).getElementById(labelledBy.split(/\s+/)[0]) : null;
      return target ? textWithoutControls(target) : "";
    }
    return "";
  };

  const nearbyTextFor = (element) => {
    let node = element;
    for (let depth = 0; depth < 3 && node; depth += 1) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (!sibling.matches("input, select, textarea, script, style, button")) {
          const text = textWithoutControls(sibling);
          if (text) {
            return clean(text, 120);
          }
        }
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
      if (node && node.matches("form, body")) {
        break;
      }
    }
    return "";
  };

  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 1 &&
      rect.height > 1 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) > 0.05
    );
  };

  const isUnique = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  const selectorFor = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      const byId = `#${CSS.escape(element.id)}`;
      if (isUnique(byId)) {
        return byId;
      }
    }
    const name = element.getAttribute("name");
    if (name) {
      const byName = `${tag}[name="${CSS.escape(name)}"]`;
      if (isUnique(byName)) {
        return byName;
      }
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 8) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
        if (same.length > 1) {
          part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  };

  const forms = Array.from(document.forms);
  const formIndexOf = (element) => {
    const form = element.form || element.closest("form");
    const index = form ? forms.indexOf(form) : -1;
    return index >= 0 ? index : null;
  };

  const fields = [];
  const groups = new Map();
  let truncated = false;

  for (const element of elements) {
    if (fields.length >= maxFields) {
      truncated = true;
      break;
    }
    const tag = element.tagName.toLowerCase();
    const type =
      tag === "input" ? (element.getAttribute("type") || "text").toLowerCase() : tag;
    if (tag === "input" && SKIP_INPUT_TYPES.has(type)) {
      continue;
    }

    const name = clean(element.getAttribute("name"), 200);
    const formIndex = formIndexOf(element);
    const ownLabel = labelFor(element);
    const visible = isVisible(element);

    if (GROUPED_TYPES.has(type) && name) {
      const existing = groups.get(`${formIndex}|${type}|${name}`);
      if (existing) {
        if (existing.options.length < maxOptions) {
          existing.options.push({
            value: clean(element.value, 200),
            label: ownLabel || clean(element.value, 200),
            selected: Boolean(element.checked),
          });
        }
        existing.required = existing.required || element.required;
        existing.visible = existing.visible || visible;
        continue;
      }
    }

    const field = {
      tag,
      type,
      name,
      id: clean(element.id, 200),
      placeholder: clean(element.getAttribute("placeholder")),
      label: ownLabel,
      ariaLabel: clean(element.getAttribute("aria-label")),
      autocomplete: clean(element.getAttribute("autocomplete"), 80),
      required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
      disabled: Boolean(element.disabled),
      readOnly: Boolean(element.readOnly),
      visible,
      multiple: Boolean(element.multiple),
      accept: clean(element.getAttribute("accept"), 120),
      maxLength: element.maxLength > 0 ? element.maxLength : null,
      value: "",
      options: [],
      legend: legendFor(element),
      nearbyText: "",
      formIndex,
      selector: selectorFor(element),
    };

    if (!field.label && !field.ariaLabel) {
      field.nearbyText = nearbyTextFor(element);
    }

    if (tag === "select") {
      field.options = Array.from(element.options)
        .slice(0, maxOptions)
        .map((option) => ({
          value: clean(option.value, 200),
          label: clean(option.label || option.textContent, 200),
          selected: Boolean(option.selected),
        }));
      field.value = field.options.filter((option) => option.selected).map((option) => option.value).join(", ");
    } else if (GROUPED_TYPES.has(type)) {
      const option = {
        value: clean(element.value, 200),
        label: ownLabel || clean(element.value, 200),
        selected: Boolean(element.checked),
      };
      field.options = [option];
      if (name) {
        // Group label comes from the fieldset/legend; per-option labels live in `options`.
        field.label = field.legend || "";
        if (!field.label && !field.ariaLabel) {
          field.nearbyText = nearbyTextFor(element.closest("fieldset, [role=radiogroup], div") || element);
        }
        groups.set(`${formIndex}|${type}|${name}`, field);
      }
    } else if (type !== "password" && type !== "file") {
      field.value = clean(element.value, 200);
    }

    fields.push(field);
  }

  // A checkbox "group" of one is a standalone checkbox; keep its own label.
  for (const field of groups.values()) {
    if (field.type === "checkbox" && field.options.length === 1) {
      field.label = field.options[0].label;
      field.value = field.options[0].selected ? field.options[0].value : "";
    } else {
      field.value = field.options.filter((option) => option.selected).map((option) => option.value).join(", ");
    }
  }

  const captchaSelectors = [
    ".g-recaptcha",
    ".h-captcha",
    ".cf-turnstile",
    "[data-sitekey]",
    "#challenge-form",
    "#cf-challenge-running",
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="challenges.cloudflare.com"]',
  ];
  const hasCaptcha = captchaSelectors.some((selector) => document.querySelector(selector));

  return {
    title: clean(document.title, 200),
    fields,
    forms: forms.map((form, index) => ({
      index,
      id: clean(form.id, 200),
      name: clean(form.getAttribute("name"), 200),
      method: clean(form.getAttribute("method") || "get", 10).toLowerCase(),
      action: clean(form.action, 500),
    })),
    hasCaptcha,
    truncated,
  };
}
