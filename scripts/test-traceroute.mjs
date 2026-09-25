import { spawn, execFileSync } from "child_process";
import { buildHop, detectTraceError, parseHopLine, SLOW_HOP_MS } from "../electron/traceroute/traceParser.js";
import {
  buildTraceCommand,
  normalizeTraceTarget,
  resolveTraceTarget,
  runTraceroute,
} from "../electron/traceroute/traceRunner.js";
import * as tracerouteService from "../electron/traceroute/tracerouteService.js";

const ONLINE = process.argv.includes("--online");

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectError(promiseOrFn, code) {
  try {
    await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
    return { ok: false, detail: "did not throw" };
  } catch (error) {
    return { ok: error.code === code, detail: `${error.code}: ${error.message}`, error };
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hopsOf = (text, platform) =>
  text
    .split(/\r?\n/)
    .map((line) => parseHopLine(line, platform))
    .filter(Boolean);

// ---------------------------------------------------------------------------------------------
console.log("\nWindows tracert parsing");
const WINDOWS_OUTPUT = `
Tracing route to example.com [172.66.147.243]
over a maximum of 30 hops:

  1    <1 ms     1 ms    <1 ms  192.168.100.1
  2     8 ms     7 ms     *     10.200.220.141
  3     *        *        *     Request timed out.
  4   210 ms   190 ms   205 ms  ae-1.edge.example.net [202.173.121.214]
  5     1 ms    <1 ms    <1 ms  172.66.147.243

Trace complete.
`;
{
  const hops = hopsOf(WINDOWS_OUTPUT, "win32");
  check("parses 5 hops and skips header/footer", hops.length === 5, String(hops.length));
  check("'<1 ms' becomes a sub-millisecond value", hops[0]?.probes[0] === 0.5 && hops[0]?.probes[1] === 1);
  check("a lost probe is null", hops[1]?.probes[2] === null && hops[1]?.ips[0] === "10.200.220.141");
  check("'Request timed out' hop has no IP", hops[2]?.ips.length === 0 && hops[2]?.probes.every((p) => p === null));
  check("'name [ip]' splits hostname and IP", hops[3]?.hostname === "ae-1.edge.example.net" && hops[3]?.ips[0] === "202.173.121.214");
  check("raw line is kept", hops[3]?.raw.includes("ae-1.edge.example.net"));
  const unreachable = parseHopLine("  6  10.0.0.1  reports: Destination net unreachable.", "win32");
  check("'reports: Destination net unreachable' is flagged", unreachable?.unreachable === true && unreachable.ips[0] === "10.0.0.1");
  check("header line is not a hop", parseHopLine("over a maximum of 30 hops:", "win32") === null);
  check("digits-leading hostname isn't read as a probe", parseHopLine("  7    12 ms    11 ms    12 ms  1e100.net [142.250.1.1]", "win32")?.hostname === "1e100.net");
  const localized = parseHopLine("  2     8 мс     7 мс     9 мс  10.1.1.1", "win32");
  check("localized unit still parses", localized?.probes.join(",") === "8,7,9" && localized.ips[0] === "10.1.1.1");
}

console.log("\nLinux/macOS traceroute parsing");
const LINUX_OUTPUT = `traceroute to 93.184.216.34 (93.184.216.34), 30 hops max, 60 byte packets
 1  _gateway (192.168.1.1)  0.412 ms  0.388 ms  0.371 ms
 2  * * *
 3  10.1.1.1  8.123 ms 10.1.1.2  9.100 ms  8.900 ms
 4  93.184.216.34  20.1 ms !H  20.2 ms  20.0 ms
`;
const MAC_OUTPUT = `traceroute to example.com (93.184.216.34), 64 hops max, 52 byte packets
 1  192.168.1.1  3.123 ms  2.100 ms  1.900 ms
 2  100.64.0.1  9.5 ms  *  10.2 ms
 3  93.184.216.34  18.4 ms  18.1 ms  18.9 ms
`;
{
  const linux = hopsOf(LINUX_OUTPUT, "linux");
  check("linux: 4 hops, header skipped", linux.length === 4, String(linux.length));
  check("linux: 'name (ip)' splits hostname and IP", linux[0]?.hostname === "_gateway" && linux[0]?.ips[0] === "192.168.1.1");
  check("linux: '* * *' is three lost probes", linux[1]?.probes.length === 3 && linux[1]?.ips.length === 0);
  check("linux: multiple responders are all kept", linux[2]?.ips.join(",") === "10.1.1.1,10.1.1.2" && linux[2]?.probes.length === 3);
  check("linux: '!H' marks unreachable", linux[3]?.unreachable === true && linux[3]?.probes.length === 3);
  const mac = hopsOf(MAC_OUTPUT, "darwin");
  check("macOS: 3 hops with mixed probes", mac.length === 3 && mac[1]?.probes[1] === null && mac[1]?.probes[2] === 10.2);
}

console.log("\nHop normalization");
{
  const target = "172.66.147.243";
  const [first, second, third, fourth, fifth] = hopsOf(WINDOWS_OUTPUT, "win32").map((hop) => buildHop(hop, target));
  check("fast responding hop is ok", first?.status === "ok" && first.latency?.min === 0.5 && first.latency?.max === 1);
  check("lost probes are counted", second?.lostProbes === 1 && second.status === "ok");
  check("private address is detected", first?.isPrivate === true && fourth?.isPrivate === false);
  check("silent hop is a timeout", third?.status === "timeout" && third.latency === null && third.ip === null);
  check(`average ≥ ${SLOW_HOP_MS} ms is slow`, fourth?.status === "slow" && fourth.latency?.avg === 201.7, String(fourth?.latency?.avg));
  check("hop matching the target is the destination", fifth?.status === "destination");
  const linuxLast = buildHop(hopsOf(LINUX_OUTPUT, "linux")[3], "93.184.216.34");
  check("destination wins over an '!H' annotation", linuxLast.status === "destination");
  const unreachable = buildHop(parseHopLine("  6  10.0.0.1  reports: Destination net unreachable.", "win32"), target);
  check("unreachable hop status", unreachable.status === "unreachable" && unreachable.latency === null);
}

console.log("\nTool error detection");
check("permission error", detectTraceError("socket: Operation not permitted")?.code === "PERMISSION_DENIED");
check("network error", detectTraceError("Transmit error: code 1231.")?.code === "UNREACHABLE");
check("resolve error", detectTraceError("Unable to resolve target system name foo.")?.code === "DNS_FAILED");
check("normal lines aren't errors", detectTraceError("Trace complete.") === null);

// ---------------------------------------------------------------------------------------------
console.log("\nTarget validation");
{
  const host = (input) => {
    try {
      return normalizeTraceTarget(input).host;
    } catch (error) {
      return `!${error.code}`;
    }
  };
  check("example.com", host("example.com") === "example.com");
  check("https URL with path and query", host("https://example.com/path?q=1#top") === "example.com");
  check("www prefix is kept as the host", host("www.example.com") === "www.example.com");
  check("whitespace and case are normalized", host("  EXAMPLE.com  ") === "example.com");
  check("http URL with port", host("http://example.com:8080/") === "example.com");
  check("public IPv4 is accepted", host("1.1.1.1") === "1.1.1.1");
  check("bracketed IPv6 follows the shared Web Analyze policy (refused)", host("https://[2606:4700:4700::1111]/") === "!UNSUPPORTED_URL");
  check("empty → INVALID_URL", host("   ") === "!INVALID_URL");
  check("non-string → INVALID_URL", host(42) === "!INVALID_URL");
  check("spaces → INVALID_URL", host("exa mple.com") === "!INVALID_URL");
  check("single label → INVALID_URL", host("example") === "!INVALID_URL");
  check("file:// → UNSUPPORTED_URL", host("file:///etc/passwd") === "!UNSUPPORTED_URL");
  check("localhost → UNSUPPORTED_URL", host("localhost") === "!UNSUPPORTED_URL");
  check("private IP → UNSUPPORTED_URL", host("http://192.168.1.1") === "!UNSUPPORTED_URL");
  check("credentials → UNSUPPORTED_URL", host("https://user:pw@example.com") === "!UNSUPPORTED_URL");
  const message = await expectError(() => normalizeTraceTarget("exa mple.com"), "INVALID_URL");
  check("invalid message is friendly", /valid website or domain/.test(message.detail), message.detail);
}

console.log("\nResolution");
{
  const lookup = async () => [
    { address: "2606:2800:220:1::1", family: 6 },
    { address: "93.184.216.34", family: 4 },
  ];
  const resolved = await resolveTraceTarget({ host: "example.test", isIp: false }, { lookup });
  check("prefers IPv4", resolved.ip === "93.184.216.34" && resolved.family === 4);
  const dnsFail = await expectError(
    resolveTraceTarget({ host: "nope.test", isIp: false }, { lookup: async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }); } }),
    "DNS_FAILED"
  );
  check("lookup failure → DNS_FAILED with friendly text", dnsFail.ok && /could not be resolved/.test(dnsFail.detail), dnsFail.detail);
  const privateHost = await expectError(
    resolveTraceTarget({ host: "sneaky.test", isIp: false }, { lookup: async () => [{ address: "10.0.0.5", family: 4 }] }),
    "UNSUPPORTED_URL"
  );
  check("domain resolving to a private IP is refused", privateHost.ok, privateHost.detail);
}

