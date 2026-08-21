import http from "http";
import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

function ping() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:5173/", (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

const deadline = Date.now() + 40000;
while (!(await ping())) {
  if (Date.now() > deadline) {
    console.error("Timed out waiting for Vite on http://127.0.0.1:5173");
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_DEV: "1" },
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
