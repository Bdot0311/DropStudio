// Starts the Python analysis worker (FastAPI on 127.0.0.1:8765 + job loop).
import { spawnPython, venvReady, red, bold } from "./lib.mjs";

if (!venvReady()) {
  console.error(red(bold("Python worker not installed.")) + " Run " + bold("npm run setup") + " first, then " + bold("npm run dev") + ".");
  process.exit(1);
}
const port = process.env.DROP_WORKER_PORT || "8765";
const child = spawnPython(["-m", "uvicorn", "worker.app:app", "--host", "127.0.0.1", "--port", port, "--log-level", "warning"]);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 1));