console.log("\nCommand building");
{
  const win = buildTraceCommand("win32", { ip: "93.184.216.34", family: 4 }, { maxHops: 30 });
  check("windows uses tracert without reverse DNS", /tracert/i.test(win.file) && win.args.includes("-d"));
  check("target IP is the last argument", win.args[win.args.length - 1] === "93.184.216.34");
  const linux = buildTraceCommand("linux", { ip: "2606:2800:220:1::1", family: 6 }, { maxHops: 20 });
  check("linux IPv6 adds -6 and hop limit", linux.args.includes("-6") && linux.args.includes("20"));
  const mac = buildTraceCommand("darwin", { ip: "2606:2800:220:1::1", family: 6 }, { maxHops: 30 });
  check("macOS IPv6 uses traceroute6", mac.label === "traceroute6");
}

// ---------------------------------------------------------------------------------------------
console.log("\nRunner (simulated trace tool)");

/** A stand-in for tracert that prints lines with delays, then exits or hangs. */
function fakeTool(lines, { delayMs = 40, hang = false, exitCode = 0, stderr = "" } = {}) {
  const script = `
    const lines = ${JSON.stringify(lines)};
    let index = 0;
    ${stderr ? `process.stderr.write(${JSON.stringify(stderr)});` : ""}
    const tick = () => {
      if (index < lines.length) {
        process.stdout.write(lines[index++] + "\\r\\n");
        setTimeout(tick, ${delayMs});
      } else if (${hang}) {
        setInterval(() => {}, 1000);
      } else {
        process.exitCode = ${exitCode};
      }
    };
    tick();`;
  const children = [];
  const spawnImpl = (_file, _args, options) => {
    const child = spawn(process.execPath, ["-e", script], options);
    children.push(child);
    return child;
  };
  return { spawnImpl, children };
}

