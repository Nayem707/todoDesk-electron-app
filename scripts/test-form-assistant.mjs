import http from "http";
import { analyzeWebsite } from "../electron/formAssistant/formAnalyzer.js";
import { mapFields, normalizeText, ruleBasedMapper } from "../electron/formAssistant/fieldMapper.js";
import { parseTargetUrl, isPrivateAddress, strictUrlPolicy } from "../electron/formAssistant/urlSafety.js";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectError(name, promiseOrFn, code) {
  try {
    await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
    check(name, false, `expected ${code}, got success`);
  } catch (error) {
    check(name, error.code === code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (error.stack && error.message.includes("    at ")) {
      check(`${name} hides stack`, false);
    }
  }
}

console.log("\nURL safety");
for (const [input, code] of [
  ["", "INVALID_URL"],
  ["http://", "INVALID_URL"],
  ["file:///C:/Windows/win.ini", "UNSUPPORTED_URL"],
  ["javascript:alert(1)", "UNSUPPORTED_URL"],
  ["ftp://example.com/form", "UNSUPPORTED_URL"],
  ["data:text/html,<form>", "UNSUPPORTED_URL"],
  ["http://localhost:3000", "UNSUPPORTED_URL"],
  ["http://app.localhost", "UNSUPPORTED_URL"],
  ["http://127.0.0.1", "UNSUPPORTED_URL"],
  ["http://10.0.0.5/admin", "UNSUPPORTED_URL"],
  ["http://192.168.1.1", "UNSUPPORTED_URL"],
  ["http://169.254.169.254/latest/meta-data", "UNSUPPORTED_URL"],
  ["http://[::1]:8080", "UNSUPPORTED_URL"],
  ["http://[::ffff:127.0.0.1]", "UNSUPPORTED_URL"],
  ["http://router", "UNSUPPORTED_URL"],
  ["https://user:pass@example.com", "UNSUPPORTED_URL"],
]) {
  await expectError(`rejects ${input || "(empty)"}`, () => parseTargetUrl(input), code);
}
check("accepts https URL", parseTargetUrl("https://example.com/apply#top").toString() === "https://example.com/apply");
check("adds https:// when missing", parseTargetUrl("example.com/form").protocol === "https:");
check("8.8.8.8 is public", !isPrivateAddress("8.8.8.8"));
check("172.20.1.1 is private", isPrivateAddress("172.20.1.1"));
check("fd00::1 is private", isPrivateAddress("fd00::1"));

console.log("\nField mapping");
check("normalizes camelCase", normalizeText("firstName") === " first name ");
check("normalizes brackets", normalizeText("user[last_name]") === " user last name ");
const mapCases = [
  [{ type: "text", tag: "input", name: "fname" }, "firstName"],
  [{ type: "text", tag: "input", name: "first_name" }, "firstName"],
  [{ type: "text", tag: "input", name: "given_name" }, "firstName"],
  [{ type: "text", tag: "input", id: "firstName" }, "firstName"],
  [{ type: "text", tag: "input", name: "surname" }, "lastName"],
  [{ type: "text", tag: "input", name: "family_name" }, "lastName"],
  [{ type: "text", tag: "input", name: "lname" }, "lastName"],
  [{ type: "text", tag: "input", label: "Full name" }, "fullName"],
  [{ type: "text", tag: "input", name: "name", label: "Name" }, "fullName"],
  [{ type: "text", tag: "input", name: "username", label: "Username" }, "username"],
  [{ type: "email", tag: "input", name: "contact" }, "email"],
  [{ type: "text", tag: "input", label: "Email address" }, "email"],
  [{ type: "tel", tag: "input", name: "mobile" }, "phone"],
  [{ type: "date", tag: "input", name: "birth_date" }, "dateOfBirth"],
  [{ type: "text", tag: "input", name: "dob" }, "dateOfBirth"],
  [{ type: "text", tag: "input", label: "Street address" }, "address"],
  [{ type: "text", tag: "input", name: "zip" }, "postalCode"],
  [{ type: "text", tag: "input", autocomplete: "shipping postal-code" }, "postalCode"],
  [{ type: "text", tag: "input", label: "Passport number" }, "passportNumber"],
  [{ type: "date", tag: "input", label: "Passport expiry date" }, null],
  [{ type: "text", tag: "input", label: "Place of birth" }, null],
  [{ type: "text", tag: "input", name: "ssn" }, "nationalId"],
  [{ type: "password", tag: "input", name: "pwd" }, "password"],
  [{ type: "text", tag: "input", label: "Company name" }, "company"],
  [{ type: "text", tag: "input", label: "Job title" }, "jobTitle"],
  [{ type: "url", tag: "input", name: "portfolio" }, "website"],
  [{ type: "file", tag: "input", label: "Upload your CV" }, "resume"],
  [{ type: "file", tag: "input", label: "Profile photo", accept: "image/*" }, "profilePhoto"],
  [{ type: "textarea", tag: "textarea", label: "Cover letter" }, "coverLetter"],
  [{ type: "text", tag: "input", label: "Cover letter" }, null],
  [{ type: "text", tag: "input", label: "Resume" }, null],
  [{ type: "text", tag: "input", name: "q", label: "Search" }, null],
  [{ type: "checkbox", tag: "input", label: "I agree to the terms" }, null],
  [
    {
      type: "radio",
      tag: "input",
      name: "g",
      options: [
        { value: "m", label: "Male" },
        { value: "f", label: "Female" },
      ],
    },
    "gender",
  ],
  [{ type: "select", tag: "select", name: "nationality" }, "nationality"],
  [{ type: "select", tag: "select", name: "country_code", label: "Country code" }, null],
];
for (const [field, expected] of mapCases) {
  const result = ruleBasedMapper.map(field);
  check(
    `${JSON.stringify(field.name ?? field.id ?? field.label ?? field.autocomplete ?? field.type)} (${field.type}) → ${expected}`,
    result.mappedField === expected,
    `got ${result.mappedField} @ ${result.confidence} [${result.reasons.join("; ")}]`
  );
}
const email = ruleBasedMapper.map({ type: "email", tag: "input", name: "email", label: "Email", autocomplete: "email" });
check("strong multi-signal email ≥ 0.99", email.confidence >= 0.99, String(email.confidence));
const weak = ruleBasedMapper.map({ type: "text", tag: "input", nearbyText: "Your role" });
check("weak evidence is low-confidence", weak.confidence < 0.75, String(weak.confidence));
const custom = mapFields([{ type: "text", tag: "input", name: "xyz" }], [
  ruleBasedMapper,
  { id: "ai", map: () => ({ mappedField: "company", confidence: 0.7, source: "ai", reasons: ["test"] }) },
]);
check("pluggable mapper chain", custom[0].mappedField === "company" && custom[0].mappingSource === "ai");

console.log("\nBrowser analysis (local fixtures)");
const PAGES = {
  "/full": `<!doctype html><title>Job Application</title>
    <h1>Apply</h1>
    <form id="apply" action="/submit" method="post">
      <label for="first_name">First Name</label><input id="first_name" name="first_name" required>
      <label>Last Name <input name="last_name" required></label>
      <input type="email" name="email" placeholder="you@example.com" aria-label="Email" required>
      <label for="mobile">Mobile number</label><input type="tel" id="mobile" name="mobile">
      <label for="birth_date">Date of Birth</label><input type="date" id="birth_date" name="birth_date" required>
      <label for="country">Country</label>
      <select id="country" name="country"><option value="">Choose</option><option value="bd">Bangladesh</option><option value="us" selected>United States</option></select>
      <fieldset><legend>Gender</legend>
        <label><input type="radio" name="gender" value="m"> Male</label>
        <label><input type="radio" name="gender" value="f"> Female</label>
      </fieldset>
      <label><input type="checkbox" name="terms" required> I agree to the terms</label>
      <label for="cover">Cover letter</label><textarea id="cover" name="cover"></textarea>
      <label for="cv">Upload CV</label><input type="file" id="cv" name="cv" accept=".pdf,.doc">
      <span id="pw-label">Choose a password</span><input type="password" aria-labelledby="pw-label" name="pw" value="secret">
      <input type="hidden" name="csrf" value="abc">
      <input type="text" name="disabled_field" disabled value="x">
      <button type="submit">Send</button>
    </form>
    <form id="newsletter"><input type="email" name="newsletter_email" placeholder="Newsletter email"></form>
    <div id="host"></div>
    <script>
      const host = document.getElementById('host');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<label for="city">City</label><input id="city" name="city">';
    </script>
    <iframe src="/frame"></iframe>`,
  "/frame": `<!doctype html><form><label for="zip">ZIP code</label><input id="zip" name="zip"></form>`,
  "/dynamic": `<!doctype html><title>Dynamic</title><div id="app">Loading…</div>
    <script>setTimeout(() => {
      document.getElementById('app').innerHTML =
        '<form><label for="u">Username</label><input id="u" name="username"><input type="password" name="password" aria-label="Password"></form>';
    }, 1500);</script>`,
  "/empty": `<!doctype html><title>About</title><p>No forms here.</p>`,
  "/captcha": `<!doctype html><title>Just a moment...</title><div class="cf-turnstile" data-sitekey="x"></div>`,
  "/login": `<!doctype html><title>Sign in</title><form><input name="user"><input type="password" name="pass"></form>`,
};

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/slow") {
    return;
  }
  if (path === "/401") {
    res.writeHead(401, { "content-type": "text/html" });
    return res.end("<form><input name=a></form>");
  }
  if (path === "/redirect-login") {
    res.writeHead(302, { location: "/login" });
    return res.end();
  }
  if (path === "/redirect-private") {
    res.writeHead(302, { location: `http://localhost:${server.address().port}/full` });
    return res.end();
  }
  if (path === "/loop") {
    res.writeHead(302, { location: "/loop" });
    return res.end();
  }
  const body = PAGES[path];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
  res.end(body ?? "not found");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Fixture server is on loopback, so allow 127.0.0.1 only; "localhost" stays blocked to exercise
