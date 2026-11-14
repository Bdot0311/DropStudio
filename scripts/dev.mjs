// `npm run dev`: starts the web UI and the background workers together.
import { venvReady, bold, cyan, yellow, red, has } from "./lib.mjs";

if (!venvReady()) {
  console.error(red(bold("\nDrop Studio isn't set up yet.")) + "\nRun " + bold("npm run setup") + " once, then " + bold("npm run dev") + ".\n");
  process.exit(1);
}
if (!has("ffmpeg")) {
  console.warn(yellow("Warning: FFmpeg not found. Analysis and rendering need it. On a Mac:  brew install ffmpeg"));
}

process.env.NEXT_TELEMETRY_DISABLED = "1";
const { default: concurrently } = await import("concurrently");

console.log(bold("\n  Drop Studio") + "  →  " + cyan("http://localhost:3000") + "\n");

const { result } = concurrently(
  [
    { command: "npm:dev:web", name: "web", prefixColor: "magenta" },
    { command: "npm:dev:py", name: "worker", prefixColor: "cyan" },
  ],
  { killOthersOn: ["failure"], restartTries: 3, restartDelay: 2000, prefix: "name" }
);
result.catch(() => process.exit(1));