const FAKE_TARGET = "93.184.216.34";
const fakeLookup = async () => [{ address: FAKE_TARGET, family: 4 }];
const HEADER = ["", `Tracing route to example.test [${FAKE_TARGET}]`, "over a maximum of 30 hops:", ""];
const baseOptions = (tool, extra = {}) => ({
  platform: "win32",
  spawnImpl: tool.spawnImpl,
  lookup: fakeLookup,
  reverseLookup: async (ip) => (ip === "10.0.0.1" ? "core1.isp.test" : null),
  ...extra,
});

{
  const tool = fakeTool([
    ...HEADER,
    "  1    <1 ms    <1 ms    <1 ms  192.168.1.1",
    "  2     5 ms     6 ms     5 ms  10.0.0.1",
    "  3     *        *        *     Request timed out.",
    `  4    12 ms    11 ms    12 ms  ${FAKE_TARGET}`,
    "",
    "Trace complete.",
  ], { delayMs: 120 });
  const events = [];
  let closedAt = 0;
  const result = await runTraceroute("https://example.test/page", {
    ...baseOptions(tool),
    onEvent: (event) => events.push({ ...event, at: Date.now() }),
    onSpawn: (child) => child.on("close", () => (closedAt = Date.now())),
  });
  const hopEvents = events.filter((event) => event.type === "hop");
  check("reports the resolved destination first", events[0]?.type === "resolved" && events[0].resolvedIp === FAKE_TARGET && events[0].destination === "example.test");
  check("hops stream before the process ends", hopEvents.length >= 4 && hopEvents[0].at < closedAt - 200, `${hopEvents[0]?.at} vs ${closedAt}`);
  check("destination reached", result.reached && result.outcome === "reached" && result.totalHops === 4);
  check("intermediate timeout doesn't fail the route", result.hops[2]?.status === "timeout" && result.reached);
  check("reverse DNS fills hostnames", result.hops[1]?.hostname === "core1.isp.test");
  check("hostname update is streamed", hopEvents.some((event) => event.hop.number === 2 && event.hop.hostname === "core1.isp.test"));
  check("raw output is kept", result.rawOutput.includes("Trace complete."));
  check("summary fields are present", result.destination === "example.test" && result.resolvedIp === FAKE_TARGET && result.durationMs > 0);
}

