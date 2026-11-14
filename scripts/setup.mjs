// `npm run setup`: one-time install of everything Drop Studio needs.
//   npm run setup                      core install
//   npm run setup -- --with-stems      + Demucs stem separation (~1 GB download, uses the Apple GPU)
//   npm run setup -- --with-allin1     + allin1 structure analyzer (experimental on Mac)
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ROOT, PY, VENV, has, run, capture, bold, green, yellow, red, dim, IS_WIN } from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const isMac = process.platform === "darwin";
const results = [];
const ok = (name, note = "") => { results.push([true, name, note]); console.log(green("  ✓ ") + name + (note ? dim("  " + note) : "")); };
const warn = (name, note) => { results.push([null, name, note]); console.log(yellow("  ! ") + name + "  " + note); };
const fail = (name, fix) => { results.push([false, name, fix]); console.log(red("  ✗ ") + name + "\n      " + fix); };
const step = (s) => console.log("\n" + bold(s));

console.log(bold("\nDrop Studio setup\n") + dim(ROOT));

// 1. Node
step("1. Node.js");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 20 || (major === 20 && minor >= 9)) ok(`Node ${process.versions.node}`);
else { fail(`Node ${process.versions.node} is too old`, "Install Node 20 or newer: https://nodejs.org (or `brew install node`)"); finish(); }

// 2. FFmpeg
step("2. FFmpeg");
if (!has("ffmpeg") && isMac && has("brew")) {
  console.log(dim("  Installing FFmpeg with Homebrew (one time, a few minutes)..."));
  run("brew", ["install", "ffmpeg"]);
}
if (has("ffmpeg") && has("ffprobe")) ok("FFmpeg", (capture("ffmpeg", ["-version"]) || "").split("\n")[0].replace("ffmpeg version ", "v").split(" ")[0]);
else fail("FFmpeg not found", isMac ? "Install Homebrew (https://brew.sh), then run:  brew install ffmpeg" : "Install FFmpeg from https://ffmpeg.org/download.html");

// 3. uv (Python manager: installs the right Python version without touching your system Python)
step("3. uv (Python manager)");
if (!has("uv")) {
  if (isMac && has("brew")) { console.log(dim("  Installing uv with Homebrew...")); run("brew", ["install", "uv"]); }
  else if (!IS_WIN) { console.log(dim("  Installing uv...")); run("sh", ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"]); }
}
const uv = has("uv") ? "uv" : [path.join(process.env.HOME || "", ".local/bin/uv"), path.join(process.env.HOME || "", ".cargo/bin/uv")].find(existsSync);
if (uv) ok("uv", capture(uv, ["--version"]) || "");
else { fail("uv not found", "Install it with:  brew install uv   (or see https://docs.astral.sh/uv/)"); finish(); }

// 4. Node packages
step("4. Web app packages");
if (run("npm", ["install", "--no-audit", "--no-fund"])) ok("npm packages");
else fail("npm install failed", "Scroll up for the error. Deleting node_modules and running `npm run setup` again usually fixes it.");

// 5. Python worker
step("5. Python analysis worker");
if (!existsSync(PY)) {
  run(uv, ["venv", "--python", "3.11", VENV]);
}
if (!existsSync(PY)) { fail("Could not create the Python 3.11 environment", "Run `uv python install 3.11` and try again."); finish(); }
if (run(uv, ["pip", "install", "--python", PY, "-r", "worker/requirements.txt"])) ok("Python 3.11 + librosa + FastAPI");
else fail("Python packages failed to install", "Scroll up for the error, then run `npm run setup` again.");

if (args.has("--with-stems")) {
  console.log(dim("  Installing Demucs + PyTorch (large download)..."));
  if (run(uv, ["pip", "install", "--python", PY, "-r", "worker/requirements-stems.txt"])) ok("Demucs stem separation", isMac ? "will use the Apple GPU (MPS)" : "");
  else warn("Demucs failed to install", "Stems stay off. Everything else works without them.");
} else {
  console.log(dim("  Stem separation (Demucs) skipped. Add it any time:  npm run setup -- --with-stems"));
}

if (args.has("--with-allin1")) {
  console.log(dim("  Trying allin1 (needs NATTEN + madmom; often fails on Mac, and that's fine)..."));
  const okA = run(uv, ["pip", "install", "--python", PY, "-r", "worker/requirements-stems.txt"]) &&
    run(uv, ["pip", "install", "--python", PY, "git+https://github.com/CPJKU/madmom", "natten", "allin1"]);
  if (okA && run(PY, ["-c", "import allin1"])) ok("allin1");
  else warn("allin1 not available", "Drop Studio uses its built-in librosa analyzer instead. Results are tuned for EDM either way.");
}

// 6. Folders + smoke test
step("6. Final checks");
for (const d of ["data", "projects"]) mkdirSync(path.join(ROOT, d), { recursive: true });
if (run(PY, ["-c", "import librosa, fastapi, numpy; print('    analysis libraries import OK')"])) ok("Worker imports");
else fail("Worker can't import its libraries", "Delete worker/.venv and run `npm run setup` again.");

finish();

function finish() {
  const failed = results.filter((r) => r[0] === false);
  console.log("");
  if (failed.length) {
    console.log(red(bold(`Setup finished with ${failed.length} problem(s):`)));
    for (const [, name, fix] of failed) console.log(red("  ✗ ") + name + "\n      " + fix);
    process.exit(1);
  }
  console.log(green(bold("All set.")) + " Start Drop Studio with:\n\n    " + bold("npm run dev") + "\n\nthen open " + bold("http://localhost:3000") + "\n");
  process.exit(0);
}
