// `npm run dev`: starts the web UI and the Python worker, and keeps them running.
//
// A tiny supervisor instead of a generic process runner: if either process stops
// unexpectedly (for any reason, even a "clean" exit), we say so clearly, show why,
// and restart it, so the app at http://localhost:3000 doesn't silently disappear.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
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
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  console.error(red(bold(`\nNode ${process.versions.node} is too old.`)) + " Drop Studio needs Node 22.13 or newer.\nOn a Mac:  " + bold("brew install node") + "   then  " + bold("npm run setup") + "\n");
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

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  // node:sqlite prints an "experimental" notice on every start; it is stable enough for us.
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"].filter(Boolean).join(" "), FORCE_COLOR: process.stdout.isTTY ? "1" : "0" };

// Compiler: webpack by default. Next 16's Turbopack is faster but crashed on page
// navigation on macOS for us (likely the open-file limit or an iCloud-synced folder).
// Opt back in with:  npm run dev -- --turbo
const useTurbo = process.argv.includes("--turbo");
const nextArgs = ["dev", useTurbo ? "--turbopack" : "--webpack", "-p", String(PORT)];

// macOS Terminal allows only 256 open files per program by default; dev servers need far more.
const wrap = (cmd, args) =>
  IS_WIN ? [cmd, args] : ["/bin/sh", ["-c", 'ulimit -n 10240 2>/dev/null || ulimit -n 4096 2>/dev/null; exec "$0" "$@"', cmd, ...args]];

// Everything printed is also saved to data/logs/dev.log, to share when something breaks.
mkdirSync(path.join(ROOT, "data", "logs"), { recursive: true });
const LOG_PATH = path.join(ROOT, "data", "logs", "dev.log");
const logFile = createWriteStream(LOG_PATH, { flags: "w" });
const strip = (t) => t.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
const tee = (out) => ({ write: (t) => { out.write(t); logFile.write(strip(t)); } });
const OUT = tee(process.stdout);
const ERR = tee(process.stderr);

const [webCmd, webArgs] = wrap(nextBin, nextArgs);
const tsxBin = path.join(ROOT, "node_modules", ".bin", IS_WIN ? "tsx.cmd" : "tsx");
const [rCmd, rArgs] = wrap(tsxBin, ["node-worker/index.ts"]);
const [pyCmd, pyArgs] = wrap(PY, ["-m", "uvicorn", "worker.app:app", "--host", "127.0.0.1", "--port", WORKER_PORT, "--log-level", "warning"]);

const SERVICES = {
  web: { color: "\x1b[35m", cmd: webCmd, args: webArgs, env },
  render: { color: "\x1b[33m", cmd: rCmd, args: rArgs, env },
  worker: {
    color: "\x1b[36m",
    cmd: pyCmd,
    args: pyArgs,
    env: { ...pythonEnv(), ...env },
  },
};

let shuttingDown = false;
const children = new Map();
const restarts = { web: [], worker: [], render: [] };

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
  pipeLines(child.stdout, name, OUT);
  pipeLines(child.stderr, name, ERR);
  child.on("error", (e) => console.error(`${prefix(name)} ${red("could not start:")} ${e.message}`));
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    const why = signal ? `was killed by ${signal}` : `exited with code ${code}`;
    const now = Date.now();
    restarts[name] = restarts[name].filter((t) => now - t < RESTART_WINDOW_MS);
    if (restarts[name].length >= MAX_RESTARTS) {
      ERR.write(
        `\n${prefix(name)} ${red(bold(`stopped ${MAX_RESTARTS} times in a minute (${why}). Giving up.`))}\n` +
          `${prefix(name)} Scroll up for the first error, open http://localhost:${PORT}/health if the web app is up,\n` +
          `${prefix(name)} and send a screenshot of this window (or the file data/logs/dev.log) if you need help.\n`
      );
      shutdown(1);
      return;
    }
    restarts[name].push(now);
    ERR.write(`${prefix(name)} ${yellow(`stopped unexpectedly (${why}). Restarting in 2 s…`)}\n`);
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

OUT.write(`\n  ${bold("Drop Studio")}  →  ${cyan(`http://localhost:${PORT}`)}\n`);
OUT.write(dim(`  Node ${process.versions.node} · ${process.platform} ${process.arch} · ${os.release()} · ${ROOT}\n`));
OUT.write(dim(`  Compiler: ${useTurbo ? "Turbopack" : "webpack"} · log: data/logs/dev.log\n`));
const home = os.homedir();
if (process.platform === "darwin" && [path.join(home, "Desktop"), path.join(home, "Documents"), path.join(home, "Library", "Mobile Documents")].some((d) => ROOT.startsWith(d + path.sep))) {
  OUT.write(yellow("  Note: this folder may be synced by iCloud, which can break dev servers. If pages fail to load,\n  move the DropStudio folder to your home folder (e.g. ~/DropStudio) and run it from there.\n"));
}
console.log(dim("  Press Ctrl+C to stop.\n"));
start("worker");
start("render");
start("web");