{
  const tool = fakeTool([
    ...HEADER,
    "  1    <1 ms    <1 ms    <1 ms  192.168.1.1",
    ...Array.from({ length: 8 }, (_, i) => `  ${i + 2}     *        *        *     Request timed out.`),
  ], { delayMs: 20, hang: true });
  const result = await runTraceroute("example.test", { ...baseOptions(tool), limits: { stopAfterTimeouts: 5 } });
  await sleep(100);
  check("stops early after 5 silent hops", result.outcome === "no-response" && result.totalHops === 6, `${result.outcome} ${result.totalHops}`);
  check("early stop kills the tool", !isAlive(tool.children[0].pid));
}

{
  const tool = fakeTool([...HEADER, "  1    <1 ms    <1 ms    <1 ms  192.168.1.1", "  2     5 ms     6 ms     5 ms  10.0.0.1"], {
    delayMs: 30,
    hang: true,
  });
  const controller = new AbortController();
  let hopCount = 0;
  const started = Date.now();
  const result = await runTraceroute("example.test", {
    ...baseOptions(tool),
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === "hop" && ++hopCount === 2) {
        setTimeout(() => controller.abort(), 50);
      }
    },
  });
  await sleep(100);
  check("cancel returns the partial result", result.outcome === "cancelled" && result.totalHops === 2 && !result.reached);
  check("cancel is prompt", Date.now() - started < 3000, `${Date.now() - started} ms`);
  check("cancel kills the tool process", !isAlive(tool.children[0].pid));
}

{
  const tool = fakeTool([], { hang: true });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const outcome = await expectError(runTraceroute("example.test", { ...baseOptions(tool), signal: controller.signal }), "CANCELLED");
  await sleep(100);
  check("cancel before any hop → CANCELLED", outcome.ok, outcome.detail);
  check("…and the process is gone", !isAlive(tool.children[0].pid));
  const already = new AbortController();
  already.abort();
  const early = await expectError(runTraceroute("example.test", { ...baseOptions(fakeTool([])), signal: already.signal }), "CANCELLED");
  check("already-cancelled signal never spawns", early.ok, early.detail);
}

{
  const tool = fakeTool([...HEADER, "  1    <1 ms    <1 ms    <1 ms  192.168.1.1"], { hang: true });
  const result = await runTraceroute("example.test", { ...baseOptions(tool), limits: { timeoutMs: 500 } });
  await sleep(100);
  check("overall timeout keeps partial hops", result.outcome === "timeout" && result.totalHops === 1);
  check("timeout kills the tool", !isAlive(tool.children[0].pid));
  const silent = fakeTool([], { hang: true });
  const outcome = await expectError(runTraceroute("example.test", { ...baseOptions(silent), limits: { timeoutMs: 300 } }), "TIMEOUT");
  check("timeout with no hops → TIMEOUT", outcome.ok, outcome.detail);
}

{
  const missing = await expectError(
    runTraceroute("example.test", {
      ...baseOptions(fakeTool([])),
      spawnImpl: (_file, args, options) => spawn("C:\\definitely\\missing\\tracert.exe", args, options),
    }),
    "COMMAND_UNAVAILABLE"
  );
  check("missing tool → COMMAND_UNAVAILABLE", missing.ok, missing.detail);
  const denied = await expectError(
    runTraceroute("example.test", { ...baseOptions(fakeTool([], { stderr: "socket: Operation not permitted\n", exitCode: 1 })), platform: "linux" }),
    "PERMISSION_DENIED"
  );
  check("permission error → PERMISSION_DENIED", denied.ok, denied.detail);
  const failed = await expectError(runTraceroute("example.test", baseOptions(fakeTool(["garbage"], { exitCode: 1 }))), "TRACE_FAILED");
  check("no hops and no known error → TRACE_FAILED", failed.ok, failed.detail);
  const unreachable = await runTraceroute(
    "example.test",
    baseOptions(fakeTool([...HEADER, "  1    <1 ms    <1 ms    <1 ms  192.168.1.1", "  2  192.168.1.1  reports: Destination host unreachable."]))
  );
  check("unreachable report → outcome unreachable", unreachable.outcome === "unreachable" && !unreachable.reached);
  const invalid = await expectError(runTraceroute("not a domain", baseOptions(fakeTool([]))), "INVALID_URL");
  check("invalid input never spawns", invalid.ok, invalid.detail);
}

