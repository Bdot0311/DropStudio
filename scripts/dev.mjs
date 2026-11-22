// `npm run dev`: starts the web UI and the Python worker, and keeps them running.
//
// A tiny supervisor instead of a generic process runner: if either process stops
// unexpectedly (for any reason, even a "clean" exit), we say so clearly, show why,
// and restart it, so the app at http://localhost:3000 doesn't silently disappear.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { ROOT, PY, venvReady, pythonEnv, bold, cyan, yellow, red, dim, has, IS_WIN } from "./lib.mjs";

const PORT = Number(process.env.PORT || 3000);
const WORKER_PORT = process.env.DROP_WORKER_PORT || "8765";
const MAX_RESTARTS = 5; // per process, within RESTART_WINDOW_MS
const RESTART_WINDOW_MS = 60_000;

if (!venvReady()) {
  console.error(red(bold("\nDrop Studio isn't set up yet.")) + "\nRun " + bold("npm run setup") + " once, then " + bold("npm run dev") + ".\n");
  process.exit(1);
}
const nextBin = path.join(ROOT, "node_modules", ".bin", IS_WIN ? "next.cmd" : "next");
if (!existsSync(nextBin)) {
  console.error(red(bold("\nWeb app packages are missing.")) + " Run " + bold("npm run setup") + " first.\n");
  process.exit(1);
}
if (!has("ffmpeg")) console.warn(yellow("Warning: FFmpeg not found. Analysis needs it. On a Mac:  brew install ffmpeg"));

const portFree = (port) =>
  new Promise((resolve) => {
    const srv = net.createServer().once("error", () => resolve(false)).once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port);
  });

for (const [port, what] of [[PORT, "web app"], [Number(WORKER_PORT), "analysis worker"]]) {
  if (!(await portFree(port))) {
    console.error(
      red(bold(`\nPort ${port} (${what}) is already in use.`)) +
        `\nAnother Drop Studio (or another app) is probably still running. Close that terminal window, or run:\n\n    ${bold(`lsof -ti tcp:${port} | xargs kill`)}\n\nthen ${bold("npm run dev")} again.\n`
    );
    process.exit(1);
  }
}

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: process.stdout.isTTY ? "1" : "0" };

const SERVICES = {
  web: { color: "\x1b[35m", cmd: nextBin, args: ["dev", "-p", String(PORT)], env },
  worker: {
    color: "\x1b[36m",
    cmd: PY,
    args: ["-m", "uvicorn", "worker.app:app", "--host", "127.0.0.1", "--port", WORKER_PORT, "--log-level", "warning"],
    env: { ...pythonEnv(), ...env },
  },
};

let shuttingDown = false;
const children = new Map();
const restarts = { web: [], worker: [] };

function prefix(name) {
  const tag = `[${name}]`.padEnd(9);
  return process.stdout.isTTY ? `${SERVICES[name].color}${tag}\x1b[0m` : tag;
}

function pipeLines(stream, name, out) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) out.write(`${prefix(name)} ${l}\n`);
  });
  stream.on("end", () => buf && out.write(`${prefix(name)} ${buf}\n`));
}

function start(name) {
  const s = SERVICES[name];
  // stdin is not passed through: neither process needs keyboard input.
  const child = spawn(s.cmd, s.args, { cwd: ROOT, env: s.env, stdio: ["ignore", "pipe", "pipe"] });
  children.set(name, child);
  pipeLines(child.stdout, name, process.stdout);
  pipeLines(child.stderr, name, process.stderr);
  child.on("error", (e) => console.error(`${prefix(name)} ${red("could not start:")} ${e.message}`));
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    const why = signal ? `was killed by ${signal}` : `exited with code ${code}`;
    const now = Date.now();
    restarts[name] = restarts[name].filter((t) => now - t < RESTART_WINDOW_MS);
    if (restarts[name].length >= MAX_RESTARTS) {
      console.error(
        `\n${prefix(name)} ${red(bold(`stopped ${MAX_RESTARTS} times in a minute (${why}). Giving up.`))}\n` +
          `${prefix(name)} Scroll up for the first error, open http://localhost:${PORT}/health if the web app is up,\n` +
          `${prefix(name)} and send a screenshot of this window if you need help.\n`
      );
      shutdown(1);
      return;
    }
    restarts[name].push(now);
    console.error(`${prefix(name)} ${yellow(`stopped unexpectedly (${why}). Restarting in 2 s…`)}`);
    setTimeout(() => !shuttingDown && start(name), 2000);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children.values()) c.kill("SIGTERM");
  setTimeout(() => {
    for (const c of children.values()) c.kill("SIGKILL");
    process.exit(code);
  }, 1500).unref();
  if (!children.size) process.exit(code);
  Promise.all([...children.values()].map((c) => new Promise((r) => c.once("exit", r)))).then(() => process.exit(code));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

console.log(`\n  ${bold("Drop Studio")}  →  ${cyan(`http://localhost:${PORT}`)}`);
console.log(dim(`  Node ${process.versions.node} · ${process.platform} ${process.arch} · ${ROOT}`));
console.log(dim("  Press Ctrl+C to stop.\n"));
start("worker");
start("web");