// redirect-chain validation.
const testPolicy = {
  parse: (input) => new URL(input),
  assertHostAllowed: async (hostname) => {
    if (hostname !== "127.0.0.1") {
      await strictUrlPolicy.assertHostAllowed(hostname);
    }
  },
};
const fast = { navigationTimeoutMs: 4000, settleTimeoutMs: 4000, totalTimeoutMs: 20000 };

try {
  const steps = [];
  const full = await analyzeWebsite(`${base}/full`, { urlPolicy: testPolicy, onProgress: (s) => steps.push(s), timeouts: fast });
  const byName = (name) => full.fields.find((field) => field.name === name);
  check("progress steps in order", steps.join(",") === "opening,loading,detecting,mapping", steps.join(","));
  check("title extracted", full.title === "Job Application", full.title);
  check("multiple forms detected", full.forms.length >= 3, String(full.forms.length));
  check("hidden input skipped", !byName("csrf"));
  check("text + label[for]", byName("first_name")?.label === "First Name" && byName("first_name")?.mappedField === "firstName");
  check("wrapping label", byName("last_name")?.label === "Last Name" && byName("last_name")?.mappedField === "lastName");
  check("email via aria-label/type", byName("email")?.mappedField === "email" && byName("email")?.placeholder === "you@example.com");
  check("tel", byName("mobile")?.mappedField === "phone");
  check("date", byName("birth_date")?.type === "date" && byName("birth_date")?.mappedField === "dateOfBirth");
  check("required flag", byName("birth_date")?.required === true && byName("mobile")?.required === false);
  const country = byName("country");
  check("select + options", country?.type === "select" && country.options.length === 3 && country.value === "us");
  check("select mapped", country?.mappedField === "country");
  const gender = byName("gender");
  check("radio grouped", gender?.type === "radio" && gender.options.length === 2 && gender.label === "Gender");
  check("radio mapped", gender?.mappedField === "gender");
  check("checkbox", byName("terms")?.type === "checkbox" && byName("terms")?.label === "I agree to the terms" && byName("terms")?.mappedField === null);
  check("textarea", byName("cover")?.tag === "textarea" && byName("cover")?.mappedField === "coverLetter");
  check("file input", byName("cv")?.type === "file" && byName("cv")?.mappedField === "resume");
  check("aria-labelledby", byName("pw")?.label === "Choose a password");
  check("password value never captured", byName("pw")?.value === "");
  check("disabled flag", byName("disabled_field")?.disabled === true);
  check("shadow DOM field", byName("city")?.mappedField === "city");
  check("iframe field", byName("zip")?.mappedField === "postalCode" && Boolean(byName("zip")?.frameUrl));
  check("form index assigned", byName("newsletter_email")?.formIndex !== byName("first_name")?.formIndex);
  check("selectors generated", full.fields.every((field) => typeof field.selector === "string" && field.selector));
  check("confidence on every field", full.fields.every((field) => typeof field.confidence === "number"));

  const dynamic = await analyzeWebsite(`${base}/dynamic`, { urlPolicy: testPolicy, timeouts: fast });
  check("dynamically rendered form", dynamic.fields.some((field) => field.mappedField === "username"));
  check("login warning", dynamic.warnings.some((warning) => warning.code === "LOGIN_FORM"));

  await expectError("no forms", analyzeWebsite(`${base}/empty`, { urlPolicy: testPolicy, timeouts: fast }), "NO_FORMS");
  await expectError("captcha page", analyzeWebsite(`${base}/captcha`, { urlPolicy: testPolicy, timeouts: fast }), "CAPTCHA_DETECTED");
  await expectError("HTTP 401", analyzeWebsite(`${base}/401`, { urlPolicy: testPolicy, timeouts: fast }), "AUTH_REQUIRED");
  await expectError("redirect to sign-in", analyzeWebsite(`${base}/redirect-login`, { urlPolicy: testPolicy, timeouts: fast }), "AUTH_REQUIRED");
  await expectError("HTTP 404", analyzeWebsite(`${base}/missing`, { urlPolicy: testPolicy, timeouts: fast }), "PAGE_LOAD_FAILED");
  await expectError("redirect to private host", analyzeWebsite(`${base}/redirect-private`, { urlPolicy: testPolicy, timeouts: fast }), "UNSUPPORTED_URL");
  await expectError("redirect loop", analyzeWebsite(`${base}/loop`, { urlPolicy: testPolicy, timeouts: fast }), "TOO_MANY_REDIRECTS");
  await expectError(
    "navigation timeout",
    analyzeWebsite(`${base}/slow`, { urlPolicy: testPolicy, timeouts: { ...fast, navigationTimeoutMs: 1500 } }),
    "TIMEOUT"
  );
  const closedPort = await new Promise((resolve) => {
    const probe = http.createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  await expectError(
    "unreachable website",
    analyzeWebsite(`http://127.0.0.1:${closedPort}/`, { urlPolicy: testPolicy, timeouts: fast }),
    "UNREACHABLE"
  );
  await expectError("strict policy blocks loopback", analyzeWebsite(`${base}/full`, { timeouts: fast }), "UNSUPPORTED_URL");

  const controller = new AbortController();
  const pending = analyzeWebsite(`${base}/slow`, { urlPolicy: testPolicy, signal: controller.signal, timeouts: fast });
  setTimeout(() => controller.abort(), 800);
  await expectError("cancel", pending, "CANCELLED");

  if (process.argv.includes("--online")) {
    console.log("\nOnline checks");
    await expectError("example.com has no forms", analyzeWebsite("https://example.com"), "NO_FORMS");
    await expectError("expired certificate", analyzeWebsite("https://expired.badssl.com/"), "SSL_ERROR");
    await expectError("unknown domain", analyzeWebsite("https://no-such-host.invalid-tld-xyz"), "UNREACHABLE");
  }
} finally {
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll form assistant checks passed");
process.exit(failures ? 1 : 0);