console.log("\nService");
{
  const invalid = await tracerouteService.startTrace("exa mple", { requestId: "r0", emit: () => {} });
  check("service returns errors as data", invalid.result === null && invalid.error?.code === "INVALID_URL");
  check("cancel with nothing running", tracerouteService.cancelTrace("nope").cancelled === false);
}

// ---------------------------------------------------------------------------------------------
if (ONLINE) {
  console.log(`\nLive trace (${process.platform})`);
  {
    const events = [];
    const started = Date.now();
    const response = await tracerouteService.startTrace("https://example.com", {
      requestId: "live-1",
      emit: (event) => events.push({ ...event, at: Date.now() }),
    });
    const result = response.result;
    const firstHopAt = events.find((event) => event.type === "hop")?.at ?? Infinity;
    console.log(`       ${result?.totalHops ?? 0} hops, outcome ${result?.outcome}, ${result?.durationMs} ms`);
    for (const hop of result?.hops ?? []) {
      console.log(`       ${String(hop.number).padStart(2)}  ${hop.status.padEnd(11)} ${(hop.ip ?? "*").padEnd(16)} ${hop.latency ? `${hop.latency.avg} ms` : ""} ${hop.hostname ?? ""}`);
    }
    check("real trace returns hops", Boolean(result && result.totalHops > 0), JSON.stringify(response.error));
    check("real trace resolved an IP", Boolean(result?.resolvedIp));
    check("first hop streamed well before the end", firstHopAt < started + (result?.durationMs ?? 0) - 500);
    check("real trace reached example.com (or stopped cleanly)", ["reached", "no-response"].includes(result?.outcome), result?.outcome);
  }
  {
    const response = await tracerouteService.startTrace("no-such-host-tododesk-check.invalid", { requestId: "live-2", emit: () => {} });
    check("live DNS failure → DNS_FAILED", response.error?.code === "DNS_FAILED", JSON.stringify(response.error));
  }
  {
    let pid = null;
    const controller = new AbortController();
    const started = Date.now();
    const result = await runTraceroute("example.com", {
      signal: controller.signal,
      onSpawn: (child) => (pid = child.pid),
      onEvent: (event) => {
        if (event.type === "hop" && event.hop.number === 1) {
          controller.abort();
        }
      },
    }).catch((error) => ({ error }));
    await sleep(300);
    const alive = pid !== null && isAlive(pid);
    let listed = false;
    if (process.platform === "win32" && pid !== null) {
      const tasks = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" });
      listed = /tracert/i.test(tasks);
    }
    check("live cancel stops quickly", Date.now() - started < 8000, `${Date.now() - started} ms`);
    check("live cancel returns partial or CANCELLED", result.outcome === "cancelled" || result.error?.code === "CANCELLED", result.outcome ?? result.error?.code);
    check("live cancel leaves no tracert process", !alive && !listed, `pid ${pid} alive=${alive} listed=${listed}`);
  }
  {
    const first = tracerouteService.startTrace("example.com", { requestId: "busy-1", emit: () => {} });
    const second = await tracerouteService.startTrace("example.com", { requestId: "busy-2", emit: () => {} });
    check("second concurrent trace → BUSY", second.error?.code === "BUSY");
    check("cancel by request id", tracerouteService.cancelTrace("busy-1").cancelled === true);
    const firstResult = await first;
    check("cancelled service trace reports CANCELLED", firstResult.error?.code === "CANCELLED", JSON.stringify(firstResult.error));
  }
} else {
  console.log("\n(skipping live traces; pass --online to run them)");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll traceroute checks passed");
process.exit(failures ? 1 : 0);
