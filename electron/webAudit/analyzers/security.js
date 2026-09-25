import { counted, makeCheck, plural } from "../checks.js";

const SENSITIVE_COOKIE = /sess|auth|token|sid|login|jwt|csrf|xsrf/i;
const MIN_HSTS_SECONDS = 15_552_000; // 180 days

function headerCheck({ id, title, header, value, weight, present, missing, why, fix, status }) {
  return makeCheck({
    id,
    title,
    status: status ?? (value ? "pass" : "warning"),
    weight,
    summary: value ? present : missing,
    why,
    fix,
    technical: value ? `${header}: ${value}` : `${header}: (not set)`,
  });
}

/**
 * @param {{ facts: any, navigation: any, responses: any[], cookies: any[], extras: { httpRedirect: any } }} ctx
 */
export function analyzeSecurity({ facts, navigation, responses, cookies, extras }) {
  const checks = [];
  const headers = navigation.headers;
  const finalUrl = new URL(navigation.finalUrl);
  const https = finalUrl.protocol === "https:";

  checks.push(
    makeCheck({
      id: "sec-https",
      title: "Secure connection (HTTPS)",
      status: https ? "pass" : "critical",
      weight: 3,
      summary: https ? "The page is served over HTTPS." : "The page is served over plain HTTP.",
      why: "Without HTTPS, anyone on the network can read or change what visitors see and send, and browsers mark the site “Not secure”.",
      fix: "Install a TLS certificate (free from Let's Encrypt) and redirect all HTTP traffic to HTTPS.",
    })
  );

  if (https) {
    const redirect = extras.httpRedirect;
    if (redirect) {
      checks.push(
        makeCheck({
          id: "sec-http-redirect",
          title: "HTTP redirects to HTTPS",
          status: redirect.redirectsToHttps ? "pass" : redirect.status === null ? "info" : "warning",
          weight: 2,
          summary: redirect.redirectsToHttps
            ? "Visitors who type http:// are sent to the secure version."
            : redirect.status === null
              ? "The plain HTTP version couldn't be checked."
              : "The plain HTTP version doesn't redirect to HTTPS.",
          why: "Otherwise people who type the address without https:// get an insecure page.",
          fix: "Add a permanent (301) redirect from http:// to https:// on the server.",
          technical: redirect.location ? `Location: ${redirect.location}` : redirect.status ? `HTTP ${redirect.status}` : null,
        })
      );
    }

    const hsts = headers["strict-transport-security"] ?? "";
    const hstsAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    checks.push(
      headerCheck({
        id: "sec-hsts",
        title: "Strict Transport Security (HSTS)",
        header: "Strict-Transport-Security",
        value: hsts,
        status: !hsts ? "warning" : hstsAge < MIN_HSTS_SECONDS ? "warning" : "pass",
        weight: 2,
        present: hstsAge < MIN_HSTS_SECONDS ? "HSTS is set but with a short duration." : "Browsers are told to always use HTTPS.",
        missing: "Browsers aren't told to always use HTTPS for this site.",
        why: "HSTS stops attackers from downgrading visitors to an insecure connection.",
        fix: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.",
      })
    );

    const details = navigation.securityDetails;
    if (details?.validTo) {
      const daysLeft = Math.floor((details.validTo * 1000 - Date.now()) / 86_400_000);
      checks.push(
        makeCheck({
          id: "sec-certificate",
          title: "Certificate validity",
          status: daysLeft < 0 ? "critical" : daysLeft < 14 ? "warning" : "pass",
          weight: 2,
          summary:
            daysLeft < 0
              ? "The security certificate has expired."
              : daysLeft < 14
                ? `The security certificate expires in ${plural(daysLeft, "day")}.`
                : `The security certificate is valid for another ${daysLeft} days.`,
          why: "When the certificate expires, browsers show a full-page security warning and most visitors leave.",
          fix: "Renew the certificate and enable automatic renewal.",
          technical: [
            details.issuer && `Issuer: ${details.issuer}`,
            details.protocol && `Protocol: ${details.protocol}`,
            `Expires: ${new Date(details.validTo * 1000).toISOString().slice(0, 10)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })
      );
    }

    const mixed = [
      ...facts.mixedContent.map((entry) => ({ label: entry.url, detail: `<${entry.tag}>` })),
      ...responses.filter((r) => r.url.startsWith("http:")).map((r) => ({ label: r.url, detail: r.type })),
    ].filter((entry, index, all) => all.findIndex((other) => other.label === entry.label) === index);
    checks.push(
      makeCheck({
        id: "sec-mixed-content",
        title: "Mixed content",
        status: mixed.length ? "critical" : "pass",
        weight: 3,
        summary: mixed.length
          ? `${counted(mixed.length, "resource loads", "resources load")} over insecure HTTP on this secure page.`
          : "All resources load securely.",
        why: "Insecure files on a secure page can be tampered with, and browsers often block them, breaking the page.",
        fix: "Change the listed http:// URLs to https://.",
        items: mixed,
      })
    );
  }

  const csp = headers["content-security-policy"] ?? "";
  checks.push(
    headerCheck({
      id: "sec-csp",
      title: "Content Security Policy",
      header: "Content-Security-Policy",
      value: csp,
      weight: 2,
      present: "A Content Security Policy is set.",
      missing: "No Content Security Policy is set.",
      why: "A CSP limits which scripts can run, which greatly reduces the damage of cross-site scripting (XSS) attacks.",
      fix: "Add a Content-Security-Policy header. Start with a report-only policy to find what needs allowing.",
    })
  );

  checks.push(
    headerCheck({
      id: "sec-nosniff",
      title: "MIME type sniffing protection",
      header: "X-Content-Type-Options",
      value: /nosniff/i.test(headers["x-content-type-options"] ?? "") ? headers["x-content-type-options"] : "",
      weight: 1,
      present: "Browsers are told not to guess file types.",
      missing: "Browsers may guess file types (X-Content-Type-Options is missing).",
      why: "Type guessing can let an uploaded file be run as a script.",
      fix: "Send X-Content-Type-Options: nosniff.",
    })
  );

  const frameProtected = Boolean(headers["x-frame-options"]) || /frame-ancestors/i.test(csp);
  checks.push(
    makeCheck({
      id: "sec-clickjacking",
      title: "Clickjacking protection",
      status: frameProtected ? "pass" : "warning",
      weight: 1,
      summary: frameProtected
        ? "Other sites can't secretly embed this page."
        : "Other sites could embed this page in a hidden frame.",
      why: "Attackers can overlay an invisible copy of your page to trick people into clicking buttons.",
      fix: "Send X-Frame-Options: SAMEORIGIN or a CSP frame-ancestors directive.",
      technical: headers["x-frame-options"] ? `X-Frame-Options: ${headers["x-frame-options"]}` : null,
    })
  );

  checks.push(
    headerCheck({
      id: "sec-referrer-policy",
      title: "Referrer policy",
      header: "Referrer-Policy",
      value: headers["referrer-policy"] ?? "",
      weight: 1,
      present: "A referrer policy controls what other sites learn about your URLs.",
      missing: "No referrer policy is set.",
      why: "Without it, full page addresses (which may include private details) can be passed to other websites.",
      fix: "Send Referrer-Policy: strict-origin-when-cross-origin.",
    })
  );

  checks.push(
    headerCheck({
      id: "sec-permissions-policy",
      title: "Permissions policy",
      header: "Permissions-Policy",
      value: headers["permissions-policy"] ?? "",
      status: headers["permissions-policy"] ? "pass" : "info",
      weight: 1,
      present: "Browser features like camera and location are restricted.",
      missing: "No Permissions-Policy header. It's optional, but it lets you switch off features you don't use.",
      why: "It limits which browser features (camera, microphone, location) the page and embedded content may use.",
      fix: "Send Permissions-Policy, e.g. camera=(), microphone=(), geolocation=().",
    })
  );

  const disclosed = ["server", "x-powered-by", "x-aspnet-version"]
    .filter((name) => headers[name] && /\d/.test(headers[name]))
    .map((name) => ({ label: `${name}: ${headers[name]}` }));
  checks.push(
    makeCheck({
      id: "sec-version-disclosure",
      title: "Server version disclosure",
      status: disclosed.length ? "warning" : "pass",
      weight: 1,
      summary: disclosed.length
        ? "The server reveals its software versions."
        : "The server doesn't reveal software versions.",
      why: "Version numbers help attackers look up known vulnerabilities.",
      fix: "Hide version numbers in the Server and X-Powered-By headers.",
      items: disclosed,
    })
  );

  const siteHost = finalUrl.hostname.replace(/^www\./, "");
  const siteCookies = cookies.filter((cookie) => {
    const domain = cookie.domain.replace(/^\./, "");
    return siteHost === domain || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`);
  });
  const weakCookies = siteCookies
    .map((cookie) => {
      const problems = [];
      if (https && !cookie.secure) {
        problems.push("missing Secure");
      }
      if (SENSITIVE_COOKIE.test(cookie.name) && !cookie.httpOnly) {
        problems.push("missing HttpOnly");
      }
      if (cookie.sameSite === "None" && !cookie.secure) {
        problems.push("SameSite=None without Secure");
      }
      return { name: cookie.name, problems };
    })
    .filter((cookie) => cookie.problems.length);
  if (siteCookies.length) {
    checks.push(
      makeCheck({
        id: "sec-cookies",
        title: "Cookie security",
        status: weakCookies.length ? "warning" : "pass",
        weight: 2,
        summary: weakCookies.length
          ? `${counted(weakCookies.length, "cookie set by this site lacks", "cookies set by this site lack")} security flags.`
          : `${counted(siteCookies.length, "cookie set by this site uses", "cookies set by this site use")} appropriate security flags.`,
        why: "Secure keeps cookies off insecure connections, and HttpOnly stops scripts (and XSS attacks) from stealing login cookies.",
        fix: "Set cookies with Secure, HttpOnly (for session cookies) and a SameSite value.",
        items: weakCookies.map((cookie) => ({ label: cookie.name, detail: cookie.problems.join(", ") })),
        technical: "Only cookie names and flags are inspected; values are never read or stored.",
      })
    );
  }

  const insecureForms = facts.forms.filter(
    (form) => form.action?.startsWith("http:") && (https || form.hasPassword)
  );
  const passwordOverHttp = !https && facts.hasPasswordField;
  checks.push(
    makeCheck({
      id: "sec-forms",
      title: "Secure form submission",
      status: insecureForms.length || passwordOverHttp ? "critical" : "pass",
      weight: 3,
      summary: passwordOverHttp
        ? "A password field is on an insecure (HTTP) page."
        : insecureForms.length
          ? `${counted(insecureForms.length, "form sends", "forms send")} data over insecure HTTP.`
          : facts.forms.length
            ? "Forms submit over a secure connection."
            : "The page has no forms.",
      why: "Anything typed into an insecure form, including passwords, can be read by others on the network.",
      fix: "Serve the page over HTTPS and make every form action an https:// URL.",
      items: insecureForms.map((form) => ({ label: form.action ?? "(current page)", detail: form.method.toUpperCase() })),
    })
  );

  if (facts.blankWithoutNoopener > 0) {
    checks.push(
      makeCheck({
        id: "sec-noopener",
        title: "Links opening new tabs",
        status: "info",
        weight: 1,
        summary: `${counted(facts.blankWithoutNoopener, "link opens", "links open")} a new tab without rel="noopener". Modern browsers protect against this by default.`,
        why: "In older browsers, a page opened this way can redirect your original tab (reverse tabnabbing).",
        fix: 'Add rel="noopener" to links with target="_blank".',
      })
    );
  }

  return checks;
}
